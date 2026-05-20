import { useStore, apiFetch } from '../../store'
import { Icon, IconBtn, MethodBadge } from '../shared'
import { timeAgo, uid } from '../../utils'
import styles from './Sidebar.module.css'

export function Sidebar() {
  const sbTab        = useStore(s => s.sbTab)
  const collections  = useStore(s => s.collections)
  const history      = useStore(s => s.history)
  const intercepted  = useStore(s => s.intercepted)
  const expandedCols = useStore(s => s.expandedCols)
  const loadRequest  = useStore(s => s.loadRequest)
  const showNotif    = useStore(s => s.showNotif)
  const tabs         = useStore(s => s.tabs)
  const activeTabId  = useStore(s => s.activeTabId)
  const activeReq    = (tabs.find(t => t.id === activeTabId) || tabs[0])?.activeReq

  const setSbTab = t => useStore.setState({ sbTab: t })

  const toggleCol = id => useStore.setState(s => ({
    expandedCols: { ...s.expandedCols, [id]: !s.expandedCols[id] }
  }))

  const deleteCollection = async (id, e) => {
    e.stopPropagation()
    await apiFetch(`/api/collections/${id}`, { method: 'DELETE' })
    useStore.setState({ collections: await apiFetch('/api/collections') })
    showNotif('Deleted', 'success')
  }

  const addRequest = async (colId, e) => {
    e.stopPropagation()
    const req = await apiFetch(`/api/collections/${colId}/requests`, {
      method: 'POST', body: { name: 'New Request', method: 'GET', url: '' }
    })
    const cols = await apiFetch('/api/collections')
    useStore.setState({
      collections: cols,
      expandedCols: { ...useStore.getState().expandedCols, [colId]: true }
    })
    const col = cols.find(c => c.id === colId)
    if (col) loadRequest(col, req)
  }

  const loadIntercepted = (item) => {
    useStore.getState().updateActiveTab({
      method:  item.method || 'GET',
      url:     item.url || '',
      headers: Object.entries(item.requestHeaders || {}).map(([k, v]) => ({ id: uid(), key: k, value: v, enabled: true })),
      body:    { type: 'none', content: '', fields: [] },
      reqName: 'Intercepted',
      response: null,
    })
    setSbTab('collections')
  }

  const loadHistory = (h) => {
    useStore.getState().updateActiveTab({
      method:   h.request.method || 'GET',
      url:      h.response?.finalUrl || h.request.url || '',
      response: h.response,
      activeReq: null,
    })
  }

  return (
    <aside className={styles.sidebar}>
      {/* Tab bar */}
      <div className={styles.tabBar}>
        {[
          ['collections', 'folder',  'Cols'],
          ['history',     'history', 'Hist'],
          ['interceptor', 'globe',   'Tap'],
        ].map(([key, icon, label]) => (
          <button
            key={key}
            className={`${styles.tab} ${sbTab === key ? styles.tabActive : ''}`}
            onClick={() => setSbTab(key)}
          >
            <Icon name={icon} size={12} />{label}
          </button>
        ))}
        <div className={styles.tabSpacer} />
        {sbTab === 'collections' && (
          <>
            <IconBtn name="upload" size={13} title="Import cURL / Postman" onClick={() => useStore.setState({ modal: 'import' })} />
            <IconBtn name="play"   size={13} title="Run collection"        onClick={() => useStore.setState({ modal: 'runner' })} />
            <IconBtn name="plus"   size={13} title="New collection"        onClick={() => useStore.setState({ modal: 'newCollection', modalData: {} })} />
          </>
        )}
        {sbTab === 'interceptor' && (
          <IconBtn name="x" size={13} title="Clear all intercepted" onClick={() => useStore.getState().clearIntercepted()} />
        )}
      </div>

      {/* Content */}
      <div className={styles.content}>
        {/* Collections */}
        {sbTab === 'collections' && (
          <>
            {collections.length === 0 && (
              <div className={styles.empty}>
                No collections yet.<br />
                <button className={styles.emptyLink} onClick={() => useStore.setState({ modal: 'newCollection', modalData: {} })}>
                  Create one →
                </button>
              </div>
            )}
            {collections.map(col => (
              <div key={col.id} className={styles.colItem}>
                <div className={styles.colHeader} onClick={() => toggleCol(col.id)}>
                  <Icon
                    name="chevRight" size={11}
                    className={`${styles.arrow} ${expandedCols[col.id] ? styles.arrowOpen : ''}`}
                  />
                  <Icon name="folder" size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <span className={styles.colName}>{col.name}</span>
                  <span className={styles.colCount}>{col.requests?.length || 0}</span>
                  <IconBtn name="plus"  size={11} title="Add request" onClick={e => addRequest(col.id, e)} />
                  <IconBtn name="trash" size={11} title="Delete collection" onClick={e => deleteCollection(col.id, e)} className={styles.danger} />
                </div>
                {expandedCols[col.id] && (
                  <div className={styles.reqList}>
                    {(col.requests || []).map(req => (
                      <div
                        key={req.id}
                        className={`${styles.reqItem} ${activeReq?.colId === col.id && activeReq?.reqId === req.id ? styles.reqActive : ''}`}
                        onClick={() => loadRequest(col, req)}
                      >
                        <MethodBadge method={req.method || 'GET'} small />
                        <span className={styles.reqName}>{req.name || req.url || 'Unnamed'}</span>
                      </div>
                    ))}
                    {col.requests?.length === 0 && (
                      <p className={styles.noReqs}>No requests yet</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {/* History */}
        {sbTab === 'history' && (
          <>
            {history.length === 0 && <p className={styles.empty}>No history yet</p>}
            {history.map(h => (
              <div key={h.id} className={styles.histItem} onClick={() => loadHistory(h)}>
                <MethodBadge method={h.request.method || 'GET'} small />
                <StatusChip status={h.response?.status} />
                <span className={styles.histUrl}>{h.request.url || ''}</span>
                <span className={styles.histTime}>{timeAgo(h.timestamp)}</span>
              </div>
            ))}
          </>
        )}

        {/* Interceptor */}
        {sbTab === 'interceptor' && (
          <InterceptorPane intercepted={intercepted} onLoad={loadIntercepted} />
        )}
      </div>
    </aside>
  )
}

/* ── Status chip ──────────────────────────────────────────────────────────── */
function StatusChip({ status }) {
  const cls = !status      ? ''
    : status < 300         ? styles.s2xx
    : status < 400         ? styles.s3xx
    : status < 500         ? styles.s4xx
    : styles.s5xx
  return <span className={`${styles.statusChip} ${cls}`}>{status || '—'}</span>
}

/* ── Interceptor pane ─────────────────────────────────────────────────────── */
function InterceptorPane({ intercepted, onLoad }) {
  const filterMode   = useStore(s => s.interceptorFilterMode)
  const filters      = useStore(s => s.interceptorFilters)
  const setFilterMode = useStore(s => s.setFilterMode)
  const addFilter    = useStore(s => s.addFilter)
  const updateFilter = useStore(s => s.updateFilter)
  const deleteFilter = useStore(s => s.deleteFilter)

  return (
    <div className={styles.interceptor}>
      {/* Mode toggle + filter rules */}
      <div className={styles.filterHeader}>
        <Icon name="filter" size={12} style={{ color: 'var(--accent)' }} />
        <span className={styles.filterTitle}>Filter rules</span>
        <div className={styles.modeToggle}>
          {[
            ['blacklist', 'ban',    'Block'],
            ['whitelist', 'shield', 'Allow only'],
          ].map(([m, icon, label]) => (
            <button
              key={m}
              className={`${styles.modeBtn} ${filterMode === m ? styles.modeBtnActive : ''}`}
              onClick={() => setFilterMode(m)}
              title={m === 'blacklist' ? 'Block matching requests' : 'Allow only matching requests'}
            >
              <Icon name={icon} size={10} />{label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.filterList}>
        {filters.map(f => (
          <div key={f.id} className={styles.filterRow}>
            <input
              type="checkbox"
              className={styles.filterCheck}
              checked={f.enabled}
              onChange={e => updateFilter(f.id, { enabled: e.target.checked })}
            />
            <select
              className={styles.filterSel}
              value={f.target}
              onChange={e => updateFilter(f.id, { target: e.target.value })}
            >
              <option value="url">URL</option>
              <option value="host">Host</option>
              <option value="method">Method</option>
              <option value="content_type">Content-Type</option>
            </select>
            <select
              className={styles.filterSel}
              value={f.mode}
              onChange={e => updateFilter(f.id, { mode: e.target.value })}
            >
              <option value="contains">contains</option>
              <option value="starts_with">starts with</option>
              <option value="ends_with">ends with</option>
              <option value="exact">exact</option>
              <option value="regex">regex</option>
            </select>
            <input
              className={styles.filterInput}
              placeholder="pattern…"
              value={f.pattern}
              onChange={e => updateFilter(f.id, { pattern: e.target.value })}
            />
            <button className={styles.filterDel} onClick={() => deleteFilter(f.id)}>
              <Icon name="x" size={10} />
            </button>
          </div>
        ))}

        {filters.length === 0 && (
          <p className={styles.filterEmpty}>
            {filterMode === 'blacklist'
              ? 'No block rules — all requests captured'
              : 'No allow rules — nothing will be captured'}
          </p>
        )}

        <button className={styles.addFilter} onClick={() => addFilter()}>
          <Icon name="plus" size={11} /> Add rule
        </button>
      </div>

      {/* Captured list */}
      <div className={styles.interceptDivider}>
        Captured ({intercepted.length})
      </div>

      {intercepted.length === 0
        ? <p className={styles.empty} style={{ marginTop: 12 }}>Waiting for requests…</p>
        : intercepted.map((item, i) => (
          <div key={i} className={styles.capturedItem} onClick={() => onLoad(item)}>
            <div className={styles.capturedMeta}>
              <MethodBadge method={item.method || 'GET'} small />
              {item.status && <StatusChip status={item.status} />}
              <span className={styles.capturedTime}>
                {timeAgo(item.timestamp || new Date().toISOString())}
              </span>
            </div>
            <div className={styles.capturedUrl}>{item.url}</div>
          </div>
        ))
      }
    </div>
  )
}
