# OpenCode Rotator Plugin

OpenCode Rotator Plugin adds a compact Rotator panel to the OpenCode TUI sidebar. It shows the active account, plan, Codex usage windows, watch status, and account count from a running ChatGPT account rotator server.

This repository is the standalone plugin package for OpenCode. It is only a client for the rotator server from [opencode-chatgpt-account-rotator](https://github.com/xnnnc/opencode-chatgpt-account-rotator). It does not include the account pool, browser GUI, auth files, cookies, saved accounts, or the rotator server itself.

Repository: https://github.com/xnnnc/opencode-rotator-plugin

## How it fits with the rotator server

The plugin talks to a local rotator server over HTTP. Start the server from the root project before opening OpenCode if you want live state or working actions.

Root project: https://github.com/xnnnc/opencode-chatgpt-account-rotator

Default server URL:

```txt
http://127.0.0.1:4317
```

From the root rotator project, the usual server command is:

```bash
npm run gui
```

On Windows, the root project also includes:

```bat
open-gui.bat
```

If the server is offline, the sidebar stays loaded and shows an offline message with a reminder to start the rotator server.

## Features

- Registers an OpenCode server plugin entry point from `dist/index.js`.
- Registers an OpenCode TUI sidebar plugin from `dist/tui.js`.
- Polls the rotator server every 15 seconds with `GET /api/state`.
- Shows the active account label, account status, auth presence, plan type, 5 hour usage, 7 day usage, watch status, and account count.
- Adds TUI actions for usage refresh, watch start or stop, and switching to the next healthy account.
- Keeps auth and account management in the rotator server. The plugin does not read or write local auth files directly.

## Requirements

- Node.js 18 or newer.
- npm.
- OpenCode with server plugin and TUI plugin support.
- A local `opencode-chatgpt-account-rotator` server when you want live state or actions.
- A trusted local machine. Do not point the plugin at a public or untrusted rotator server.

## Install and build

Clone the plugin repository, install dependencies, then build it.

```bash
git clone https://github.com/xnnnc/opencode-rotator-plugin.git
cd opencode-rotator-plugin
npm install
npm run build
```

The build script is:

```bash
tsc && bun scripts/build-tui.ts && node scripts/prepare-tui-dist.mjs
```

That compiles TypeScript declarations, then uses Bun with the OpenTUI Solid plugin to emit the TUI entry as `dist/tui.js` so package loaders can import it as a normal ESM JavaScript file.

Run a type-only check without writing build output:

```bash
npm run typecheck
```

The typecheck script is:

```bash
tsc --noEmit
```

Quickly verify the server entry shape after building:

```bash
node --input-type=module -e "const m=await import('./dist/index.js'); if (typeof m.default?.server !== 'function') throw new Error('bad server export')"
```

## OpenCode configuration

Build or link the package first, then add it to both OpenCode config surfaces.

`opencode.jsonc`:

```jsonc
{
  "plugin": ["opencode-rotator-plugin"]
}
```

`tui.jsonc`:

```jsonc
{
  "plugin": ["opencode-rotator-plugin"]
}
```

For local development, use the local package workflow supported by your OpenCode install. Common choices are `npm link`, a workspace package, or an absolute package path if your OpenCode version supports local plugin paths.

## Runtime configuration

### Server URL

By default, the plugin calls `http://127.0.0.1:4317`. Set `OPENCODE_ROTATOR_URL` only when your rotator server runs somewhere else.

macOS or Linux:

```bash
export OPENCODE_ROTATOR_URL=http://127.0.0.1:4317
```

Windows Command Prompt:

```bat
set OPENCODE_ROTATOR_URL=http://127.0.0.1:4317
```

Windows PowerShell:

```powershell
$env:OPENCODE_ROTATOR_URL = "http://127.0.0.1:4317"
```

The plugin strips a trailing slash from this value before building endpoint URLs.

### Action token

State polling uses `GET /api/state`. Actions use protected `POST` endpoints and require a rotator API token.

Set `OPENCODE_ROTATOR_TOKEN` in the environment where OpenCode runs, using the token printed by the rotator server. The plugin also accepts `ROTATOR_API_TOKEN` for compatibility. Do not commit tokens, paste them into issues, or store them in shared shell profiles.

## Usage flow

1. Set up accounts in the root rotator project. This plugin does not add, remove, or authenticate accounts.
2. Start the rotator server from the root project with `npm run gui` or `open-gui.bat`.
3. Build and link this plugin into OpenCode.
4. Set `OPENCODE_ROTATOR_URL` if the server is not on `http://127.0.0.1:4317`.
5. Set `OPENCODE_ROTATOR_TOKEN` if you want the sidebar action buttons to work.
6. Open the OpenCode TUI and look for the Rotator sidebar panel.
7. Use the panel for quick status checks, usage refresh, watch toggle, or manual switch to the next healthy account.

## Server endpoints used by the plugin

The plugin uses these rotator server endpoints:

Exact calls: `GET /api/state`, `POST /api/usage`, `POST /api/watch/start`, `POST /api/watch/stop`, and `POST /api/switch`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/state` | Read active account, usage snapshots, watch status, and account list summary. |
| `POST` | `/api/usage` | Refresh usage snapshots through the rotator server. |
| `POST` | `/api/watch/start` | Start the server-side watch process. The plugin sends `{ "intervalMs": 30000 }`. |
| `POST` | `/api/watch/stop` | Stop the server-side watch process. |
| `POST` | `/api/switch` | Switch to the next healthy account through the rotator server. |

The plugin never calls ChatGPT directly. It only calls the local rotator server.

## Project layout

```txt
opencode-rotator-plugin/
  opencode.jsonc                 Example OpenCode server plugin config
  tui.jsonc                      Example OpenCode TUI plugin config
  package.json                   Package metadata, exports, scripts, and OpenCode plugin entries
  package-lock.json              Locked npm dependency graph
  scripts/build-tui.ts           Bundles the OpenTUI Solid entry to dist/tui.js
  scripts/prepare-tui-dist.mjs   Verifies the bundled dist/tui.js entry exists
  src/index.ts                   OpenCode server plugin entry point
  src/tui.tsx                    OpenCode TUI sidebar panel
  src/rotator-client.ts          Rotator API client and panel formatting
  src/types.ts                   Shared API and panel types
```

Build output is written to `dist/`. Dependencies are installed in `node_modules/`. Neither directory should contain secrets.

## Development workflow

1. Start the root rotator server.
2. Install plugin dependencies with `npm install`.
3. Make plugin changes in `src/` or docs changes in `README.md`.
4. Run `npm run typecheck`.
5. Run `npm run build`.
6. Link or point OpenCode at this package.
7. Open the OpenCode TUI and check the Rotator panel against the local server.

When testing action buttons, remember that they call the real local rotator server. `usage` refreshes usage data, `watch` starts or stops the watch process, and `switch` changes the active account.

## Packaging and publishing notes

The package is currently marked `private: true`. Keep that setting if this repository is meant for GitHub-first distribution instead of npm publication.

The package metadata points at:

- Repository: https://github.com/xnnnc/opencode-rotator-plugin
- Issues: https://github.com/xnnnc/opencode-rotator-plugin/issues
- Root rotator project: https://github.com/xnnnc/opencode-chatgpt-account-rotator

Before publishing to npm, review the package name, exported files, license file, `private` flag, build output, and security notes. Do not publish local state, logs, `.env` files, OpenCode auth data, or account pool files.

## Limitations and security

- The plugin is not the rotator server. It cannot authenticate accounts, save accounts, delete accounts, run the browser GUI, or manage account pool files by itself.
- The sidebar is intentionally compact. Long labels and long server errors may be shortened.
- The plugin sends action requests to `OPENCODE_ROTATOR_URL`. Keep that URL pointed at a trusted local server.
- Action requests include `x-rotator-token` when `OPENCODE_ROTATOR_TOKEN` or `ROTATOR_API_TOKEN` is set. Treat that token as a secret.
- Never commit or publish account IDs, auth files, cookies, access tokens, refresh tokens, `.env` files, copied OpenCode state, browser profiles, screenshots with account data, or rotator logs that expose private data.
- Do not expose the rotator server to the public internet. It controls local account switching and usage checks.

## Troubleshooting

### The panel says the rotator server is offline

Start the root rotator server and confirm it is listening on the expected URL. The default is `http://127.0.0.1:4317`. If you changed the port, set `OPENCODE_ROTATOR_URL` before starting OpenCode.

### State loads, but action buttons fail

State polling does not require the action token. The `usage`, `watch`, and `switch` buttons call protected `POST` endpoints. Set `OPENCODE_ROTATOR_TOKEN` from the rotator server output, or set `ROTATOR_API_TOKEN` for compatibility.

### The TUI plugin does not appear

Run `npm run build`, check that `dist/index.js` and `dist/tui.js` exist, and confirm that the package is listed in both `opencode.jsonc` and `tui.jsonc` for your OpenCode setup.

### Usage shows `n/a`

The rotator server has no current usage snapshot for the active account. Use the `usage` action, or refresh usage from the root project GUI or CLI.

### Watch does not start or stop

Confirm the action token is set, then check the root rotator server logs. The plugin only forwards the action. The server decides whether the watch process can start or stop.

### Switch chooses a different account than expected

The plugin calls `POST /api/switch` without choosing an index. The rotator server selects the next healthy account based on its own account state and rotation rules.

## License

MIT. See the repository license before redistribution.
