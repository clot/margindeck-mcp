import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Readable, Writable } from 'node:stream';
import { randomBytes } from 'node:crypto';
import { Bridge, localPost, lines, run, MAX_REQUEST_BYTES, MAX_RESPONSE_BYTES } from '../server/bridge.js';
import { credentialProvider } from '../server/credentials.js';

// Synthetic credentials are generated per test, never taken from an installed app.
const token = () => randomBytes(32).toString('hex');
const rpc = (id, method = 'tools/list', params) => JSON.stringify({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) });
const response = (id, result = {}) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id, result }) });
const initialize = () => rpc(1, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } });

test('lazy credential acquisition, reuse and exact financial JSON preservation', async () => {
  let acquired = 0;
  const seen = [];
  const bearer = token();
  const bridge = new Bridge({ credential: async () => { acquired++; return bearer; }, post: async (body, auth, version) => {
    seen.push({ body, auth, version });
    if (JSON.parse(body).method === 'initialize') return response(1, { protocolVersion: '2025-03-26' });
    return { status: 200, contentType: 'application/json; charset=utf-8', body: '{\n "jsonrpc": "2.0", "id": "read", "result": { "amount": 12345678901234567890.123456789, "text": "a b\\n\\\"c" }\n}' };
  } });
  assert.equal(acquired, 0);
  await bridge.forward(initialize());
  const output = await bridge.forward(rpc('read'));
  assert.equal(acquired, 1);
  assert.equal(seen[1].version, '2025-03-26');
  assert.equal(seen[1].auth, bearer);
  assert.ok(output.includes('12345678901234567890.123456789'));
  assert.equal(JSON.parse(output).result.text, 'a b\n"c');
  assert.ok(!output.includes('\n'));
});

test('401/403 refresh once, replay initialization, and return new pending pairing', async () => {
  for (const rejectedStatus of [401, 403]) {
    let acquired = 0;
    const calls = [];
    const credentials = [token(), token()];
    const bridge = new Bridge({ credential: async () => credentials[acquired++], post: async (body, bearer) => {
      const request = JSON.parse(body);
      calls.push({ method: request.method, bearer });
      if (request.method === 'initialize') return response(1, { protocolVersion: '2025-03-26' });
      if (bearer === credentials[0]) return { status: rejectedStatus, body: '' };
      return response(2, { status: 'pending' });
    } });
    await bridge.forward(initialize());
    assert.equal(JSON.parse(await bridge.forward(rpc(2, 'tools/call', { name: 'get_status' }))).result.status, 'pending');
    assert.equal(acquired, 2);
    assert.deepEqual(calls.map(c => c.method), ['initialize', 'tools/call', 'initialize', 'tools/call']);
    assert.equal(calls[2].bearer, credentials[1]);
  }
});

test('repeated authorization failure is bounded', async () => {
  let acquired = 0;
  let calls = 0;
  const bridge = new Bridge({ credential: async () => { acquired++; return token(); }, post: async () => { calls++; return { status: 401 }; } });
  assert.equal(JSON.parse(await bridge.forward(rpc(1))).error.code, -32000);
  assert.equal(acquired, 2);
  assert.equal(calls, 2);
});

test('never retry uncertain writes, redirects or server errors; redact details', async () => {
  for (const kind of ['lost-response', 302, 500]) {
    let calls = 0;
    const secret = token();
    const bridge = new Bridge({ credential: async () => secret, post: async () => {
      calls++;
      if (kind === 'lost-response') throw new Error(secret);
      return { status: kind, contentType: 'application/json', body: secret };
    } });
    const output = await bridge.forward(rpc(2, 'tools/call', { name: 'synthetic_write' }));
    assert.equal(calls, 1);
    assert.ok(output.includes('get_operation'));
    assert.ok(!output.includes(secret));
  }
});

test('invalid requests do not acquire credentials; notifications produce no response', async () => {
  let acquired = 0;
  const bridge = new Bridge({ credential: async () => { acquired++; throw new Error(); } });
  for (const input of ['{', '[]', 'null', rpc(null), rpc(true), rpc(9007199254740992), rpc(1, 'x', null)]) {
    assert.ok(JSON.parse(await bridge.forward(input)).error);
  }
  assert.equal(acquired, 0);
  assert.equal(await bridge.forward(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })), null);
  assert.equal(acquired, 1);
});

test('mismatched IDs, invalid content types, oversized and ambiguous replies are rejected', async () => {
  const invalid = [response(99), { ...response(1), contentType: 'text/html' }, { ...response(1), body: 'x'.repeat(MAX_RESPONSE_BYTES + 1) },
    { ...response(1), body: '{"jsonrpc":"2.0","id":1,"result":{},"error":{}}' }];
  for (const reply of invalid) {
    const bridge = new Bridge({ credential: async () => token(), post: async () => reply });
    assert.equal(JSON.parse(await bridge.forward(rpc(1))).error.code, -32000);
  }
});

