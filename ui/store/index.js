import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { uid, buildCurl, parseCurl, importPostmanCollection, runTests, runScript } from '../utils'

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
                const { getActiveTab, getEnvVars, updateTab, showNotif } = get()
                const tab = getActiveTab()
                if (!tab.url.trim()) { showNotif('Enter a URL first', 'error'); return }

                const envVars = getEnvVars()
                const preResult = runScript(tab.preScript, { envVars: { ...envVars }, request: { method: tab.method, url: tab.url } })
                if (preResult.error) showNotif('Pre-script: ' + preResult.error, 'error')
                const mergedEnv = { ...envVars, ...preResult.modified }

                updateTab(tab.id, { loading: true, response: null, preLogs: preResult.logs })

                try {
                    const res = await apiFetch('/api/execute', {
                        method: 'POST',
                        body: {
                            method: tab.method, url: tab.url.trim(),
                            headers: tab.headers, params: tab.params,
                            body: tab.body, auth: tab.auth,
                            environment: mergedEnv, saveToHistory: true,
                        }
                    })
                    const testResults = runTests(tab.tests, res)
                    const postResult = runScript(tab.postScript, { envVars: mergedEnv, request: { method: tab.method, url: tab.url }, response: res })
                    if (postResult.error) showNotif('Post-script: ' + postResult.error, 'error')
                    updateTab(tab.id, { response: res, loading: false, testResults, postLogs: postResult.logs })
                    apiFetch('/api/history?limit=30').then(h => set({ history: h })).catch(() => { })
                } catch (e) {
                    updateTab(tab.id, { response: { error: e.message }, loading: false, testResults: [] })
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
