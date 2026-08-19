export function uid() { return Math.random().toString(36).slice(2, 10) }

export function fmtSize(b) {
    if (b < 1024) return b + ' B'
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'
    return (b / 1048576).toFixed(2) + ' MB'
}
export function fmtTime(ms) {
    if (!ms) return '—'
    if (ms < 1000) return ms + ' ms'
    return (ms / 1000).toFixed(2) + ' s'
}
export function timeAgo(iso) {
    const s = Math.floor((Date.now() - new Date(iso)) / 1000)
    if (s < 60) return s + 's ago'
    if (s < 3600) return Math.floor(s / 60) + 'm ago'
    return Math.floor(s / 3600) + 'h ago'
}
export function cx(...args) { return args.filter(Boolean).join(' ') }

export function syntaxHighlight(json) {
    if (typeof json !== 'string') json = JSON.stringify(json, null, 2)
    return json
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(
            /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
            m => {
                let cls = 'tok-num'
                if (/^"/.test(m)) cls = /:$/.test(m) ? 'tok-key' : 'tok-str'
                else if (/true|false/.test(m)) cls = 'tok-bool'
                else if (/null/.test(m)) cls = 'tok-null'
                return `<span class="${cls}">${m}</span>`
            }
        )
}

export function applyEnv(str, env = {}, secretKeys) {
    if (!str) return str
    const secrets = secretKeys ? (secretKeys instanceof Set ? secretKeys : new Set(secretKeys)) : null
    return str.replace(/\{\{(\w+)\}\}/g, (_, k) => (secrets?.has(k) ? `{{${k}}}` : env[k] ?? `{{${k}}}`))
}

// Shared by buildCurl and buildHarRequest: resolves {{env}} placeholders into the
// final URL (with query params merged in) and a flat header map (incl. auth headers).
function resolveRequestParts({ url, headers = [], params = [], auth, environment = {}, secretKeys = [] }) {
    const ae = s => applyEnv(s, environment, secretKeys)
    let finalUrl = ae(url || '')
    const ep = params.filter(p => p.enabled && p.key)
    if (ep.length) {
        try {
            const u = new URL(finalUrl.startsWith('http') ? finalUrl : 'https://' + finalUrl)
            ep.forEach(p => u.searchParams.set(p.key, ae(p.value || '')))
            finalUrl = u.toString()
        } catch { }
    }
    const headerMap = {}
    headers.filter(h => h.enabled && h.key).forEach(h => { headerMap[h.key] = ae(h.value) })
    if (auth) {
        if (auth.type === 'bearer' && auth.token)
            headerMap['Authorization'] = `Bearer ${ae(auth.token)}`
        else if (auth.type === 'basic' && auth.username)
            headerMap['Authorization'] = 'Basic ' + btoa(`${ae(auth.username)}:${ae(auth.password || '')}`)
        else if (auth.type === 'apikey' && auth.key && auth.placement === 'header')
            headerMap[auth.key] = ae(auth.value || '')
    }
    return { finalUrl, headerMap, ae }
}

function graphqlBodyJson(body, ae) {
    let variables = {}
    if (body.variables?.trim()) {
        try { variables = JSON.parse(ae(body.variables)) } catch { /* send with no variables rather than fail */ }
    }
    return JSON.stringify({ query: ae(body.query || ''), variables })
}

// secretKeys: variable keys flagged "secret" — left as {{placeholder}} instead of
// resolved, so a copied/shared cURL command never carries a real secret value.
export function buildCurl({ method, url, headers = [], params = [], body, auth, environment = {}, secretKeys = [] }) {
    const { finalUrl, headerMap: hmap, ae } = resolveRequestParts({ url, headers, params, auth, environment, secretKeys })
    const parts = [`curl -X ${method}`]
    Object.entries(hmap).forEach(([k, v]) => parts.push(`  -H '${k}: ${v.replace(/'/g, "'\\''")}'`))
    if (body && !['GET', 'HEAD'].includes(method)) {
        if ((body.type === 'json' || body.type === 'text') && body.content) {
            if (!hmap['Content-Type']) parts.push(`  -H 'Content-Type: application/json'`)
            parts.push(`  -d '${body.content.replace(/'/g, "'\\''")}'`)
        } else if (body.type === 'form' && body.fields) {
            const f = new URLSearchParams()
            body.fields.filter(x => x.enabled && x.key).forEach(x => f.append(x.key, ae(x.value || '')))
            if (!hmap['Content-Type']) parts.push(`  -H 'Content-Type: application/x-www-form-urlencoded'`)
            parts.push(`  -d '${f.toString()}'`)
        } else if (body.type === 'graphql') {
            if (!hmap['Content-Type']) parts.push(`  -H 'Content-Type: application/json'`)
            parts.push(`  -d '${graphqlBodyJson(body, ae).replace(/'/g, "'\\''")}'`)
        }
    }
    parts.push(`  '${finalUrl}'`)
    return parts.join(' \\\n')
}

// Languages/clients offered in the "Generate Code" panel — target/client keys
// match httpsnippet's own registry (see `availableTargets()` in the httpsnippet package).
export const GENERATE_TARGETS = [
    { label: 'cURL',               target: 'shell',      client: 'curl' },
    { label: 'JavaScript – Fetch', target: 'javascript',  client: 'fetch' },
    { label: 'JavaScript – Axios', target: 'javascript',  client: 'axios' },
    { label: 'Node.js – Fetch',    target: 'node',        client: 'fetch' },
    { label: 'Python – Requests',  target: 'python',      client: 'requests' },
    { label: 'Go',                 target: 'go',          client: 'native' },
    { label: 'Java – OkHttp',      target: 'java',        client: 'okhttp' },
    { label: 'PHP – cURL',         target: 'php',         client: 'curl' },
    { label: 'Ruby',               target: 'ruby',        client: 'native' },
]

// Builds the HAR-like request object httpsnippet's HTTPSnippet expects.
export function buildHarRequest({ method, url, headers = [], params = [], body, auth, environment = {}, secretKeys = [] }) {
    const { finalUrl, headerMap, ae } = resolveRequestParts({ url, headers, params, auth, environment, secretKeys })
    const harHeaders = Object.entries(headerMap).map(([name, value]) => ({ name, value }))
    let postData
    if (body && !['GET', 'HEAD'].includes(method)) {
        if ((body.type === 'json' || body.type === 'text') && body.content) {
            const mimeType = headerMap['Content-Type'] || (body.type === 'json' ? 'application/json' : 'text/plain')
            postData = { mimeType, text: body.content }
            if (!headerMap['Content-Type']) harHeaders.push({ name: 'Content-Type', value: mimeType })
        } else if (body.type === 'form' && body.fields) {
            const mimeType = 'application/x-www-form-urlencoded'
            postData = { mimeType, params: body.fields.filter(f => f.enabled && f.key).map(f => ({ name: f.key, value: ae(f.value || '') })) }
            if (!headerMap['Content-Type']) harHeaders.push({ name: 'Content-Type', value: mimeType })
        } else if (body.type === 'multipart' && body.fields) {
            postData = {
                mimeType: 'multipart/form-data',
                params: body.fields.filter(f => f.enabled && f.key).map(f =>
                    f.type === 'file' ? { name: f.key, fileName: f.fileName || 'file' } : { name: f.key, value: ae(f.value || '') }
                ),
            }
        } else if (body.type === 'raw' && body.content) {
            postData = { mimeType: 'application/octet-stream', text: body.content }
        } else if (body.type === 'graphql') {
            const mimeType = 'application/json'
            postData = { mimeType, text: graphqlBodyJson(body, ae) }
            if (!headerMap['Content-Type']) harHeaders.push({ name: 'Content-Type', value: mimeType })
        }
    }
    return {
        method, url: finalUrl, httpVersion: 'HTTP/1.1',
        headers: harHeaders, queryString: [], cookies: [],
        postData, headersSize: -1, bodySize: -1,
    }
}

// Tokenize a shell-like command line, respecting '...' and "..." quoting
// (with \" escapes inside double quotes, matching curl's own copy-as-cURL output).
function tokenizeCurl(s) {
    const tokens = []
    let cur = '', quote = null
    for (let i = 0; i < s.length; i++) {
        const c = s[i]
        if (quote) {
            if (c === '\\' && quote === '"' && i + 1 < s.length) { cur += s[++i]; continue }
            if (c === quote) { quote = null; continue }
            cur += c
        } else if (c === "'" || c === '"') {
            quote = c
        } else if (/\s/.test(c)) {
            if (cur) { tokens.push(cur); cur = '' }
        } else {
            cur += c
        }
    }
    if (cur) tokens.push(cur)
    return tokens
}

export function parseCurl(curlStr) {
    const s = curlStr.trim().replace(/\\\r?\n/g, ' ')
    const tokens = tokenizeCurl(s).filter(t => t !== 'curl')
    const result = {
        method: 'GET', url: '', headers: [], params: [],
        body: { type: 'none', content: '', fields: [] },
        auth: { type: 'none' },
    }
    const dataParts = []
    let explicitMethod = null

    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i]
        const next = () => tokens[++i]
        switch (t) {
            case '-X': case '--request': explicitMethod = next(); break
            case '-H': case '--header': {
                const h = next() || ''
                const idx = h.indexOf(':')
                if (idx === -1) break
                const k = h.slice(0, idx).trim(), v = h.slice(idx + 1).trim()
                if (k.toLowerCase() === 'authorization') {
                    if (v.startsWith('Bearer ')) result.auth = { type: 'bearer', token: v.slice(7) }
                    else if (v.startsWith('Basic ')) {
                        try {
                            const dec = atob(v.slice(6)).split(':')
                            result.auth = { type: 'basic', username: dec[0], password: dec.slice(1).join(':') }
                        } catch { }
                    }
                } else result.headers.push({ id: uid(), key: k, value: v, enabled: true })
                break
            }
            case '-d': case '--data': case '--data-raw': case '--data-binary': case '--data-ascii': case '--data-urlencode':
                dataParts.push(next()); break
            case '-F': case '--form': {
                const f = next() || ''
                const eq = f.indexOf('=')
                const key = eq === -1 ? f : f.slice(0, eq)
                const value = eq === -1 ? '' : f.slice(eq + 1)
                if (value.startsWith('@')) {
                    result.body.fields.push({ id: uid(), key, value: '', enabled: true, type: 'file', fileName: value.slice(1).split(';')[0] })
                } else {
                    result.body.fields.push({ id: uid(), key, value, enabled: true })
                }
                result.body.type = 'multipart'
                break
            }
            case '-u': case '--user': {
                const up = next() || ''
                const [username, ...rest] = up.split(':')
                result.auth = { type: 'basic', username, password: rest.join(':') }
                break
            }
            case '-b': case '--cookie':
                result.headers.push({ id: uid(), key: 'Cookie', value: next() || '', enabled: true })
                break
            case '--url': result.url = next(); break
            case '-k': case '--insecure': case '--compressed': case '-s': case '--silent':
            case '-i': case '--include': case '-v': case '--verbose': case '-L': case '--location':
                break
            default:
                if (!t.startsWith('-') && !result.url) result.url = t
        }
    }

    if (result.url) {
        try {
            const u = new URL(result.url)
            result.url = u.origin + u.pathname
            u.searchParams.forEach((v, k) => result.params.push({ id: uid(), key: k, value: v, enabled: true }))
        } catch { /* relative or malformed — keep as typed */ }
    }

    if (explicitMethod) result.method = explicitMethod.toUpperCase()

    if (result.body.type !== 'multipart' && dataParts.length) {
        const combined = dataParts.join('&')
        if (!explicitMethod) result.method = 'POST'
        try { JSON.parse(combined); result.body = { type: 'json', content: combined, fields: [] } }
        catch { result.body = { type: 'text', content: combined, fields: [] } }
    } else if (result.body.type === 'multipart' && !explicitMethod) {
        result.method = 'POST'
    }

    return result
}

