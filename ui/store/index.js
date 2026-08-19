import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { uid, buildCurl, parseCurl, importPostmanCollection } from '../utils'

const DEFAULT_PANELS = {
    sidebar: { visible: true, size: 256, minSize: 180, maxSize: 480, order: 0 },
    requestPane: { visible: true, size: 45, minSize: 20, maxSize: 80, order: 1 },
    responsePane: { visible: true, size: 55, minSize: 20, maxSize: 80, order: 2 },
}

function mergePanels(saved) {
    if (!saved) return DEFAULT_PANELS
    const result = { ...DEFAULT_PANELS }
    for (const key of Object.keys(DEFAULT_PANELS)) {
        if (saved[key]) {
            result[key] = { ...DEFAULT_PANELS[key], ...saved[key] }
        }
    }
    return result
}

export function makeTab(overrides = {}) {
    return {
        id: uid(),
        name: 'New Request',
        method: 'GET',
        url: '',
        params: [{ id: uid(), key: '', value: '', enabled: true }],
        headers: [{ id: uid(), key: '', value: '', enabled: true }],
        body: { type: 'none', content: '', fields: [] },
        auth: { type: 'none' },
        preScript: '',
        postScript: '',
        tests: [],
        response: null,
        loading: false,
        testResults: [],
        preLogs: [],
        postLogs: [],
        activeReq: null,
        reqName: '',
        reqTab: 'params',
        wsMode: false,
        wsFrames: [],
        wsConnected: false,
        sseMode: false,
        sseFrames: [],
        sseConnected: false,
        sioMode: false,
        sioFrames: [],
        sioConnected: false,
        grpcMode: false,
        grpcProtoText: '',
        grpcMethodPath: '',
        grpcRequestJson: '',
        grpcMethods: [],
        grpcFrames: [],
        grpcConnected: false,
        ...overrides,
    }
}

/* ── Interceptor filter factory ───────────────────────────────────────────── */
export function makeFilter(overrides = {}) {
    return {
        id: uid(),
        pattern: '',
        mode: 'contains',   // contains | regex | exact | starts_with | ends_with
        target: 'url',      // url | host | method | content_type
        enabled: true,
        ...overrides,
    }
}

