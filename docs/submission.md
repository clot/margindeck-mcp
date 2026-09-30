# Claude Desktop extension submission

This repository follows the stated submission preferences: public GitHub source, MIT license, a Node.js implementation, and a manifest author URL pointing to https://github.com/clot. Inclusion remains Anthropic's decision. Do not represent this as an approved listing.

## Suggested form fields

- Extension: **MarginDeck**
- Existing extension update: **No**, unless updating an existing directory listing.
- Primary contact: the developer's real name and monitored contact email.
- GitHub: **https://github.com/clot/margindeck-mcp**
- Primary party: **Yes** when submitted by the MarginDeck developer/owner.
- Attachment: the tested `dist/margindeck-0.1.0.mcpb` produced from the reviewed commit.
- Terms: the submitting developer must read and accept the current terms personally.

Description (under 50 words):

> MarginDeck connects Claude to a local-first Mac business dashboard. With user approval, it reads product revenue, costs, estimated contribution profit, and cash runway. Proposed record changes require confirmation in MarginDeck. Requires the MarginDeck Mac app to be installed, running, and paired.

Implementation disclosure / feedback:

> The extension's MCP transport is implemented in Node.js and is MIT licensed. It requires the separately installed MarginDeck macOS app. To preserve the app's authorization boundary, it calls the app's signed native helper for short-lived credentials. App binaries are not bundled. Financial reads require pairing approval; proposed record changes require in-app confirmation.

## Before submitting the attachment

- Run `npm ci --ignore-scripts` and `npm run check`.
- Inspect the archive: manifest, public source, translations, license and documentation only. No app binaries, credentials, ledger data, tests, or development dependencies.
- Install this exact Node.js `.mcpb` in Claude Desktop on a Mac with signed MarginDeck 1.6.0 or later.
- Confirm `get_status`, pending pairing, approval, financial reads with a synthetic ledger, and proposed record review.
- Confirm rejection before approval and after revocation. Confirm expired authorization leads to fresh pairing.
- Confirm helpful failure when the app is missing/closed, MCP is disabled, the app location is wrong, or the helper signature is invalid.
- Confirm app update/move, extension restart/uninstall, supported macOS versions and Intel/Apple silicon support before making compatibility claims beyond the manifest's macOS restriction.
- Record the tested app/Claude/macOS versions and the attachment's SHA-256. Automated fixture tests alone do not establish production app compatibility.

The Node.js package's manual Claude Desktop / production-app checks remain pending. The existing app's binary-extension test results are not substitutes for testing this package.