export function importPostmanCollection(json) {
    const col = {
        id: `col_${uid()}`, name: json.info?.name || 'Imported',
        description: '', created: new Date().toISOString(), requests: [], folders: [],
    }
    function flattenItems(items, parentFolderId) {
        ; (items || []).forEach(item => {
            if (item.item) {
                const folder = { id: `fld_${uid()}`, name: item.name || 'Folder', parentId: parentFolderId || null }
                col.folders.push(folder)
                flattenItems(item.item, folder.id)
            } else if (item.request) {
                const r = item.request
                const method = (typeof r.method === 'string' ? r.method : 'GET').toUpperCase()
                let url = typeof r.url === 'string' ? r.url : r.url?.raw || ''
                const headers = (r.header || []).map(h => ({ id: uid(), key: h.key, value: h.value, enabled: !h.disabled }))
                const params = (r.url?.query || []).map(p => ({ id: uid(), key: p.key, value: p.value, enabled: !p.disabled }))
                let body = { type: 'none', content: '', fields: [] }
                if (r.body) {
                    if (r.body.mode === 'raw') body = { type: 'json', content: r.body.raw || '', fields: [] }
                    else if (r.body.mode === 'urlencoded') body = { type: 'form', content: '', fields: (r.body.urlencoded || []).map(f => ({ id: uid(), key: f.key, value: f.value, enabled: !f.disabled })) }
                }
                let auth = { type: 'none' }
                if (r.auth?.type === 'bearer') auth = { type: 'bearer', token: r.auth.bearer?.[0]?.value || '' }
                else if (r.auth?.type === 'basic') auth = { type: 'basic', username: r.auth.basic?.[0]?.value || '', password: r.auth.basic?.[1]?.value || '' }
                col.requests.push({ id: `req_${uid()}`, name: item.name || url, method, url, headers, params, body, auth, folderId: parentFolderId || null, created: new Date().toISOString() })
            }
        })
    }
    flattenItems(json.item, null)
    return col
}

