# ⚡ consolio — Lightweight API Testing Tool

> A fast, project-isolated Postman alternative. Runs as an `npx` package — no installation bloat, no licensing, ~30MB RAM.

## Why consolio?

|                     | Postman    | Apidog     | **consolio**             |
| ------------------- | ---------- | ---------- | ------------------------ |
| RAM Usage           | ~300MB     | ~400MB     | **~30MB**                |
| Disk (installed)    | 400MB      | 1GB+       | **<15MB**                |
| Project isolation   | Workspaces | Workspaces | **`.consolio/` in repo** |
| Offline             | ✓          | ✓          | **✓**                    |
| License required    | Yes        | Freemium   | **MIT / Free**           |
| Browser interceptor | Extension  | Extension  | **✓ Extension included** |
| `npx` support       | ✗          | ✗          | **✓**                    |

---

## Quick Start

```bash
# Run immediately — no install
npx consolio

# Or install globally
npm install -g consolio
consolio
```

Opens at `http://localhost:4242` automatically.

---

## Project Isolation

Initialize consolio in any project to store collections **alongside your code**:

```bash
cd my-api-project
npx consolio init --name "My API Project"
```

This creates:
```
my-api-project/
└── .consolio/
    ├── config.json              # Project settings
    ├── collections/
    │   └── example.json         # Your API collections
    ├── environments/
    │   └── development.json     # Environment variables
    └── history/                 # Request history (gitignored)
```

**Commit `.consolio/collections/` and `.consolio/environments/`** to share API collections with your team. History is auto-gitignored.

Then run:
```bash
npx consolio        # Auto-detects .consolio/ in current dir
```

---

## Features

### ✅ Request Builder
- All HTTP methods: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
- Query params, headers with enable/disable toggles
- Body: JSON, form-encoded, plain text, raw
- Auth: Bearer token, Basic auth, API key (header/query)

### ✅ Environment Variables
- Multiple environments (Development, Staging, Production)
- Use `{{VAR_NAME}}` syntax in URLs, headers, body
- Variables stored per-project in `.consolio/environments/`

### ✅ Collections
- Organize requests into collections
- Collections stored as readable JSON — version control friendly
- Expandable tree view in sidebar

### ✅ Request History
- Last 200 requests auto-saved
- Click any history entry to reload the request + response
- Stored in `.consolio/history/` (gitignored)

### ✅ Response Viewer
- Syntax-highlighted JSON
- Response headers table
- Status code, timing (ms), size
- Copy response body

### ✅ Browser Interceptor
Install the Chrome extension to capture API calls made by any website:

1. Go to `chrome://extensions/` → Enable **Developer mode**
2. Click **Load unpacked** → select the `extension/` folder in this repo
3. Click the consolio icon → toggle **Capture requests** on
4. Browse any website — requests appear in consolio's **Tap** sidebar
5. Click any intercepted request to load it into the builder

---

## CLI Reference

```bash
consolio                        # Start server (default port 4242)
consolio start --port 8080      # Custom port
consolio start --no-open        # Don't auto-open browser
consolio init                   # Initialize project
consolio init --name "My App"   # Initialize with project name
consolio --help                 # Show help
consolio --version              # Show version
```

---

## Tech Stack

- **Runtime**: Node.js 18+ (ESM)
- **Server**: [Fastify](https://fastify.dev/) — fastest Node.js HTTP framework
- **UI**: Single-file React 18 (CDN) + custom CSS — no build step
- **Storage**: JSON files (zero dependencies, human-readable)
- **WebSocket**: `ws` — for real-time interceptor relay

---

## Data Format

Collections are plain JSON — easy to read, diff, and merge:

```json
{
  "id": "col_abc123",
  "name": "User API",
  "requests": [
    {
      "id": "req_def456",
      "name": "Get Users",
      "method": "GET",
      "url": "{{BASE_URL}}/users",
      "headers": [
        { "key": "Authorization", "value": "Bearer {{TOKEN}}", "enabled": true }
      ],
      "params": [],
      "body": { "type": "none" },
      "auth": { "type": "none" }
    }
  ]
}
```

---

## Development

```bash
git clone ...
cd consolio
npm install
node bin/consolio.js         # Run directly
```

---

## License
MIT
