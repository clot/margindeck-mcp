import { mkdtemp, mkdir, cp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const root = fileURLToPath(new URL('../', import.meta.url));
const staging = await mkdtemp(join(tmpdir(), 'margindeck-mcpb-'));
try {
  const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
  // Explicit allowlist: no dev dependencies, tests, credentials or app binaries.
  for (const file of ['manifest.json', 'package.json', 'server', 'mcpb-resources', 'LICENSE', 'README.md', 'README.zh-CN.md', 'PRIVACY.md', 'docs/submission.md']) {
    await cp(join(root, file), join(staging, file), { recursive: true });
  }
  const bin = JSON.parse(await readFile(join(root, 'node_modules/@anthropic-ai/mcpb/package.json'), 'utf8')).bin;
  const cli = resolve(root, 'node_modules/@anthropic-ai/mcpb', typeof bin === 'string' ? bin : bin.mcpb);
  await execFile(process.execPath, [cli, 'validate', join(staging, 'manifest.json')]);
  await mkdir(join(root, 'dist'), { recursive: true });
  const output = join(root, 'dist', `margindeck-${manifest.version}.mcpb`);
  const result = await execFile(process.execPath, [cli, 'pack', staging, output]);
  process.stdout.write(result.stdout);
} finally {
  await rm(staging, { recursive: true, force: true });
}