// Insomnia v4 export: a flat `resources` array, each tagged by `_type`.
// request_group == folder (nests via parentId), request == request (nests via parentId too).
export function importInsomniaExport(json) {
    const resources = json.resources || []
    const workspace = resources.find(r => r._type === 'workspace')
    const col = {
        id: `col_${uid()}`, name: workspace?.name || 'Imported',
        description: '', created: new Date().toISOString(), requests: [], folders: [],
    }
    const rootId = workspace?._id
    const folderIdMap = {}
    resources.filter(r => r._type === 'request_group').forEach(g => {
        const folder = { id: `fld_${uid()}`, name: g.name || 'Folder', parentId: null }
        folderIdMap[g._id] = folder
        col.folders.push(folder)
    })
    // second pass: resolve parentId now that every group has a mapped id
    resources.filter(r => r._type === 'request_group').forEach(g => {
        if (g.parentId && g.parentId !== rootId && folderIdMap[g.parentId]) {
            folderIdMap[g._id].parentId = folderIdMap[g.parentId].id
        }
    })
    resources.filter(r => r._type === 'request').forEach(r => {
        const headers = (r.headers || []).map(h => ({ id: uid(), key: h.name, value: h.value, enabled: !h.disabled }))
        const params = (r.parameters || []).map(p => ({ id: uid(), key: p.name, value: p.value, enabled: !p.disabled }))
        let body = { type: 'none', content: '', fields: [] }
        if (r.body?.mimeType === 'application/json') body = { type: 'json', content: r.body.text || '', fields: [] }
        else if (r.body?.mimeType === 'application/x-www-form-urlencoded') body = { type: 'form', content: '', fields: (r.body.params || []).map(f => ({ id: uid(), key: f.name, value: f.value, enabled: !f.disabled })) }
        else if (r.body?.text) body = { type: 'text', content: r.body.text, fields: [] }
        let auth = { type: 'none' }
        if (r.authentication?.type === 'bearer') auth = { type: 'bearer', token: r.authentication.token || '' }
        else if (r.authentication?.type === 'basic') auth = { type: 'basic', username: r.authentication.username || '', password: r.authentication.password || '' }
        col.requests.push({
            id: `req_${uid()}`, name: r.name || r.url || 'Unnamed',
            method: (r.method || 'GET').toUpperCase(), url: r.url || '',
            headers, params, body, auth,
            folderId: folderIdMap[r.parentId]?.id || null,
            created: new Date().toISOString(),
        })
    })
    return col
}