test('bounded line framing supports CRLF and UTF-8 across chunks; partial EOF is not dispatched', async () => {
  const raw = Buffer.from(rpc('中文') + '\r\n\n' + rpc(2) + '\n');
  const received = [];
  for await (const line of lines(Readable.from([...raw].map(byte => Buffer.from([byte]))))) received.push(JSON.parse(line).id);
  assert.deepEqual(received, ['中文', 2]);
  for (const input of ['x'.repeat(MAX_REQUEST_BYTES + 1) + '\n', rpc(1)]) {
    let delivered = 0;
    await assert.rejects(async () => { for await (const line of lines(Readable.from([input]))) { delivered++; } });
    assert.equal(delivered, 0);
  }
});

test('stdio runner returns only JSON-RPC and processes one request at a time', async () => {
  let active = 0;
  let output = '';
  const bridge = new Bridge({ credential: async () => token(), post: async body => {
    assert.equal(++active, 1);
    await new Promise(resolve => setImmediate(resolve));
    active--;
    return response(JSON.parse(body).id);
  } });
  const sink = new Writable({ write(chunk, encoding, callback) { output += chunk; callback(); } });
  await run(bridge, Readable.from([rpc(1) + '\n' + rpc(2) + '\n']), sink);
  assert.deepEqual(output.trim().split('\n').map(line => JSON.parse(line).id), [1, 2]);
});

async function fixture(t, handler) {
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return server.address().port;
}

test('real loopback HTTP request preserves request, credential and protocol headers', async t => {
  const bearer = token();
  const port = await fixture(t, async (request, reply) => {
    assert.equal(request.url, '/mcp');
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.authorization, `Bearer ${bearer}`);
    assert.equal(request.headers['mcp-protocol-version'], '2025-03-26');
    let body = '';
    for await (const chunk of request) body += chunk;
    assert.equal(body, rpc(1));
    reply.writeHead(200, { 'Content-Type': 'application/json' });
    reply.end(response(1).body);
  });
  assert.equal((await localPost({ port })(rpc(1), bearer, '2025-03-26')).status, 200);
});

test('HTTP never follows redirects or sends another request', async t => {
  let visits = 0;
  const port = await fixture(t, (request, reply) => {
    visits++;
    reply.writeHead(302, { Location: '/should-not-visit' });
    reply.end();
  });
  assert.equal((await localPost({ port })(rpc(1), token())).status, 302);
  assert.equal(visits, 1);
});

test('HTTP enforces timeout and response size limits', async t => {
  const hanging = await fixture(t, () => {});
  await assert.rejects(localPost({ port: hanging, timeoutMs: 30 })(rpc(1), token()));
  const large = await fixture(t, (request, reply) => { reply.writeHead(200); reply.end(Buffer.alloc(MAX_RESPONSE_BYTES + 1)); });
  await assert.rejects(localPost({ port: large })(rpc(1), token()));
});

test('credential helper identity/version validation; no shell or stdio delegation', async () => {
  const calls = [];
  const bearer = token();
  const provider = credentialProvider('/Applications/Example Path/MarginDeck.app', { platform: 'darwin', execute: async (file, args, options) => {
    calls.push({ file, args, options });
    if (file.endsWith('codesign')) return { stdout: '', stderr: 'TeamIdentifier=3LJGT9578H\n' };
    if (file.endsWith('PlistBuddy')) return { stdout: '1.6.0\n' };
    if (file.endsWith('MCPHeaders')) return { stdout: JSON.stringify({ Authorization: `Bearer ${bearer}` }) };
    return { stdout: '' };
  } });
  assert.equal(calls.length, 0);
  assert.equal(await provider(), bearer);
  assert.equal(calls.filter(call => call.file.endsWith('codesign') && call.args[0] === '--verify').length, 2);
  assert.deepEqual(calls.at(-1).args, ['headers']);
  assert.equal(calls.at(-1).options.shell, undefined);
  assert.ok(calls[2].args.includes('=anchor apple generic and identifier "com.fiveupclub.MarginDeck.MCP.Headers"'));
});

test('unsupported platform, old app, failed signature and invalid credential fail closed', async () => {
  assert.throws(() => credentialProvider('/Applications/MarginDeck.app', { platform: 'win32' }));
  assert.throws(() => credentialProvider('relative.app', { platform: 'darwin' }));
  for (const kind of ['signature', 'team', 'version', 'credential']) {
    let helperCalls = 0;
    const secret = token();
    const provider = credentialProvider('/Applications/MarginDeck.app', { platform: 'darwin', execute: async file => {
      if (file.endsWith('codesign') && kind === 'signature') throw new Error(secret);
      if (file.endsWith('codesign')) return { stdout: '', stderr: `TeamIdentifier=${kind === 'team' ? 'WRONGTEAM' : '3LJGT9578H'}\n` };
      if (file.endsWith('PlistBuddy')) return { stdout: kind === 'version' ? '1.5.1' : '1.6.0' };
      if (file.endsWith('MCPHeaders')) { helperCalls++; return { stdout: JSON.stringify({ Authorization: secret }) }; }
      return { stdout: '' };
    } });
    await assert.rejects(provider(), error => !error.message.includes(secret));
    assert.equal(helperCalls, kind === 'credential' ? 1 : 0);
  }
});
