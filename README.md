# MarginDeck MCP

[简体中文](README.zh-CN.md) · [MarginDeck](https://www.margindeck.app) · [Support](https://github.com/clot/margindeck-mcp/issues)

A Node.js desktop extension that connects Claude Desktop to the **installed MarginDeck Mac app**. Ask about recorded product revenue, costs, estimated contribution profit, and cash runway. Financial reads require pairing approval in MarginDeck; proposed record changes require separate review before saving.

## Status

Initial connector version: **0.1.0**. This repository is prepared for a Claude Desktop extension directory application. It is **not an Anthropic-approved or listed extension**. Automated tests use synthetic data. A manual installation and pairing test of this Node.js package with Claude Desktop and the signed production app remains required before submitting the package; see [the review checklist](docs/submission.md).

## Requirements

- macOS 14 or later. Windows and Linux are not supported.
- MarginDeck **1.6.0 or later**, installed and running with MCP enabled in **AI Connections**. Obtain the app through [the official website](https://www.margindeck.app).
- Claude Desktop with desktop extension support. This is a local extension, not a remote connector for claude.ai or mobile.
- Claude Desktop supplies the Node.js runtime for Node extensions. Development and manual CLI use require Node.js 20 or later.

**Installing this extension does not install or open MarginDeck, unlock Pro, or approve a connection.** The app's normal entitlement and operation limits apply. This extension is separate from the binary extension exported by the app; install only one MarginDeck extension to avoid duplicate tools and pairing requests.

## Build and install

```sh
git clone https://github.com/clot/margindeck-mcp.git
cd margindeck-mcp
npm ci --ignore-scripts
npm run check
```

The build writes `dist/margindeck-0.1.0.mcpb`. There are **no third-party runtime dependencies**. The pinned MCPB development dependency validates and packages the bundle; it is not shipped in the extension. Its transitive `tmp` dependency is overridden to 0.2.7 to address known temporary-path vulnerabilities.

1. Open MarginDeck and enable MCP in **AI Connections**.
2. In Claude Desktop, go to **Settings → Extensions → Advanced settings → Install Extension…**, then select the `.mcpb` file.
3. Set **MarginDeck app location** to the installed `.app`, normally `/Applications/MarginDeck.app`.
4. Ask Claude to call MarginDeck's `get_status` tool. Compare the pairing code and approve that client in MarginDeck.
5. Ask a financial question. Review proposed record changes in MarginDeck before confirming them.

Example prompts:

- “Summarize my recorded revenue and costs for this month.”
- “Compare the estimated contribution profit of my products.”
- “Explain my cash runway using the cash and recurring costs recorded in MarginDeck.”

Contribution profit is an operational estimate. Cash runway is a planning forecast based on recorded data, not a live bank balance or guarantee. The app computes these values; this connector does not invent or recalculate them.

## How it works

```text
Claude Desktop
  → Node.js extension (stdio JSON-RPC)
  → MarginDeck's authenticated loopback MCP endpoint
  → MarginDeck's authorized tools and in-app record review

Credentials: Node.js → signed MCPHeaders helper in the installed app
                    → MarginDeck's signed XPC service
```

The Node.js code implements bounded line framing, HTTP forwarding, protocol negotiation, response validation, timeouts, and credential refresh. It calls the app's native `MCPHeaders headers` helper only to obtain a short-lived credential. The connector does **not** launch the helper's `stdio` implementation or wrap a hidden binary MCP server.

The helper is an explicit native dependency supplied by the separately installed MarginDeck app. It is not redistributed here. App and helper signing identities are checked before invoking it. The user grants financial access in the app. A new credential starts a new pending pairing and does not inherit an expired or revoked approval.

The network destination is fixed to `http://127.0.0.1:39983/mcp`. There is no configurable remote endpoint, token setting, redirect following, proxy forwarding, telemetry, or direct database access. Credentials are kept in process memory and are never included in logs or the bundle. Data returned to Claude is shared with Claude; local storage does not mean AI responses stay on the Mac. See [data handling](PRIVACY.md).

## Troubleshooting

| Symptom | Action |
| --- | --- |
| App or helper unavailable | Install/update the signed MarginDeck app and check its location in extension settings. |
| App is closed or MCP is off | Open MarginDeck and enable MCP in AI Connections, then retry. |
| Client connected but financial reads denied | Call `get_status`, compare the code, and approve the pairing in MarginDeck. |
| Pairing expired or revoked | A new credential needs a new approval. Reconnect if necessary. |
| App moved or updated | Correct the app location and restart the extension. |
| A write request lost its response | Check `get_operation` and the app before submitting again. The connector does not retry uncertain writes. |
| Duplicate tools or pairings | Disable/remove the other MarginDeck extension or manual MCP entry. |

To revoke access, use MarginDeck's AI Connections controls. To uninstall, remove the extension in Claude Desktop. Removing the extension does not delete your MarginDeck ledger.

## Developer notes

```sh
npm test                  # Synthetic data only; no running app required
npm run validate          # Official MCPB manifest validation
npm run bundle            # Allowlisted, source-only .mcpb
node server/index.js --app /Applications/MarginDeck.app
```

The connector supports MarginDeck's JSON request/response MCP endpoint. It does not implement SSE, server-initiated requests, or in-flight cancellation. Requests are processed sequentially with pipe backpressure. Input is limited to 64 KiB per line, responses to 4 MiB, and each HTTP request to 20 seconds. HTTP 401/403 permits one credential refresh and initialization replay. Network failures, redirects and HTTP 5xx responses are not retried.

Report issues without including ledger data, tokens, or account credentials. For sensitive reports use the contact on [MarginDeck's privacy page](https://www.margindeck.app/privacy).

## License

The source and documentation in **this repository** are [MIT licensed](LICENSE). The separately distributed MarginDeck app and its native helper are not part of this repository and are not relicensed by this license. No app source, app binaries, or customer data are included.
