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

export function applyEnv(str, env = {}) {
    if (!str) return str
    return str.replace(/\{\{(\w+)\}\}/g, (_, k) => env[k] ?? `{{${k}}}`)
}

export function buildCurl({ method, url, headers = [], params = [], body, auth, environment = {} }) {
    const ae = s => applyEnv(s, environment)
    let finalUrl = ae(url || '')
    const ep = params.filter(p => p.enabled && p.key)
    if (ep.length) {
        try {
            const u = new URL(finalUrl.startsWith('http') ? finalUrl : 'https://' + finalUrl)
            ep.forEach(p => u.searchParams.set(p.key, ae(p.value || '')))
            finalUrl = u.toString()
        } catch { }
    }
    const hmap = {}
    headers.filter(h => h.enabled && h.key).forEach(h => { hmap[h.key] = ae(h.value) })
    if (auth) {
        if (auth.type === 'bearer' && auth.token)
            hmap['Authorization'] = `Bearer ${ae(auth.token)}`
        else if (auth.type === 'basic' && auth.username)
            hmap['Authorization'] = 'Basic ' + btoa(`${ae(auth.username)}:${ae(auth.password || '')}`)
        else if (auth.type === 'apikey' && auth.key && auth.placement === 'header')
            hmap[auth.key] = ae(auth.value || '')
    }
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
        }
    }
    parts.push(`  '${finalUrl}'`)
    return parts.join(' \\\n')
}

export function parseCurl(curlStr) {
    const s = curlStr.trim().replace(/\\\n/g, ' ').replace(/\s+/g, ' ')
    const result = {
        method: 'GET', url: '', headers: [], params: [],
        body: { type: 'none', content: '', fields: [] },
        auth: { type: 'none' },
    }
    const urlMatch = s.match(/curl\s+(?:-[^'\s]+\s+[^\s]+\s+)*['"]?(https?:\/\/[^\s'"]+|localhost[^\s'"]*|127\.[^\s'"]*)/i)
    if (urlMatch) {
        try {
            const u = new URL(urlMatch[1])
            result.url = u.origin + u.pathname
            u.searchParams.forEach((v, k) => result.params.push({ id: uid(), key: k, value: v, enabled: true }))
        } catch { result.url = urlMatch[1] }
    }
    const mMatch = s.match(/-X\s+([A-Z]+)/); if (mMatch) result.method = mMatch[1]
    const hRe = /-H\s+['"]([^'"]+)['"]/g; let hm
    while ((hm = hRe.exec(s)) !== null) {
        const [k, ...vp] = hm[1].split(/:\s*/); const v = vp.join(': ')
        if (k && v) {
            if (k.toLowerCase() === 'authorization') {
                if (v.startsWith('Bearer ')) result.auth = { type: 'bearer', token: v.slice(7) }
                else if (v.startsWith('Basic ')) {
                    const dec = atob(v.slice(6)).split(':')
                    result.auth = { type: 'basic', username: dec[0], password: dec.slice(1).join(':') }
                }
            } else result.headers.push({ id: uid(), key: k, value: v, enabled: true })
        }
    }
    const dMatch = s.match(/-d\s+'([\s\S]+?)'\s*(?:\\|$)/) || s.match(/-d\s+"([\s\S]+?)"\s*(?:\\|$)/)
    if (dMatch) {
        const d = dMatch[1]
        try { JSON.parse(d); result.body = { type: 'json', content: d, fields: [] } }
        catch { result.body = { type: 'text', content: d, fields: [] } }
    }
    return result
}

export function importPostmanCollection(json) {
    const col = {
        id: `col_${uid()}`, name: json.info?.name || 'Imported',
        description: '', created: new Date().toISOString(), requests: [],
    }
    function flattenItems(items) {
        ; (items || []).forEach(item => {
            if (item.item) flattenItems(item.item)
            else if (item.request) {
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
                col.requests.push({ id: `req_${uid()}`, name: item.name || url, method, url, headers, params, body, auth, created: new Date().toISOString() })
            }
        })
    }
    flattenItems(json.item)
    return col
}

export function runTests(tests, response) {
    return (tests || []).map(t => {
        try {
            let pass = false, actual = ''
            switch (t.type) {
                case 'status': pass = response.status === parseInt(t.value); actual = String(response.status); break
                case 'status_lt': pass = response.status < parseInt(t.value); actual = String(response.status); break
                case 'has_header': { const k = t.value.toLowerCase(); pass = !!response.headers?.[k]; actual = response.headers?.[k] || '(missing)'; break }
                case 'body_contains': pass = (response.body || '').includes(t.value); actual = pass ? '✓' : '✗'; break
                case 'body_json_path': {
                    try {
                        const parsed = JSON.parse(response.body)
                        const parts = t.path.split('.')
                        let cur = parsed; parts.forEach(p => { cur = cur?.[p] })
                        actual = JSON.stringify(cur); pass = actual === t.value || cur == t.value
                    } catch { actual = 'parse error'; pass = false }
                    break
                }
                case 'response_time': pass = response.elapsed <= parseInt(t.value); actual = fmtTime(response.elapsed); break
                case 'body_not_empty': pass = !!(response.body?.trim()); actual = pass ? 'has body' : 'empty'; break
                default: pass = false; actual = 'unknown type'
            }
            return { ...t, pass, actual, ran: true }
        } catch (e) { return { ...t, pass: false, actual: e.message, ran: true } }
    })
}

export function runScript(code, context) {
    if (!code?.trim()) return { logs: [], error: null, modified: {} }
    try {
        const logs = []
        const modified = {}
        const consolio = {
            log: (...a) => logs.push(a.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' ')),
            setVariable: (k, v) => { context.envVars[k] = v; modified[k] = v },
            getVariable: (k) => context.envVars[k],
        }
        // eslint-disable-next-line no-new-func
        const fn = new Function('consolio', 'request', 'response', 'environment', code)
        fn(consolio, context.request || {}, context.response || {}, context.envVars || {})
        return { logs, error: null, modified }
    } catch (e) { return { logs: [], error: e.message, modified: {} } }
}
