# ⚡ consolio

[![npm version](https://img.shields.io/npm/v/@pilaniaanand/consolio.svg)](https://www.npmjs.com/package/@pilaniaanand/consolio)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/node/v/@pilaniaanand/consolio.svg)](package.json)

> Lightweight, project-isolated API testing tool — a fast Postman/Insomnia alternative. Runs as `npx` — no install needed. ~30MB RAM.

## Table of contents

- [Features](#features)
- [Install](#install)
- [Usage](#usage)
  - [CLI reference](#cli-reference)
  - [Project isolation](#project-isolation)
- [Collections](#collections)
  - [Auth types](#auth-types)
  - [Body types](#body-types)
  - [Import / Export](#import--export)
  - [Generate code](#generate-code)
- [Testing requests](#testing-requests)
  - [Assertion types](#assertion-types)
  - [Pre/post request scripts](#prepost-request-scripts)
  - [Collection runner](#collection-runner)
  - [CLI runner (headless)](#cli-runner-headless)
- [Response preview](#response-preview)
- [Protocols](#protocols)
- [Mock servers](#mock-servers)
- [Plugins](#plugins)
- [Browser interceptor](#browser-interceptor)
- [Customise layout](#customise-layout)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Zero install** — `npx @pilaniaanand/consolio` and go; ~30MB RAM footprint
- **Project-isolated** collections — `.consolio/` lives next to your code and commits to git like any other file
- Nested folders, bulk import, and a full **collection runner** with pre/post-request scripts and test assertions — in the UI and as a **headless CLI** (`consolio run`, JUnit/JSON reporters for CI)
- Import cURL, **Postman v2.1**, **Insomnia v4**, and **OpenAPI/Swagger 3.x**; export to Postman or Insomnia format
- **Multi-language code generation** (cURL, JS, Node, Python, Go, Java, PHP, Ruby) via `httpsnippet`
- Response preview with a collapsible **JSON tree**, raw view, and a **diff** against the previous history entry
- First-class protocol support beyond plain HTTP: **GraphQL**, **WebSocket**, **Server-Sent Events**, **Socket.IO**, **gRPC**
- **Mock servers** — spin up a second Fastify instance from stored routes, with `{{param}}` templating
- An **Insomnia-style plugin system** — install real npm packages that hook into every request/response
- A Chrome **browser interceptor** extension to capture real traffic straight into a collection

## Install

```bash
# Run immediately — no install needed
npx @pilaniaanand/consolio

# Or install globally
npm install -g @pilaniaanand/consolio
consolio
```

Opens at `http://localhost:4242`.

## Usage

### CLI reference

```bash
consolio                      # start the server (default command)
consolio --version
consolio --help
```

| Command | Flags | Description |
| --- | --- | --- |
| `start` (default) | `-p, --port <port>` (default `4242`)<br>`--no-open` — don't auto-open the browser<br>`--dev` — API-only mode for use alongside Vite HMR<br>`--project <path>` — project directory (default: cwd) | Start the consolio server |
| `init` | `--name <name>` (default `"My Project"`) | Create `.consolio/` in the current directory |
| `run <collection>` | `-e, --env <name>` — environment id or name<br>`-r, --reporter <type>` — `cli` \| `json` \| `junit` (default `cli`)<br>`-c, --concurrency <n>` — requests in parallel (default `1`)<br>`-d, --delay <ms>` — delay between batches (default `0`)<br>`--bail` — stop on first failing request<br>`--project <path>` — project directory (default: cwd) | Run a collection headlessly, no browser needed |

```bash
consolio start --port 8080 --no-open
consolio init --name "My API"
consolio run "My Collection" --env Staging --reporter cli
consolio run col_abc123 --concurrency 4 --bail
consolio run "My Collection" --reporter junit > results.xml
```

`run` exits `1` if any request failed, `2` if the collection/environment wasn't found — suitable for CI pipelines.

### Project isolation

```bash
cd my-project
npx consolio init --name "My API"
npx consolio          # auto-detects .consolio/ in current dir
```

Commit `.consolio/collections/` and `.consolio/environments/` to share with your team.
History is gitignored automatically. Without a `.consolio/` directory in the current folder,
consolio falls back to a global workspace at `~/.consolio/global`.

## Collections

Requests can be organized into nested folders within a collection (folder icon in the collection header).
Drag isn't required — each request row has a "move to folder" dropdown once a collection has folders.
Deleting a folder keeps its requests, moving them (and any of its own sub-folders) back to the collection root.

### Auth types

Set per-request under the **Auth** tab: **None**, **Bearer Token**, **Basic Auth** (username/password),
or **API Key** (custom header name + value — key placement is currently header-only). Auth values resolve
`{{VAR}}` against the active environment, same as headers and body.

### Body types

Set under the **Body** tab: **JSON**, **Text**, **Form** (`application/x-www-form-urlencoded`),
**Multipart** (text + file fields), **Raw**, and **GraphQL** (see [Protocols](#protocols)).

### Import / Export

Import (toolbar → upload icon): cURL commands, Postman Collection v2.1 JSON, Insomnia v4 export JSON,
or an OpenAPI/Swagger 3.x document (JSON or YAML) — paths/methods become requests, tags become folders.
Postman/Insomnia folder structure is preserved on import.

Export (collection header → "Export…"): download the collection as Postman Collection v2.1 JSON or
an Insomnia v4 export file.

Environment variables can be flagged **secret** (masked with a password-style input in the UI, and
excluded from generated code snippets). This is a display/export-time convenience, not an encryption
layer — secret values are still resolved in plain text when a request executes and are stored in
request history like any other variable.

### Generate code

Request toolbar → code icon (next to "Copy as cURL") — generates a runnable snippet for the current
request in cURL, JavaScript (fetch/axios), Node.js, Python (requests), Go, Java (OkHttp), PHP, or Ruby.

## Testing requests

### Assertion types

Add assertions under a request's **Tests** tab; the collection runner and CLI runner both evaluate them
server-side using the same engine:

| Type | Checks |
| --- | --- |
| `status` | Response status equals a value |
| `status_lt` | Response status is less than a value |
| `status_in` | Response status is one of a comma-separated list |
| `has_header` | A header is present |
| `header_equals` | A header equals an exact value |
| `body_contains` | Response body contains a substring |
| `body_not_contains` | Response body does not contain a substring |
| `body_json_path` | A JSON path (e.g. `data[0].id`) equals a value |
| `body_not_empty` | Response body is non-empty |
| `response_time` | Response time is at or under a threshold (ms) |
| `response_time_gt` | Response time exceeds a threshold (ms) |

### Pre/post request scripts

```js
// Pre-request tab — runs before the request is sent
consolio.setVariable('ts', Date.now())

// Post-response tab — runs after the response arrives
const body = JSON.parse(response.body)
consolio.setVariable('token', body.access_token)
consolio.log('Got token:', body.access_token)
```

**API:** `consolio.log(...args)` · `consolio.setVariable(key, value)` · `consolio.getVariable(key)`
**Context:** `request` (method, url) · `response` (status, body, headers, elapsed) · `environment`

Scripts run sandboxed on the server (Node `vm`, no filesystem/network access). `setVariable` writes back
to the active environment, so values persist across requests.

### Collection runner

The Runner (sidebar → play icon) executes pre/post-request scripts and test assertions for every
request — a request passes if all its tests pass (or, when it has none, if the status is < 400).
Pick an environment, an optional concurrency (parallel requests) and delay between batches, and optionally
bail on the first failure. Results can be exported as JSON or JUnit XML for CI.

### CLI runner (headless)

Run a collection without a browser, using the same engine as the UI runner — see the
[CLI reference](#cli-reference) above for the full `consolio run` flag list.

## Response preview

The Body tab has a collapsible **Tree** view for JSON responses (toggle to **Raw** for the plain
highlighted text). A **Diff** tab appears automatically when a previous response exists in history for
the same method + URL, showing an inline line-by-line diff.

## Protocols

### GraphQL

Body tab → **GraphQL** — a Query editor + Variables (JSON) editor; sending shapes them into the standard
`{query, variables}` POST body and switches the method to POST automatically. **Fetch Schema** runs the
standard introspection query against the request URL and renders the result in the same JSON tree view.

### WebSocket

Type a `ws://` or `wss://` URL in the URL bar — the toolbar switches to **Connect**/**Disconnect** and the
response panel switches to a live message log. The server holds the real connection to the target (so
target-side CORS/TLS/auth headers are never the browser's problem) and relays frames over consolio's
existing WebSocket relay. Headers set in the Headers tab are sent with the handshake.

### Server-Sent Events (SSE)

Click the **SSE** toggle next to the URL bar (any `http(s)://` URL — SSE doesn't have its own scheme).
**Connect** opens a streaming request server-side with `Accept: text/event-stream`; each event is parsed
and relayed to the same live message log used by WebSocket, tagged with its event name when it isn't
the default `message`.

### Socket.IO

Click the **SIO** toggle next to the URL bar. The server connects as a real `socket.io-client`, so the
Socket.IO handshake/transport upgrade happens server-side. Once connected, emit events with an event
name + a JSON (or plain text) payload; all events — yours and the server's — appear in the same live log.

### gRPC

Click the **gRPC** toggle. Put the target as `host:port` in the URL bar, paste the `.proto` file and
press **Load Proto** — every service method appears in a dropdown, tagged `(server-streaming)` where
relevant. Fill the request as JSON and press **Call**. Unary and server-streaming methods are supported;
client-streaming and bidirectional methods are rejected with a clear error (not implemented yet).
Calls are always plaintext (`grpc.credentials.createInsecure()`) — there's no TLS option yet.

## Mock servers

Topbar → globe icon → **Mock Servers**. Create a mock set (name + port), add routes (method, path —
supports Fastify-style `:params` — status code, headers, delay, and a body), then press **Start**.
`{{param}}` in the body or headers resolves against the route's path params and query string, e.g. a
route at `/users/:id` with body `{"id": "{{id}}"}` echoes the real id back. Each running mock set is a
second lightweight Fastify instance bound to its own port, independent of the main consolio server.

## Plugins

Topbar → `</>` icon → **Plugins**. Installs a real npm package into `.consolio/plugins/` (its own
`package.json` + `node_modules`, separate from consolio's own dependencies) and runs its hooks on every
request. A plugin is a module exporting any of:

```js
module.exports = {
  requestHooks: [
    (request) => { request.headers.push({ key: 'X-My-Header', value: '1', enabled: true }); return request },
  ],
  responseHooks: [
    (response) => { response.headers['x-seen'] = 'true'; return response },
  ],
  templateTags: {
    timestamp: () => new Date().toISOString(), // used as {{% timestamp %}} in URLs/headers/body
  },
}
```

`requestHooks` run first, **before** `{{VAR}}`/`{{% tag %}}` resolution — they see raw, unresolved
values, so they can't rely on the final literal URL/header/body content (a request-signing plugin,
for example, won't see the fully-resolved bytes it would need to sign). They can mutate or replace the
`{method, url, headers, params, body, auth}` object. `responseHooks` run right after the response comes
back and can mutate or replace `{headers, body, bodyType, elapsed}` (status/statusText/size are left
alone — they reflect what actually came back over the wire). `templateTags` add zero-arg functions
resolvable via `{{% tagName %}}`, evaluated *after* `{{VAR}}` substitution, on every URL/header/body field.

Only npm package names can be installed by typing into the Plugins field (no local paths) — that
install endpoint shells out to `npm install`, so the name is restricted to npm's own package-name
character set. consolio also ships a few genuinely useful plugins in its own [`plugins/`](plugins)
folder; the Plugin Manager lists any of these not yet installed under **Bundled with consolio** with a
one-click **Install** button (this is the one path that's allowed to install by local path — the button
only ever sends a fixed directory name that the server checks against what it actually shipped, never
an arbitrary string):

| Bundled plugin | Hook type | What it does |
| --- | --- | --- |
| [`consolio-plugin-dynamic-vars`](plugins/consolio-plugin-dynamic-vars) | `templateTags` | Postman-style dynamic test data: `{{% uuid %}}`, `{{% randomEmail %}}`, `{{% randomInt %}}`, `{{% isoTimestamp %}}`, and more |
| [`consolio-plugin-correlation-id`](plugins/consolio-plugin-correlation-id) | `requestHooks` | Adds a unique `X-Request-Id` header to every request, to grep for in the target server's logs |
| [`consolio-plugin-idempotency-key`](plugins/consolio-plugin-idempotency-key) | `requestHooks` | Adds a unique `Idempotency-Key` header to POST/PUT/PATCH/DELETE, so retrying a failed send can't double-submit against APIs that honor it |
| [`consolio-plugin-perf-budget`](plugins/consolio-plugin-perf-budget) | `responseHooks` | Flags responses slower than 1000ms with an `x-consolio-perf-warning` header |

A minimal [`consolio-plugin-example`](examples/consolio-plugin-example) also lives under `examples/`,
showing the full hook contract (all three hook types) for anyone writing their own plugin from scratch.

## Browser interceptor

1. Open `chrome://extensions/` → enable **Developer Mode**
2. Click **Load unpacked** → select the `extension/` folder
3. Click the consolio icon in your Chrome toolbar
4. Toggle **Capture requests** ON
5. Intercepted requests appear in the **Tap** sidebar tab

No build step — the extension runs directly from source.

### Filter rules (blacklist / whitelist)

In the Tap tab, set a mode and add rules:

- **Blacklist** (default) — block requests matching any rule. Good for filtering analytics/CDN noise.
- **Whitelist** — capture only requests matching at least one rule. Good for isolating one API domain.

Per rule: **Target** (URL / Host / Method / Content-Type) × **Mode** (contains / starts with / ends with / exact / regex).
Rules persist in localStorage.

## Customise layout

Click **⊞** in the topbar:
- Drag panels to reorder
- Toggle panel visibility
- Resize with sliders, or drag the dividers in the main UI
- **Presets:** Default · Focus Request · Focus Response · No Sidebar

Preferences persist in localStorage.

## Development

```bash
npm install        # install everything (server deps + UI devDeps) in one shot

npm start          # production: serves dist/ at http://localhost:4242
npm run build      # compile ui/ → dist/  (run once after clone, or after UI changes)

npm run dev        # development: API server on :4242 + Vite HMR on :5173
                   # both start simultaneously, logs colour-coded (cyan = api, yellow = ui)
                   # edit anything in ui/ and the browser updates instantly
```

**After cloning:**
```bash
npm install && npm run build && npm start
```

`npm run dev` starts two processes via `concurrently`:

| Process | Port | Description |
| --- | --- | --- |
| API server | `:4242` | Fastify — handles all `/api/*` and `/ws` |
| Vite dev server | `:5173` | React HMR — proxies `/api` and `/ws` to `:4242` |

Open `http://localhost:5173` for hot-reload development. The server at `:4242` is API-only in dev mode
(`CONSOLIO_DEV=true`, set automatically by `npm run dev`) — it redirects `/` to Vite.

## Contributing

Issues and pull requests are welcome — see [github.com/AnandPilania/consolio/issues](https://github.com/AnandPilania/consolio/issues).
Before opening a PR: `npm install`, `npm run build`, and run the test scripts under `server/` and
`ui/utils/` (plain `node <file>.test.js`, no test framework/runner required) to confirm nothing regressed.

## License

[MIT](LICENSE) © [Anand Pilania](https://github.com/AnandPilania)