/* ── Main store ───────────────────────────────────────────────────────────── */
export const useStore = create(
    persist(
        (set, get) => ({
            /* Collections / envs from server */
            collections: [],
            environments: [],
            activeEnvId: null,
            history: [],
            config: { name: 'Workspace', isProjectMode: false },

            /* Live WebSocket connections, keyed by tab id — not persisted (real live sockets) */
            wsSockets: {},

            /* Tabs */
            tabs: [makeTab()],
            activeTabId: null,   // null = use tabs[0]

            /* Sidebar */
            sbTab: 'collections',
            expandedCols: {},

            /* Panels layout */
            panels: DEFAULT_PANELS,

            /* Customisation modal */
            showCustomise: false,

            /* Interceptor */
            intercepted: [],
            interceptorFilterMode: 'blacklist', // 'blacklist' | 'whitelist'
            interceptorFilters: [],

            /* Modals */
            modal: null,           // 'newCollection' | 'import' | 'runner' | 'settings' | null
            modalData: {},

            /* Notification */
            notif: null,

            /* ── Computed helpers ──────────────────────────────────────────────── */
            getActiveTab() {
                const { tabs, activeTabId } = get()
                return tabs.find(t => t.id === activeTabId) || tabs[0]
            },
            getActiveEnv() {
                const { environments, activeEnvId } = get()
                return environments.find(e => e.id === activeEnvId) || environments[0] || null
            },
            getEnvVars() {
                const env = get().getActiveEnv()
                if (!env) return {}
                return Object.fromEntries(
                    (env.variables || []).filter(v => v.enabled).map(v => [v.key, v.value])
                )
            },

            /* ── Tabs ──────────────────────────────────────────────────────────── */
            newTab(overrides) {
                const t = makeTab(overrides)
                set(s => ({ tabs: [...s.tabs, t], activeTabId: t.id }))
            },
            closeTab(id) {
                set(s => {
                    const tabs = s.tabs.filter(t => t.id !== id)
                    const final = tabs.length ? tabs : [makeTab()]
                    const activeTabId = s.activeTabId === id
                        ? final[Math.max(0, s.tabs.findIndex(t => t.id === id) - 1)]?.id || final[0].id
                        : s.activeTabId
                    return { tabs: final, activeTabId }
                })
            },
            setActiveTab(id) { set({ activeTabId: id }) },
            updateTab(id, patch) {
                set(s => ({ tabs: s.tabs.map(t => t.id === id ? { ...t, ...patch } : t) }))
            },
            updateActiveTab(patch) {
                const { getActiveTab, updateTab } = get()
                updateTab(getActiveTab().id, patch)
            },

            /* ── Request send ──────────────────────────────────────────────────── */
            async sendRequest() {
                const { getActiveTab, getEnvVars, activeEnvId, updateTab, showNotif } = get()
                const tab = getActiveTab()
                if (!tab.url.trim()) { showNotif('Enter a URL first', 'error'); return }

                updateTab(tab.id, { loading: true, response: null })

                try {
                    const res = await apiFetch('/api/execute', {
                        method: 'POST',
                        body: {
                            method: tab.method, url: tab.url.trim(),
                            headers: tab.headers, params: tab.params,
                            body: tab.body, auth: tab.auth,
                            environment: getEnvVars(), saveToHistory: true,
                            preScript: tab.preScript, postScript: tab.postScript,
                            tests: tab.tests, environmentId: activeEnvId,
                        }
                    })
                    if (res.preScriptError) showNotif('Pre-script: ' + res.preScriptError, 'error')
                    if (res.postScriptError) showNotif('Post-script: ' + res.postScriptError, 'error')
                    updateTab(tab.id, {
                        response: res, loading: false,
                        testResults: res.testResults || [],
                        preLogs: res.preLogs || [], postLogs: res.postLogs || [],
                    })
                    if (!res.error) apiFetch('/api/history?limit=30').then(h => set({ history: h })).catch(() => { })
                    if (activeEnvId && res.environment) {
                        apiFetch('/api/environments').then(envs => set({ environments: envs })).catch(() => { })
                    }
                } catch (e) {
                    updateTab(tab.id, { response: { error: e.message }, loading: false, testResults: [] })
                }
            },

            /* ── WebSocket (server proxies the real connection; see server/wsProxy.js) ── */
            appendWsFrame(tabId, frame) {
                set(s => ({ tabs: s.tabs.map(t => t.id === tabId ? { ...t, wsFrames: [...(t.wsFrames || []), frame].slice(-500) } : t) }))
            },
            clearWsFrames() {
                const { getActiveTab, updateTab } = get()
                updateTab(getActiveTab().id, { wsFrames: [] })
            },
            connectWs(url) {
                const { getActiveTab, updateTab, appendWsFrame, disconnectWs, showNotif } = get()
                const tab = getActiveTab()
                if (!url?.trim()) { showNotif('Enter a WebSocket URL first', 'error'); return }
                disconnectWs()
                const tabId = tab.id
                const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
                const sock = new WebSocket(`${proto}://${window.location.host}/ws?type=${encodeURIComponent('ws-proxy:' + tabId)}`)
                sock.onopen = () => {
                    const headerMap = Object.fromEntries((tab.headers || []).filter(h => h.enabled && h.key).map(h => [h.key, h.value]))
                    sock.send(JSON.stringify({ action: 'connect', url: url.trim(), headers: headerMap }))
                }
                sock.onmessage = (ev) => {
                    let msg; try { msg = JSON.parse(ev.data) } catch { return }
                    if (msg.action === 'status') {
                        updateTab(tabId, { wsConnected: !!msg.connected })
                        if (msg.error) { showNotif('WebSocket: ' + msg.error, 'error'); appendWsFrame(tabId, { id: uid(), direction: 'system', timestamp: Date.now(), data: `Error: ${msg.error}` }) }
                        else appendWsFrame(tabId, { id: uid(), direction: 'system', timestamp: Date.now(), data: msg.connected ? 'Connected' : 'Disconnected' })
                    } else if (msg.action === 'message') {
                        appendWsFrame(tabId, { id: uid(), direction: msg.direction || 'in', timestamp: msg.timestamp || Date.now(), data: msg.data })
                    }
                }
                sock.onclose = () => updateTab(tabId, { wsConnected: false })
                set(s => ({ wsSockets: { ...s.wsSockets, [tabId]: sock } }))
            },
            disconnectWs() {
                const { getActiveTab, wsSockets } = get()
                const tabId = getActiveTab().id
                const sock = wsSockets[tabId]
                if (sock) {
                    try { sock.close() } catch { }
                    set(s => { const n = { ...s.wsSockets }; delete n[tabId]; return { wsSockets: n } })
                }
            },
            sendWsMessage(data) {
                const { getActiveTab, wsSockets, showNotif } = get()
                const sock = wsSockets[getActiveTab().id]
                if (sock && sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify({ action: 'send', data }))
                else showNotif('Not connected', 'error')
            },

            /* ── SSE (same server-proxied model as WebSocket, one-way) ───────────── */
            appendSseFrame(tabId, frame) {
                set(s => ({ tabs: s.tabs.map(t => t.id === tabId ? { ...t, sseFrames: [...(t.sseFrames || []), frame].slice(-500) } : t) }))
            },
            clearSseFrames() {
                const { getActiveTab, updateTab } = get()
                updateTab(getActiveTab().id, { sseFrames: [] })
            },
            connectSse(url) {
                const { getActiveTab, updateTab, appendSseFrame, disconnectSse, showNotif } = get()
                const tab = getActiveTab()
                if (!url?.trim()) { showNotif('Enter a URL first', 'error'); return }
                disconnectSse()
                const tabId = tab.id
                const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
                const sock = new WebSocket(`${proto}://${window.location.host}/ws?type=${encodeURIComponent('sse-proxy:' + tabId)}`)
                sock.onopen = () => {
                    const headerMap = Object.fromEntries((tab.headers || []).filter(h => h.enabled && h.key).map(h => [h.key, h.value]))
                    sock.send(JSON.stringify({ action: 'connect', url: url.trim(), headers: headerMap }))
                }
                sock.onmessage = (ev) => {
                    let msg; try { msg = JSON.parse(ev.data) } catch { return }
                    if (msg.action === 'status') {
                        updateTab(tabId, { sseConnected: !!msg.connected })
                        if (msg.error) { showNotif('SSE: ' + msg.error, 'error'); appendSseFrame(tabId, { id: uid(), direction: 'system', timestamp: Date.now(), data: `Error: ${msg.error}` }) }
                        else appendSseFrame(tabId, { id: uid(), direction: 'system', timestamp: Date.now(), data: msg.connected ? 'Connected' : 'Stream closed' })
                    } else if (msg.action === 'message') {
                        appendSseFrame(tabId, { id: uid(), direction: 'in', timestamp: msg.timestamp || Date.now(), data: msg.data })
                    }
                }
                sock.onclose = () => updateTab(tabId, { sseConnected: false })
                set(s => ({ wsSockets: { ...s.wsSockets, [`sse:${tabId}`]: sock } }))
            },
            disconnectSse() {
                const { getActiveTab, wsSockets } = get()
                const key = `sse:${getActiveTab().id}`
                const sock = wsSockets[key]
                if (sock) {
                    try { sock.close() } catch { }
                    set(s => { const n = { ...s.wsSockets }; delete n[key]; return { wsSockets: n } })
                }
            },

            /* ── Socket.io (event-based — same server-proxied model, plus an event name) ── */
            appendSioFrame(tabId, frame) {
                set(s => ({ tabs: s.tabs.map(t => t.id === tabId ? { ...t, sioFrames: [...(t.sioFrames || []), frame].slice(-500) } : t) }))
            },
            clearSioFrames() {
                const { getActiveTab, updateTab } = get()
                updateTab(getActiveTab().id, { sioFrames: [] })
            },
            connectSio(url) {
                const { getActiveTab, updateTab, appendSioFrame, disconnectSio, showNotif } = get()
                const tab = getActiveTab()
                if (!url?.trim()) { showNotif('Enter a URL first', 'error'); return }
                disconnectSio()
                const tabId = tab.id
                const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
                const sock = new WebSocket(`${proto}://${window.location.host}/ws?type=${encodeURIComponent('sio-proxy:' + tabId)}`)
                sock.onopen = () => {
                    const headerMap = Object.fromEntries((tab.headers || []).filter(h => h.enabled && h.key).map(h => [h.key, h.value]))
                    sock.send(JSON.stringify({ action: 'connect', url: url.trim(), headers: headerMap }))
                }
                sock.onmessage = (ev) => {
                    let msg; try { msg = JSON.parse(ev.data) } catch { return }
                    if (msg.action === 'status') {
                        updateTab(tabId, { sioConnected: !!msg.connected })
                        if (msg.error) { showNotif('Socket.io: ' + msg.error, 'error'); appendSioFrame(tabId, { id: uid(), direction: 'system', timestamp: Date.now(), data: `Error: ${msg.error}` }) }
                        else appendSioFrame(tabId, { id: uid(), direction: 'system', timestamp: Date.now(), data: msg.connected ? 'Connected' : 'Disconnected' })
                    } else if (msg.action === 'message') {
                        const dataStr = typeof msg.data === 'string' ? msg.data : JSON.stringify(msg.data)
                        appendSioFrame(tabId, { id: uid(), direction: msg.direction || 'in', timestamp: msg.timestamp || Date.now(), data: `[${msg.event}] ${dataStr}` })
                    }
                }
                sock.onclose = () => updateTab(tabId, { sioConnected: false })
                set(s => ({ wsSockets: { ...s.wsSockets, [`sio:${tabId}`]: sock } }))
            },
            disconnectSio() {
                const { getActiveTab, wsSockets } = get()
                const key = `sio:${getActiveTab().id}`
                const sock = wsSockets[key]
                if (sock) {
                    try { sock.close() } catch { }
                    set(s => { const n = { ...s.wsSockets }; delete n[key]; return { wsSockets: n } })
                }
            },
            emitSio(event, data) {
                const { getActiveTab, wsSockets, showNotif } = get()
                const sock = wsSockets[`sio:${getActiveTab().id}`]
                if (sock && sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify({ action: 'emit', event, data }))
                else showNotif('Not connected', 'error')
            },

            /* ── gRPC (proto pasted in, method picked by full path "pkg.Service/Method") ── */
            appendGrpcFrame(tabId, frame) {
                set(s => ({ tabs: s.tabs.map(t => t.id === tabId ? { ...t, grpcFrames: [...(t.grpcFrames || []), frame].slice(-500) } : t) }))
            },
            clearGrpcFrames() {
                const { getActiveTab, updateTab } = get()
                updateTab(getActiveTab().id, { grpcFrames: [] })
            },
            // Lazily opens (or reuses) the per-tab gRPC control channel, then sends `action`
            // once it's open — used by both loadGrpcProto() and callGrpc().
            grpcSend(action) {
                const { getActiveTab, updateTab, appendGrpcFrame, showNotif } = get()
                const tabId = getActiveTab().id
                const key = `grpc:${tabId}`
                let sock = get().wsSockets[key]
                const doSend = () => sock.send(JSON.stringify(action))
                if (sock && sock.readyState === WebSocket.OPEN) { doSend(); return }
                if (!sock || sock.readyState >= WebSocket.CLOSING) {
                    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
                    sock = new WebSocket(`${proto}://${window.location.host}/ws?type=${encodeURIComponent('grpc-proxy:' + tabId)}`)
                    sock.onmessage = (ev) => {
                        let msg; try { msg = JSON.parse(ev.data) } catch { return }
                        if (msg.action === 'schema') {
                            updateTab(tabId, { grpcMethods: msg.methods || [] })
                            if (msg.error) showNotif('gRPC: ' + msg.error, 'error')
                        } else if (msg.action === 'status') {
                            updateTab(tabId, { grpcConnected: !!msg.connected })
                            if (msg.error) { showNotif('gRPC: ' + msg.error, 'error'); appendGrpcFrame(tabId, { id: uid(), direction: 'system', timestamp: Date.now(), data: `Error: ${msg.error}` }) }
                        } else if (msg.action === 'message') {
                            appendGrpcFrame(tabId, { id: uid(), direction: 'in', timestamp: msg.timestamp || Date.now(), data: JSON.stringify(msg.data) })
                        }
                    }
                    sock.onclose = () => updateTab(tabId, { grpcConnected: false })
                    set(s => ({ wsSockets: { ...s.wsSockets, [key]: sock } }))
                }
                sock.addEventListener('open', doSend, { once: true })
            },
            loadGrpcProto() {
                const { getActiveTab, grpcSend, showNotif } = get()
                const tab = getActiveTab()
                if (!tab.grpcProtoText?.trim()) { showNotif('Paste a .proto file first', 'error'); return }
                grpcSend({ action: 'loadProto', protoText: tab.grpcProtoText })
            },
            callGrpc() {
                const { getActiveTab, grpcSend, showNotif } = get()
                const tab = getActiveTab()
                if (!tab.url?.trim()) { showNotif('Enter the target address (host:port)', 'error'); return }
                if (!tab.grpcMethodPath?.trim()) { showNotif('Pick a method first', 'error'); return }
                grpcSend({ action: 'call', address: tab.url.trim(), protoText: tab.grpcProtoText, methodPath: tab.grpcMethodPath, requestJson: tab.grpcRequestJson })
            },
            disconnectGrpc() {
                const { getActiveTab, wsSockets } = get()
                const key = `grpc:${getActiveTab().id}`
                const sock = wsSockets[key]
                if (sock) {
                    try { sock.close() } catch { }
                    set(s => { const n = { ...s.wsSockets }; delete n[key]; return { wsSockets: n } })
                }
            },

            /* ── Collections ───────────────────────────────────────────────────── */
            loadRequest(col, req) {
                const { getActiveTab, updateTab } = get()
                updateTab(getActiveTab().id, {
                    activeReq: { colId: col.id, reqId: req.id },
                    method: req.method || 'GET',
                    url: req.url || '',
                    params: req.params?.length ? req.params : [{ id: uid(), key: '', value: '', enabled: true }],
                    headers: req.headers?.length ? req.headers : [{ id: uid(), key: '', value: '', enabled: true }],
                    body: req.body || { type: 'none', content: '', fields: [] },
                    auth: req.auth || { type: 'none' },
                    preScript: req.preScript || '',
                    postScript: req.postScript || '',
                    tests: req.tests || [],
                    reqName: req.name || '',
                    response: null, testResults: [], preLogs: [], postLogs: [],
                    reqTab: 'params',
                    // Protocol mode isn't a persisted field on saved requests — always land
                    // back in plain HTTP mode when opening one, even if this tab was previously
                    // left in WS/SSE/Socket.IO/gRPC mode.
                    wsMode: false, sseMode: false, sioMode: false, grpcMode: false,
                })
            },
            async saveRequest() {
                const { getActiveTab, collections, showNotif } = get()
                const tab = getActiveTab()
                const payload = {
                    name: tab.reqName || tab.url || 'New Request',
                    method: tab.method, url: tab.url,
                    params: tab.params, headers: tab.headers,
                    body: tab.body, auth: tab.auth,
                    preScript: tab.preScript, postScript: tab.postScript,
                    tests: tab.tests,
                }
                if (!tab.activeReq) {
                    if (!collections.length) { showNotif('Create a collection first', 'error'); return }
                    const col = collections[0]
                    const req = await apiFetch(`/api/collections/${col.id}/requests`, { method: 'POST', body: payload })
                    const cols = await apiFetch('/api/collections')
                    set({ collections: cols })
                    get().updateActiveTab({ activeReq: { colId: col.id, reqId: req.id } })
                    showNotif('Saved to ' + col.name, 'success')
                } else {
                    await apiFetch(`/api/collections/${tab.activeReq.colId}/requests/${tab.activeReq.reqId}`, { method: 'PUT', body: payload })
                    set({ collections: await apiFetch('/api/collections') })
                    showNotif('Saved', 'success')
                }
            },

            /* ── Panels ────────────────────────────────────────────────────────── */
            togglePanel(key) {
                set(s => ({ panels: { ...s.panels, [key]: { ...s.panels[key], visible: !s.panels[key].visible } } }))
            },
            updatePanelSize(key, size) {
                set(s => ({ panels: { ...s.panels, [key]: { ...s.panels[key], size } } }))
            },
            resetPanels() { set({ panels: DEFAULT_PANELS }) },

            /* ── Interceptor ───────────────────────────────────────────────────── */
            addIntercepted(entry) {
                const { interceptorFilterMode, interceptorFilters } = get()
                const filters = interceptorFilters.filter(f => f.enabled && f.pattern)

                const matches = (entry, filter) => {
                    const val = filter.target === 'url' ? entry.url || ''
                        : filter.target === 'host' ? (() => { try { return new URL(entry.url).hostname } catch { return '' } })()
                            : filter.target === 'method' ? entry.method || ''
                                : filter.target === 'content_type' ? (entry.requestHeaders?.['content-type'] || '')
                                    : ''
                    const p = filter.pattern
                    switch (filter.mode) {
                        case 'contains': return val.toLowerCase().includes(p.toLowerCase())
                        case 'exact': return val === p
                        case 'starts_with': return val.toLowerCase().startsWith(p.toLowerCase())
                        case 'ends_with': return val.toLowerCase().endsWith(p.toLowerCase())
                        case 'regex': try { return new RegExp(p).test(val) } catch { return false }
                        default: return false
                    }
                }

                const anyMatch = filters.length ? filters.some(f => matches(entry, f)) : false

                if (interceptorFilterMode === 'blacklist' && anyMatch) return
                if (interceptorFilterMode === 'whitelist' && filters.length && !anyMatch) return

                set(s => ({ intercepted: [entry, ...s.intercepted].slice(0, 200) }))
            },
            clearIntercepted() { set({ intercepted: [] }) },
            setFilterMode(mode) { set({ interceptorFilterMode: mode }) },
            addFilter(overrides) {
                set(s => ({ interceptorFilters: [...s.interceptorFilters, makeFilter(overrides)] }))
            },
            updateFilter(id, patch) {
                set(s => ({ interceptorFilters: s.interceptorFilters.map(f => f.id === id ? { ...f, ...patch } : f) }))
            },
            deleteFilter(id) {
                set(s => ({ interceptorFilters: s.interceptorFilters.filter(f => f.id !== id) }))
            },

            /* ── Notifications ─────────────────────────────────────────────────── */
            showNotif(msg, type = 'success') {
                set({ notif: { msg, type, id: uid() } })
                setTimeout(() => set(s => s.notif?.msg === msg ? { notif: null } : s), 2800)
            },

            /* ── Bootstrap ─────────────────────────────────────────────────────── */
            async boot() {
                try {
                    const [cols, envs, hist, cfg] = await Promise.all([
                        apiFetch('/api/collections'), apiFetch('/api/environments'),
                        apiFetch('/api/history?limit=30'), apiFetch('/api/config'),
                    ])
                    set(s => ({
                        collections: cols, environments: envs, history: hist, config: cfg,
                        activeEnvId: s.activeEnvId || envs[0]?.id || null,
                        expandedCols: cols.length ? { [cols[0].id]: true } : {},
                    }))
                } catch { }
            },
        }),
        {
            name: 'consolio-ui',
            partialize: s => ({
                panels: s.panels,
                interceptorFilterMode: s.interceptorFilterMode,
                interceptorFilters: s.interceptorFilters,
                activeEnvId: s.activeEnvId,
                expandedCols: s.expandedCols,
            }),
            // Merge persisted panels with DEFAULT_PANELS so any missing fields
            // (e.g. from an older saved schema) are always filled in safely.
            merge: (persisted, current) => ({
                ...current,
                ...persisted,
                panels: mergePanels(persisted?.panels),
            }),
        }
    )
)

/* ── API helper ───────────────────────────────────────────────────────────── */
export async function apiFetch(path, opts = {}) {
    const res = await fetch(window.location.origin + path, {
        headers: { 'Content-Type': 'application/json' },
        ...opts,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
    })
    return res.json()
}
