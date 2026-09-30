import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { isAbsolute, join, normalize } from 'node:path';

const execFile = promisify(execFileCallback);
const team = '3LJGT9578H';
// codesign treats an unprefixed requirement as a filename; '=' means source text.
const requirement = identifier => `=anchor apple generic and identifier "${identifier}"`;

export class SetupError extends Error {}

// The signed app remains responsible for XPC identity and user authorization.
// Do not replace this with an unsigned helper, stored token or shell command.
export function credentialProvider(appPath, { platform = process.platform, execute = execFile } = {}) {
  let verified = false;
  if (platform !== 'darwin') throw new SetupError('MarginDeck requires macOS 14 or later.');
  if (!isAbsolute(appPath) || !normalize(appPath).endsWith('.app')) {
    throw new SetupError('Choose the full path to your installed MarginDeck.app.');
  }
  const app = normalize(appPath);
  const helper = join(app, 'Contents/Library/Helpers/MCPHeaders.app');
  const options = { timeout: 7000, maxBuffer: 16384, encoding: 'utf8', windowsHide: true };
  async function verify(bundle, identifier) {
    await execute('/usr/bin/codesign', ['--verify', '--strict', '--all-architectures', '-R', requirement(identifier), bundle], options);
    // App Store re-signing does not preserve the developer certificate's OU.
    // Check TeamIdentifier in the verified CodeDirectory instead of leaf OU.
    const { stderr } = await execute('/usr/bin/codesign', ['-d', '--verbose=4', bundle], options);
    if (!stderr.split(/\r?\n/).includes(`TeamIdentifier=${team}`)) throw new Error();
  }
  return async () => {
    if (!verified) {
      try {
        await verify(app, 'com.fiveupclub.MarginDeck');
        await verify(helper, 'com.fiveupclub.MarginDeck.MCP.Headers');
        const { stdout } = await execute('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', join(app, 'Contents/Info.plist')], options);
        const version = stdout.trim();
        if (!/^\d+\.\d+(?:\.\d+)?$/.test(version)) throw new Error();
        const [major, minor] = version.split('.').map(Number);
        if (major < 1 || (major === 1 && minor < 6)) throw new Error();
        verified = true;
      } catch {
        throw new SetupError('Install a signed MarginDeck 1.6.0 or later and check the app location in this extension\'s settings.');
      }
    }
    try {
      const { stdout } = await execute(join(helper, 'Contents/MacOS/MCPHeaders'), ['headers'], options);
      const headers = JSON.parse(stdout);
      const value = headers?.Authorization;
      if (typeof value !== 'string' || !/^Bearer [a-f0-9]{64}$/.test(value)) throw new Error();
      return value.slice(7);
    } catch {
      // Helper stdout can contain a credential. Never pass through output/errors.
      throw new SetupError('Open MarginDeck and enable MCP in AI Connections, then retry and approve the pairing in MarginDeck.');
    }
  };
}
