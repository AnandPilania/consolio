# ⚡ consolio

> A fast, project-isolated API testing tool. Runs as an `npx` package — no installation bloat, ~30MB RAM.

---

## Quick start

```bash
# Run immediately — no install needed
npx @pilaniaanand/consolio

# Or install globally
npm install -g @pilaniaanand/consolio
consolio
```

Opens at `http://localhost:4242` automatically.

---

## Project isolation

Store your API collections right alongside your code:

```bash
cd my-project
npx consolio init --name "My API"
npx consolio          # auto-detects .consolio/ in current dir
```

**Commit** `.consolio/collections/` and `.consolio/environments/` to share with your team.  
History is auto-gitignored.

---

## Features

| | consolio | Postman | Apidog |
|---|---|---|---|
| RAM | **~30MB** | ~300MB | ~400MB |
| npx support | ✅ | ✗ | ✗ |
| Project isolation | ✅ `.consolio/` | Workspaces | Workspaces |
| Offline | ✅ | ✅ | ✅ |
| Multi-tab requests | ✅ | ✅ | ✅ |
| Pre/post scripts | ✅ | ✅ | ✅ |
| Test assertions | ✅ | ✅ | ✅ |
| Copy as cURL | ✅ | ✅ | ✅ |
| Import cURL/Postman | ✅ | ✅ | ✅ |
| Collection runner | ✅ | ✅ | ✅ |
| Browser interceptor | ✅ extension | extension | extension |
| Drag-to-resize UI | ✅ | ✅ | ✅ |
| Customisable layout | ✅ | - | - |
| License | **MIT/Free** | Freemium | Freemium |

---

## Project structure

```
consolio/
├── bin/
│   └── consolio.js          # CLI entry point (commander)
├── server/
│   ├── index.js             # Fastify server + WebSocket
│   ├── init.js              # `consolio init` command
│   ├── storage.js           # JSON file storage
│   └── routes/
│       ├── collections.js   # CRUD for collections + requests
│       ├── environments.js  # CRUD for environments + history + config
│       └── proxy.js         # /api/execute — proxies HTTP requests
├── extension/
│   ├── manifest.json        # Chrome MV3 extension manifest
│   └── src/
│       ├── background.js    # Service worker — captures webRequests
│       ├── popup.html       # Extension popup UI
│       └── popup.js         # Popup logic
├── ui-src/                  # Vite + React source (edit this)
│   ├── index.html
│   ├── vite.config.js       # Builds to ../ui/
│   ├── package.json
│   └── src/
│       ├── main.jsx
│       ├── App.jsx          # Root layout — resizable PanelGroup
│       ├── store/index.js   # Zustand store (all state + persistence)
│       ├── utils/index.js   # Helpers: uid, buildCurl, parseCurl, runTests, runScript
│       ├── styles/          # CSS tokens + global reset
│       └── components/
│           ├── layout/      # Topbar
│           ├── sidebar/     # Collections, History, Interceptor + filter rules
│           ├── request/     # Multi-tab, URL bar, Params/Headers/Body/Auth/Scripts/Tests
│           ├── response/    # Status, Body (search+highlight), Headers, Test results
│           ├── modals/      # CustomiseLayout, NewCollection, Import, Runner, Settings
│           └── shared/      # Icon, Btn, KVTable, Notification, ...
└── ui/                      # Built UI — served by Fastify (do not edit directly)
```

---

## Development

```bash
# Install server deps
npm install

# Start server
npm run dev                  # → http://localhost:4242

# UI hot-reload (separate terminal)
npm run ui:dev               # → http://localhost:5173 (proxies API to :4242)

# Build UI for production
npm run ui:build             # compiles ui-src/ → ui/
```

---

## Browser interceptor

1. Open `chrome://extensions/` → enable **Developer Mode**
2. Click **Load unpacked** → select the `extension/` folder
3. Click the consolio icon in your Chrome toolbar
4. Toggle **Capture requests** ON
5. Intercepted requests appear in the **Tap** sidebar tab

### Interceptor filter rules

The Tap sidebar supports **blacklist** and **whitelist** modes:

- **Blacklist** (default) — block requests that match any rule. Useful for filtering out analytics, CDN, or other noise.
- **Whitelist** — capture *only* requests matching at least one rule. Useful for isolating a specific API domain.

Each rule configures:
- **Target**: URL · Host · Method · Content-Type
- **Mode**: contains · starts with · ends with · exact · regex
- **Pattern**: the string or regex to match

Rules persist across sessions.

---

## Pre/post request scripts

```js
// Pre-request tab — runs before the request is sent
consolio.setVariable('timestamp', Date.now())
consolio.setVariable('sig', btoa(consolio.getVariable('secret') + Date.now()))

// Post-response tab — runs after the response arrives
const data = JSON.parse(response.body)
consolio.setVariable('authToken', data.token)
consolio.log('Got token:', data.token)
```

Available API: `consolio.log(...args)`, `consolio.setVariable(key, value)`, `consolio.getVariable(key)`  
Context: `request` (method, url), `response` (status, body, headers, elapsed), `environment` (current vars)

---

## Customise layout

Click the **⊞** icon in the topbar to open the Layout panel:
- **Drag** panels to reorder (sidebar, request pane, response pane)
- **Toggle** panel visibility
- **Resize** with sliders or by dragging the dividers in the UI
- **Presets**: Default · Focus Request · Focus Response · No Sidebar

All preferences persist in localStorage.

---

## CLI reference

```bash
consolio                        # Start server (default port 4242)
consolio start --port 8080      # Custom port
consolio start --no-open        # Don't auto-open browser
consolio init                   # Initialize project
consolio init --name "My App"   # Initialize with project name
consolio --help
consolio --version
```

---

## License

MIT
