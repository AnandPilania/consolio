# ⚡ consolio

> Lightweight, project-isolated API testing tool. Runs as `npx` — no install needed. ~30MB RAM.

---

## Quick start

```bash
# Run immediately — no install needed
npx @pilaniaanand/consolio

# Or install globally
npm install -g @pilaniaanand/consolio
consolio
```

Opens at `http://localhost:4242`.

---

## Project isolation

```bash
cd my-project
npx consolio init --name "My API"
npx consolio          # auto-detects .consolio/ in current dir
```

Commit `.consolio/collections/` and `.consolio/environments/` to share with your team.
History is gitignored automatically.

---

## Scripts

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

---

## Development workflow

`npm run dev` starts two processes via `concurrently`:

| Process         | Port    | Description                                     |
| --------------- | ------- | ----------------------------------------------- |
| API server      | `:4242` | Fastify — handles all `/api/*` and `/ws`        |
| Vite dev server | `:5173` | React HMR — proxies `/api` and `/ws` to `:4242` |

Open `http://localhost:5173` for hot-reload development.
The server at `:4242` is API-only in dev mode — it redirects `/` to Vite.

**Environment variable:** `CONSOLIO_DEV=true` puts the server in API-only mode (set automatically by `npm run dev`).

---

## Browser interceptor

1. Open `chrome://extensions/` → enable **Developer Mode**
2. Click **Load unpacked** → select the `extension/` folder
3. Click the consolio icon in your Chrome toolbar
4. Toggle **Capture requests** ON
5. Intercepted requests appear in the **Tap** sidebar tab

### Filter rules (blacklist / whitelist)

In the Tap tab, set a mode and add rules:

- **Blacklist** (default) — block requests matching any rule. Good for filtering analytics/CDN noise.
- **Whitelist** — capture only requests matching at least one rule. Good for isolating one API domain.

Per rule: **Target** (URL / Host / Method / Content-Type) × **Mode** (contains / starts with / ends with / exact / regex).
Rules persist in localStorage.

---

## Pre/post request scripts

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

---

## Customise layout

Click **⊞** in the topbar:
- Drag panels to reorder
- Toggle panel visibility
- Resize with sliders, or drag the dividers in the main UI
- **Presets:** Default · Focus Request · Focus Response · No Sidebar

Preferences persist in localStorage.

---

## CLI

```bash
consolio                      # start server (port 4242)
consolio start --port 8080    # custom port
consolio start --no-open      # don't auto-open browser
consolio init                 # initialise project (.consolio/)
consolio init --name "My API"
consolio --version
consolio --help
```

---

## License

MIT