// OpenAPI 3.x import — maps paths × methods into flat requests, one folder per tag if present.
// `raw` can be JSON or YAML; `parseYaml` is the `yaml` package's `parse()` function (caller-supplied
// so this file stays framework/runtime agnostic and the dependency is only paid for when used).
export function importOpenAPI(raw, parseYaml) {
    let spec
    try { spec = JSON.parse(raw) } catch { spec = parseYaml(raw) }
    if (!spec.paths) throw new Error('Not a valid OpenAPI document (missing "paths")')

    const baseUrl = spec.servers?.[0]?.url || ''
    const col = {
        id: `col_${uid()}`, name: spec.info?.title || 'Imported API',
        description: spec.info?.description || '', created: new Date().toISOString(), requests: [], folders: [],
    }
    const folderByTag = {}
    const folderFor = tag => {
        if (!tag) return null
        if (!folderByTag[tag]) {
            const folder = { id: `fld_${uid()}`, name: tag, parentId: null }
            folderByTag[tag] = folder
            col.folders.push(folder)
        }
        return folderByTag[tag].id
    }

    Object.entries(spec.paths).forEach(([path, methods]) => {
        Object.entries(methods).forEach(([method, op]) => {
            if (!['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method)) return
            const headers = [], params = []
            ;(op.parameters || []).forEach(p => {
                const entry = { id: uid(), key: p.name, value: p.example ?? p.schema?.example ?? p.schema?.default ?? '', enabled: true }
                if (p.in === 'header') headers.push(entry)
                else if (p.in === 'query') params.push(entry)
            })
            let body = { type: 'none', content: '', fields: [] }
            const jsonBody = op.requestBody?.content?.['application/json']
            if (jsonBody) {
                const example = jsonBody.example ?? jsonBody.schema?.example
                body = { type: 'json', content: example ? JSON.stringify(example, null, 2) : '', fields: [] }
            }
            col.requests.push({
                id: `req_${uid()}`, name: op.summary || op.operationId || `${method.toUpperCase()} ${path}`,
                method: method.toUpperCase(), url: baseUrl + path,
                headers, params, body, auth: { type: 'none' },
                folderId: folderFor(op.tags?.[0]),
                created: new Date().toISOString(),
            })
        })
    })
    return col
}

/* ── Export ───────────────────────────────────────────────────────────────── */
function bodyToPostman(body) {
    if (!body || body.type === 'none') return undefined
    if (body.type === 'json' || body.type === 'text') return { mode: 'raw', raw: body.content || '' }
    if (body.type === 'form') return { mode: 'urlencoded', urlencoded: (body.fields || []).map(f => ({ key: f.key, value: f.value, disabled: !f.enabled })) }
    if (body.type === 'multipart') return { mode: 'formdata', formdata: (body.fields || []).map(f => ({ key: f.key, value: f.value, type: f.type === 'file' ? 'file' : 'text', disabled: !f.enabled })) }
    return undefined
}

function authToPostman(auth) {
    if (!auth || auth.type === 'none') return undefined
    if (auth.type === 'bearer') return { type: 'bearer', bearer: [{ key: 'token', value: auth.token || '', type: 'string' }] }
    if (auth.type === 'basic') return { type: 'basic', basic: [{ key: 'username', value: auth.username || '', type: 'string' }, { key: 'password', value: auth.password || '', type: 'string' }] }
    return undefined
}

function requestToPostmanItem(r) {
    return {
        name: r.name || r.url,
        request: {
            method: r.method,
            header: (r.headers || []).filter(h => h.key).map(h => ({ key: h.key, value: h.value, disabled: !h.enabled })),
            url: {
                raw: r.url,
                query: (r.params || []).filter(p => p.key).map(p => ({ key: p.key, value: p.value, disabled: !p.enabled })),
            },
            body: bodyToPostman(r.body),
            auth: authToPostman(r.auth),
        },
    }
}

// Recursively nests requests under their folders (Postman's own `item`-of-`item` grouping).
export function exportPostmanCollection(col) {
    const folders = col.folders || []
    const buildFolder = parentId => [
        ...folders.filter(f => f.parentId === (parentId || null)).map(f => ({
            name: f.name,
            item: [...buildFolder(f.id), ...(col.requests || []).filter(r => (r.folderId || null) === f.id).map(requestToPostmanItem)],
        })),
    ]
    const rootItems = [
        ...buildFolder(null),
        ...(col.requests || []).filter(r => !r.folderId).map(requestToPostmanItem),
    ]
    return {
        info: { name: col.name, description: col.description || '', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
        item: rootItems,
    }
}

function bodyToInsomnia(body) {
    if (!body || body.type === 'none') return {}
    if (body.type === 'json') return { mimeType: 'application/json', text: body.content || '' }
    if (body.type === 'text') return { mimeType: 'text/plain', text: body.content || '' }
    if (body.type === 'form') return { mimeType: 'application/x-www-form-urlencoded', params: (body.fields || []).map(f => ({ name: f.key, value: f.value, disabled: !f.enabled })) }
    return {}
}

// Insomnia v4 export — a flat resources[] array; nesting is expressed via parentId references.
export function exportInsomniaCollection(col) {
    const workspaceId = `__WORKSPACE_${uid()}`
    const folders = col.folders || []
    const folderResId = {}
    folders.forEach(f => { folderResId[f.id] = `__GRP_${uid()}` })

    const resources = [
        { _id: workspaceId, _type: 'workspace', name: col.name, description: col.description || '' },
        ...folders.map(f => ({
            _id: folderResId[f.id], _type: 'request_group', name: f.name,
            parentId: f.parentId ? folderResId[f.parentId] : workspaceId,
        })),
        ...(col.requests || []).map(r => ({
            _id: `__REQ_${uid()}`, _type: 'request', name: r.name, method: r.method, url: r.url,
            parentId: r.folderId ? folderResId[r.folderId] : workspaceId,
            headers: (r.headers || []).filter(h => h.key).map(h => ({ name: h.key, value: h.value, disabled: !h.enabled })),
            parameters: (r.params || []).filter(p => p.key).map(p => ({ name: p.key, value: p.value, disabled: !p.enabled })),
            body: bodyToInsomnia(r.body),
            authentication: r.auth?.type === 'bearer' ? { type: 'bearer', token: r.auth.token || '' }
                : r.auth?.type === 'basic' ? { type: 'basic', username: r.auth.username || '', password: r.auth.password || '' }
                : {},
        })),
    ]

    return {
        _type: 'export', __export_format: 4,
        __export_date: new Date().toISOString(), __export_source: 'consolio',
        resources,
    }
}

// Line-based LCS diff — old vs new. Returns null (caller shows a fallback) past the
// size guard below, so a huge response body can't hang the tab on an O(n*m) table.
export function diffLines(oldText = '', newText = '') {
    const a = oldText.split('\n'), b = newText.split('\n')
    if (a.length * b.length > 4_000_000) return null
    const dp = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1))
    for (let i = a.length - 1; i >= 0; i--) {
        for (let j = b.length - 1; j >= 0; j--) {
            dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
        }
    }
    const out = []
    let i = 0, j = 0
    while (i < a.length && j < b.length) {
        if (a[i] === b[j]) { out.push({ type: 'same', line: a[i] }); i++; j++ }
        else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: 'del', line: a[i] }); i++ }
        else { out.push({ type: 'add', line: b[j] }); j++ }
    }
    while (i < a.length) { out.push({ type: 'del', line: a[i] }); i++ }
    while (j < b.length) { out.push({ type: 'add', line: b[j] }); j++ }
    return out
}

export function downloadText(filename, content, mimeType = 'text/plain') {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
}

export function downloadJson(filename, data) {
    downloadText(filename, JSON.stringify(data, null, 2), 'application/json')
}

// results: [{ name, pass, elapsed(ms), error? }] — used by both the UI runner
// ("Export Results") and the CLI headless runner (`consolio run --reporter junit`).
export function buildJUnitXml(suiteName, results) {
    const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    const failures = results.filter(r => !r.pass).length
    const totalTime = results.reduce((s, r) => s + (r.elapsed || 0), 0) / 1000
    const cases = results.map(r => {
        const time = ((r.elapsed || 0) / 1000).toFixed(3)
        if (r.pass) return `  <testcase name="${esc(r.name)}" time="${time}" />`
        return `  <testcase name="${esc(r.name)}" time="${time}">\n    <failure message="${esc(r.error || 'Failed')}"></failure>\n  </testcase>`
    }).join('\n')
    return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="${esc(suiteName)}" tests="${results.length}" failures="${failures}" time="${totalTime.toFixed(3)}">\n${cases}\n</testsuite>\n`
}

