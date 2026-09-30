import http from 'node:http';
import { SetupError } from './credentials.js';

export const MAX_REQUEST_BYTES = 64 * 1024;
export const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const failure = 'MarginDeck could not complete the request. Check AI Connections in MarginDeck. If a record may have been saved, check get_operation before submitting it again.';
const validID = id => typeof id === 'string' || (typeof id === 'number' && Number.isSafeInteger(id));
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const rpcError = (id, code, message) => JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });

// Remove only JSON whitespace outside strings, preserving decimal values exactly.
export function compactJSON(raw) {
  let quoted = false;
  let escaped = false;
  let result = '';
  for (const char of raw) {
    if (quoted) {
      result += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') {
      quoted = true;
      result += char;
    } else if (!' \r\n\t'.includes(char)) result += char;
  }
  return result;
}

// Production uses this fixed loopback endpoint. Port injection is only for tests;
// no CLI/config/environment setting can redirect credentials to another host.
export function localPost({ port = 39983, timeoutMs = 20000 } = {}) {
  const agent = new http.Agent({ keepAlive: false, proxyEnv: {} });
  return (body, bearer, protocolVersion) => new Promise((resolve, reject) => {
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${bearer}`,
      'Content-Length': Buffer.byteLength(body)
    };
    if (protocolVersion) headers['MCP-Protocol-Version'] = protocolVersion;
    const request = http.request({
      hostname: '127.0.0.1', port, path: '/mcp', method: 'POST', headers, agent
    });
    const timer = setTimeout(() => request.destroy(new Error('Request timed out')), timeoutMs);
    request.on('error', reject);
    request.on('close', () => clearTimeout(timer));
    request.on('response', response => {
      const chunks = [];
      let length = 0;
      response.on('error', reject);
      response.on('data', chunk => {
        length += chunk.length;
        if (length > MAX_RESPONSE_BYTES) {
          response.destroy(new Error('Response too large'));
          request.destroy();
        } else chunks.push(chunk);
      });
      response.on('end', () => resolve({
        status: response.statusCode,
        contentType: response.headers['content-type'],
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    request.end(body);
  });
}

export class Bridge {
  #bearer;
  #initialization;
  #protocolVersion;
  #busy = false;
  constructor({ credential, post = localPost() }) {
    this.credential = credential;
    this.post = post;
  }
  async #refresh() {
    this.#bearer = undefined;
    const value = await this.credential();
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error();
    this.#bearer = value;
  }
  #send(body) { return this.post(body, this.#bearer, this.#protocolVersion); }
  #validate(response, request) {
    if (response.status !== 200 || response.contentType?.split(';')[0].trim().toLowerCase() !== 'application/json'
        || Buffer.byteLength(response.body) > MAX_RESPONSE_BYTES) throw new Error();
    const object = JSON.parse(response.body);
    if (!object || object.jsonrpc !== '2.0' || object.id !== request.id
        || has(object, 'result') === has(object, 'error')) throw new Error();
    if (request.method === 'initialize' && has(object, 'result')) {
      const version = object.result?.protocolVersion;
      if (typeof version !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(version)) throw new Error();
      this.#protocolVersion = version;
    }
    return compactJSON(response.body);
  }
  async forward(body) {
    if (Buffer.byteLength(body) > MAX_REQUEST_BYTES) return rpcError(null, -32600, 'MCP request is too large.');
    let request;
    try { request = JSON.parse(body); }
    catch { return rpcError(null, -32700, 'Invalid JSON-RPC message.'); }
    if (!request || Array.isArray(request) || request.jsonrpc !== '2.0'
        || typeof request.method !== 'string' || !request.method
        || (has(request, 'id') && !validID(request.id))
        || (has(request, 'params') && (request.params === null || typeof request.params !== 'object'))) {
      return rpcError(null, -32600, 'Invalid JSON-RPC request.');
    }
    const notification = !has(request, 'id');
    if (this.#busy) return notification ? null : rpcError(request.id, -32000, 'MCP connection is busy.');
    this.#busy = true;
    try {
      if (!this.#bearer) await this.#refresh();
      let response = await this.#send(body);
      if (response.status === 401 || response.status === 403) {
        // The app rejects these at its HTTP auth gate before dispatch. Only this
        // explicit rejection is retried, never a timeout, lost reply or HTTP 500.
        await this.#refresh();
        if (request.method !== 'initialize' && this.#initialization) {
          const handshake = await this.#send(this.#initialization);
          const replay = JSON.parse(this.#initialization);
          this.#validate(handshake, replay);
          if (!has(JSON.parse(handshake.body), 'result')) throw new Error();
        }
        response = await this.#send(body);
      }
      if (notification) return null;
      const output = this.#validate(response, request);
      if (request.method === 'initialize' && has(JSON.parse(output), 'result')) this.#initialization = body;
      return output;
    } catch (error) {
      return notification ? null : rpcError(request.id, -32000, error instanceof SetupError ? error.message : failure);
    } finally {
      this.#busy = false;
    }
  }
}

// Bounded framing plus sequential dispatch provides pipe backpressure. EOF does
// not dispatch an incomplete line. Empty lines are ignored; CRLF is supported.
export async function* lines(input) {
  let pending = Buffer.alloc(0);
  for await (const chunk of input) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    let start = 0;
    for (let index = 0; index < bytes.length; index++) {
      if (bytes[index] !== 10) continue;
      let line = Buffer.concat([pending, bytes.subarray(start, index)]);
      if (line.at(-1) === 13) line = line.subarray(0, -1);
      if (line.length > MAX_REQUEST_BYTES) throw new Error('Request too large');
      if (line.length) yield line.toString('utf8');
      pending = Buffer.alloc(0);
      start = index + 1;
    }
    pending = Buffer.concat([pending, bytes.subarray(start)]);
    if (pending.length > MAX_REQUEST_BYTES + 1 || (pending.length > MAX_REQUEST_BYTES && pending.at(-1) !== 13)) {
      throw new Error('Request too large');
    }
  }
  if (pending.length) throw new Error('Incomplete request');
}

export async function run(bridge, input, output) {
  for await (const line of lines(input)) {
    const response = await bridge.forward(line);
    if (response !== null) await new Promise((resolve, reject) => {
      output.write(response + '\n', error => error ? reject(error) : resolve());
    });
  }
}
