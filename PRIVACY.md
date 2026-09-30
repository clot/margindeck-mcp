# Connector data handling

This document describes the Node.js connector in this repository. The MarginDeck app's privacy policy is at https://www.margindeck.app/privacy. Claude's processing is governed by the terms and policies applicable to the user's Claude account.

- The connector transports requests from Claude to the running MarginDeck app and returns its responses. Authorized responses can contain financial records, product/service names, user-entered text, and rendered images.
- Ledger storage remains managed by MarginDeck. Data returned to Claude is disclosed to Claude and may leave the Mac. This is not an offline AI system.
- There is no connector account, cloud relay, telemetry, analytics, or direct external network connection in this code. HTTP requests use the fixed loopback address `127.0.0.1:39983`.
- The connector executes the signed credential helper in the user-selected MarginDeck installation. It validates the signing identities first. The helper obtains a short-lived credential through the app's XPC service. Credentials are retained only in process memory; there is no token configuration file, token CLI argument, or credential logging.
- The app remains responsible for pairing approval, entitlement checks, operation authorization, and review before record changes. New credentials require new approval. The connector never approves its own access.
- The connector does not write request/response contents to disk. Claude and MarginDeck can retain their own records under their policies; this connector makes no claim about deleting those records.
- Error messages are fixed and omit helper output, tokens, HTTP response bodies, and paths. Avoid attaching private financial data or credentials when reporting an issue.

Disable MCP or revoke the client's authorization in MarginDeck to stop its access. Removing this extension does not delete MarginDeck data or previous conversations in Claude.
