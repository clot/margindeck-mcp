import { Bridge, run } from './bridge.js';
import { credentialProvider, SetupError } from './credentials.js';

async function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--app' || !args[1])) {
    throw new SetupError('Usage: node server/index.js [--app /Applications/MarginDeck.app]');
  }
  // Lazy credentials: merely starting the extension never reads the ledger.
  const credential = credentialProvider(args[1] ?? '/Applications/MarginDeck.app');
  await run(new Bridge({ credential }), process.stdin, process.stdout);
}

process.stdout.on('error', () => process.exit(1));
main().catch(error => {
  process.stderr.write((error instanceof SetupError ? error.message : 'MarginDeck MCP connection closed. Reconnect from Claude.') + '\n');
  process.exitCode = 1;
});
