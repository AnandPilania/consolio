import { useState, useEffect } from 'react'
import { useStore, apiFetch } from '../../store'
import { cn } from '@/lib/utils'
import { ChevronRight, Folder, X, Plus, Shield, Trash2 } from 'lucide-react'
import { Icon, IconBtn, MethodBadge } from '../shared'
import { timeAgo, uid, exportPostmanCollection, exportInsomniaCollection, exportOpenAPI, downloadJson } from '../../utils'

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
  const [creatingFolderIn, setCreatingFolderIn] = useState(null) // { colId, parentId }
  const [scores, setScores] = useState({}) // colId -> { score, grade }

  const setSbTab = t => useStore.setState({ sbTab: t })

  const toggleCol = id => useStore.setState(s => ({
    expandedCols: { ...s.expandedCols, [id]: !s.expandedCols[id] }
  }))
  const expand = id => useStore.setState(s => ({ expandedCols: { ...s.expandedCols, [id]: true } }))

  const refreshCollections = async () => {
    useStore.setState({ collections: await apiFetch('/api/collections') })
  }

  const deleteCollection = async (id, e) => {
    e.stopPropagation()
    await apiFetch(`/api/collections/${id}`, { method: 'DELETE' })
    await refreshCollections()
    showNotif('Deleted', 'success')
  }

  const addRequest = async (colId, e, folderId = null) => {
    e.stopPropagation()
    const req = await apiFetch(`/api/collections/${colId}/requests`, {
      method: 'POST', body: { name: 'New Request', method: 'GET', url: '', folderId }
    })
    const cols = await apiFetch('/api/collections')
    useStore.setState(s => ({
      collections: cols,
      expandedCols: { ...s.expandedCols, [colId]: true, ...(folderId ? { [folderId]: true } : {}) }
    }))
    const col = cols.find(c => c.id === colId)
    if (col) loadRequest(col, req)
  }

  const startCreateFolder = (colId, parentId, e) => {
    e.stopPropagation()
    expand(parentId || colId)
    setCreatingFolderIn({ colId, parentId })
  }

  const submitNewFolder = async (colId, parentId, name) => {
    if (name.trim()) {
      await apiFetch(`/api/collections/${colId}/folders`, { method: 'POST', body: { name: name.trim(), parentId } })
      await refreshCollections()
    }
    setCreatingFolderIn(null)
  }

  const deleteFolder = async (colId, folderId, e) => {
    e.stopPropagation()
    await apiFetch(`/api/collections/${colId}/folders/${folderId}`, { method: 'DELETE' })
    await refreshCollections()
    showNotif('Folder deleted', 'success')
  }

  const moveRequest = async (colId, reqId, folderId) => {
    await apiFetch(`/api/collections/${colId}/requests/${reqId}`, { method: 'PUT', body: { folderId } })
    await refreshCollections()
  }

  const exportCollection = (col, format) => {
    const data = format === 'postman' ? exportPostmanCollection(col)
      : format === 'openapi' ? exportOpenAPI(col)
      : exportInsomniaCollection(col)
    downloadJson(`${(col.name || 'collection').replace(/\s+/g, '_')}.${format}.json`, data)
  }

  useEffect(() => {
    collections.forEach(col => {
      if (!col.requests?.length) return
      apiFetch(`/api/collections/${col.id}/score`)
        .then(s => setScores(prev => ({ ...prev, [col.id]: { score: s.score, grade: s.grade } })))
        .catch(() => {})
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collections.map(c => `${c.id}:${c.requests?.length || 0}`).join(',')])

  const reqItemClass = 'mx-1.5 flex items-center gap-1.5 rounded-sm py-1 pr-1.5 cursor-pointer transition-colors hover:bg-[var(--bg-raised)]'

  const renderNewFolderInput = (colId, parentId, depth) => (
    <div className={reqItemClass} style={{ paddingLeft: 24 + depth * 14 }} key="__new_folder">
      <Folder size={11} className="shrink-0 text-[var(--tx-faint)]" />
      <input
        autoFocus
        className="min-w-0 flex-1 rounded-sm border border-primary bg-[var(--bg-raised)] px-1.5 py-0.5 text-[11.5px] text-foreground outline-none"
        placeholder="Folder name…"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => {
          if (e.key === 'Enter') submitNewFolder(colId, parentId, e.target.value)
          else if (e.key === 'Escape') setCreatingFolderIn(null)
        }}
        onBlur={e => submitNewFolder(colId, parentId, e.target.value)}
      />
    </div>
  )

  const renderRequestRow = (col, req, depth) => {
    const active = activeReq?.colId === col.id && activeReq?.reqId === req.id
    return (
      <div
        key={req.id}
        className={cn(reqItemClass, active && 'bg-[var(--accent-dim)]!')}
        style={{ paddingLeft: 24 + depth * 14 }}
        onClick={() => loadRequest(col, req)}
      >
        <MethodBadge method={req.method || 'GET'} small />
        <span className={cn('flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[11.5px] text-muted-foreground', active && 'text-foreground')}>
          {req.name || req.url || 'Unnamed'}
        </span>
        {col.folders?.length > 0 && (
          <select
            className="max-w-[72px] shrink-0 cursor-pointer bg-transparent text-[10px] text-[var(--tx-faint)] hover:text-muted-foreground"
            value={req.folderId || ''}
            onClick={e => e.stopPropagation()}
            onChange={e => moveRequest(col.id, req.id, e.target.value || null)}
            title="Move to folder"
          >
            <option value="">— root —</option>
            {col.folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        )}
      </div>
    )
  }

  const renderFolderNode = (col, folder, depth) => {
    const isOpen = !!expandedCols[folder.id]
    const childFolders  = (col.folders || []).filter(f => f.parentId === folder.id)
    const childRequests = (col.requests || []).filter(r => (r.folderId || null) === folder.id)
    return (
      <div key={folder.id}>
        <div
          className={reqItemClass}
          style={{ paddingLeft: 10 + depth * 14 }}
          onClick={() => toggleCol(folder.id)}
        >
          <ChevronRight size={10} className={cn('shrink-0 text-[var(--tx-faint)] transition-transform', isOpen && 'rotate-90')} />
          <Folder size={11} className="shrink-0 text-[var(--tx-faint)]" />
          <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[11.5px] font-semibold text-muted-foreground">{folder.name}</span>
          <IconBtn name="plus"   size={10} title="Add request"  onClick={e => addRequest(col.id, e, folder.id)} />
          <IconBtn name="folder" size={10} title="Add subfolder" onClick={e => startCreateFolder(col.id, folder.id, e)} />
          <IconBtn name="trash"  size={10} title="Delete folder" onClick={e => deleteFolder(col.id, folder.id, e)} danger />
        </div>
        {isOpen && (
          <div className="py-px pb-1">
            {childFolders.map(f => renderFolderNode(col, f, depth + 1))}
            {creatingFolderIn?.colId === col.id && creatingFolderIn?.parentId === folder.id && renderNewFolderInput(col.id, folder.id, depth + 1)}
            {childRequests.map(req => renderRequestRow(col, req, depth + 1))}
          </div>
        )}
      </div>
    )
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
    <aside className="flex h-full flex-col overflow-hidden bg-[var(--bg-surface)]">
      {/* Tab bar */}
      <div className="flex shrink-0 items-center gap-0.5 border-b border-[var(--bd-faint)] px-2 py-1.5">
        {[
          ['collections', 'folder',  'Cols'],
          ['history',     'history', 'Hist'],
          ['interceptor', 'globe',   'Tap'],
        ].map(([key, icon, label]) => (
          <button
            key={key}
            className={cn(
              'flex items-center gap-1 rounded-sm px-2.5 py-1 text-[10.5px] font-semibold tracking-wide uppercase text-[var(--tx-faint)] transition-colors hover:bg-[var(--bg-raised)] hover:text-muted-foreground',
              sbTab === key && 'bg-[var(--accent-dim)] text-primary! hover:text-primary!'
            )}
            onClick={() => setSbTab(key)}
          >
            <Icon name={icon} size={12} />{label}
          </button>
        ))}
        <div className="flex-1" />
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
      <div className="flex-1 overflow-y-auto py-1.5">
        {/* Collections */}
        {sbTab === 'collections' && (
          <>
            {collections.length === 0 && (
              <div className="px-4 py-5 text-center text-[12px] leading-[1.7] text-[var(--tx-faint)]">
                No collections yet.<br />
                <button className="mt-1.5 inline-block text-[12px] text-primary underline" onClick={() => useStore.setState({ modal: 'newCollection', modalData: {} })}>
                  Create one →
                </button>
              </div>
            )}
            {collections.map(col => (
              <div key={col.id} className="mb-px px-1.5">
                <div className="flex cursor-pointer items-center gap-1.5 rounded-sm px-1.5 py-1 transition-colors hover:bg-[var(--bg-raised)]" onClick={() => toggleCol(col.id)}>
                  <ChevronRight size={11} className={cn('shrink-0 text-[var(--tx-faint)] transition-transform', expandedCols[col.id] && 'rotate-90')} />
                  <Folder size={12} className="shrink-0 text-primary" />
                  <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[11.5px] font-semibold text-foreground">{col.name}</span>
                  <span className="rounded-full bg-[var(--bg-overlay)] px-1.5 py-px text-[10px] text-[var(--tx-faint)]">{col.requests?.length || 0}</span>
                  {scores[col.id] && (
                    <GradeChip
                      grade={scores[col.id].grade}
                      title={`API readiness score: ${scores[col.id].score}/100`}
                      onClick={e => { e.stopPropagation(); useStore.setState({ modal: 'dashboard', modalData: { collectionId: col.id } }) }}
                    />
                  )}
                  <select
                    className="max-w-[58px] shrink-0 cursor-pointer bg-transparent text-[10px] text-[var(--tx-faint)] hover:text-muted-foreground"
                    value=""
                    onClick={e => e.stopPropagation()}
                    onChange={e => { if (e.target.value) exportCollection(col, e.target.value); e.target.value = '' }}
                    title="Export collection"
                  >
                    <option value="" disabled>Export…</option>
                    <option value="postman">as Postman</option>
                    <option value="insomnia">as Insomnia</option>
                    <option value="openapi">as OpenAPI 3.1</option>
                  </select>
                  <IconBtn name="plus"   size={11} title="Add request" onClick={e => addRequest(col.id, e)} />
                  <IconBtn name="shield" size={11} title="Audience profiles" onClick={e => { e.stopPropagation(); useStore.setState({ modal: 'profiles', modalData: { collectionId: col.id } }) }} />
                  <IconBtn name="folder" size={11} title="Add folder"  onClick={e => startCreateFolder(col.id, null, e)} />
                  <IconBtn name="trash"  size={11} title="Delete collection" onClick={e => deleteCollection(col.id, e)} danger />
                </div>
                {expandedCols[col.id] && (
                  <div className="py-px pb-1">
                    {(col.folders || []).filter(f => !f.parentId).map(f => renderFolderNode(col, f, 0))}
                    {creatingFolderIn?.colId === col.id && creatingFolderIn?.parentId === null && renderNewFolderInput(col.id, null, 0)}
                    {(col.requests || []).filter(r => !r.folderId).map(req => renderRequestRow(col, req, 0))}
                    {col.requests?.length === 0 && !(col.folders?.length) && (
                      <p className="px-6 py-1 text-[10.5px] text-[var(--tx-faint)]">No requests yet</p>
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
            {history.length === 0 && <p className="px-4 py-5 text-center text-[12px] leading-[1.7] text-[var(--tx-faint)]">No history yet</p>}
            {history.map(h => (
              <div key={h.id} className="flex items-center gap-1.5 border-b border-[var(--bd-faint)] px-2.5 py-1 cursor-pointer transition-colors hover:bg-[var(--bg-raised)]" onClick={() => loadHistory(h)}>
                <MethodBadge method={h.request.method || 'GET'} small />
                <StatusChip status={h.response?.status} />
                <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10.5px] text-[var(--tx-faint)]">{h.request.url || ''}</span>
                <span className="shrink-0 whitespace-nowrap text-[10px] text-[var(--tx-faint)]">{timeAgo(h.timestamp)}</span>
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

/* ── Grade chip ───────────────────────────────────────────────────────────── */
function GradeChip({ grade, title, onClick }) {
  const cls = grade === 'A' || grade === 'B' ? 'text-[var(--ok)] bg-[var(--ok-dim)]'
    : grade === 'C' || grade === 'D' ? 'text-[var(--warn)] bg-[rgba(251,191,36,0.12)]'
    : 'text-[var(--err)] bg-[var(--err-dim)]'
  return (
    <span
      className={cn('cursor-pointer rounded-full px-1.5 py-px text-[9.5px] leading-[1.4] font-bold', cls)}
      title={title}
      onClick={onClick}
    >
      {grade}
    </span>
  )
}

/* ── Status chip ──────────────────────────────────────────────────────────── */
function StatusChip({ status }) {
  const cls = !status ? 'text-[var(--tx-faint)]'
    : status < 300 ? 'text-[var(--ok)] bg-[var(--ok-dim)]'
    : status < 400 ? 'text-[var(--info)] bg-[color-mix(in_srgb,var(--info)_12%,transparent)]'
    : status < 500 ? 'text-[var(--warn)] bg-[color-mix(in_srgb,var(--warn)_12%,transparent)]'
    : 'text-[var(--err)] bg-[var(--err-dim)]'
  return <span className={cn('shrink-0 rounded-[3px] px-1.5 py-px font-mono text-[10px] font-semibold', cls)}>{status || '—'}</span>
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
    <div className="flex flex-col">
      {/* Mode toggle + filter rules */}
      <div className="flex items-center gap-1.5 border-b border-[var(--bd-faint)] px-2.5 pt-2 pb-1.5">
        <Icon name="filter" size={12} className="text-primary" />
        <span className="flex-1 text-[11px] font-semibold text-muted-foreground">Filter rules</span>
        <div className="flex gap-0.5">
          {[
            ['blacklist', 'ban',    'Block'],
            ['whitelist', 'shield', 'Allow only'],
          ].map(([m, icon, label]) => (
            <button
              key={m}
              className={cn(
                'flex items-center gap-1 rounded-sm px-2 py-1 text-[10px] font-semibold text-[var(--tx-faint)] transition-colors hover:bg-[var(--bg-raised)] hover:text-muted-foreground',
                filterMode === m && 'bg-[var(--accent-dim)] text-primary! hover:text-primary!'
              )}
              onClick={() => setFilterMode(m)}
              title={m === 'blacklist' ? 'Block matching requests' : 'Allow only matching requests'}
            >
              <Icon name={icon} size={10} />{label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1 px-2 py-1.5">
        {filters.map(f => (
          <div key={f.id} className="flex items-center gap-0.5">
            <input
              type="checkbox"
              className="size-3 shrink-0 accent-[var(--accent)]"
              checked={f.enabled}
              onChange={e => updateFilter(f.id, { enabled: e.target.checked })}
            />
            <select
              className="shrink-0 rounded-sm border border-[var(--bd-subtle)] bg-[var(--bg-raised)] px-1 py-0.5 text-[10px] text-muted-foreground focus:border-primary focus:outline-none"
              value={f.target}
              onChange={e => updateFilter(f.id, { target: e.target.value })}
            >
              <option value="url">URL</option>
              <option value="host">Host</option>
              <option value="method">Method</option>
              <option value="content_type">Content-Type</option>
            </select>
            <select
              className="shrink-0 rounded-sm border border-[var(--bd-subtle)] bg-[var(--bg-raised)] px-1 py-0.5 text-[10px] text-muted-foreground focus:border-primary focus:outline-none"
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
              className="min-w-0 flex-1 rounded-sm border border-[var(--bd-subtle)] bg-[var(--bg-raised)] px-1.5 py-0.5 font-mono text-[10.5px] text-foreground placeholder:text-[var(--tx-faint)] focus:border-primary focus:outline-none"
              placeholder="pattern…"
              value={f.pattern}
              onChange={e => updateFilter(f.id, { pattern: e.target.value })}
            />
            <button className="shrink-0 flex items-center text-[var(--tx-faint)] transition-colors hover:text-destructive" onClick={() => deleteFilter(f.id)}>
              <X size={10} />
            </button>
          </div>
        ))}

        {filters.length === 0 && (
          <p className="py-1 text-[10.5px] italic text-[var(--tx-faint)]">
            {filterMode === 'blacklist'
              ? 'No block rules — all requests captured'
              : 'No allow rules — nothing will be captured'}
          </p>
        )}

        <button className="mt-1 flex items-center justify-center gap-1 rounded-sm border border-dashed border-[var(--bd-subtle)] py-1 text-[11px] text-[var(--tx-faint)] transition-colors hover:border-primary hover:text-primary" onClick={() => addFilter()}>
          <Plus size={11} /> Add rule
        </button>
      </div>

      {/* Captured list */}
      <div className="border-t border-b border-[var(--bd-faint)] bg-[var(--bg-raised)] px-2.5 py-1.5 text-[10px] font-semibold tracking-wide text-[var(--tx-faint)] uppercase">
        Captured ({intercepted.length})
      </div>

      {intercepted.length === 0
        ? <p className="mt-3 px-4 py-5 text-center text-[12px] leading-[1.7] text-[var(--tx-faint)]">Waiting for requests…</p>
        : intercepted.map((item, i) => (
          <div key={i} className="cursor-pointer border-b border-[var(--bd-faint)] px-2.5 py-1.5 transition-colors hover:bg-[var(--bg-raised)]" onClick={() => onLoad(item)}>
            <div className="mb-0.5 flex items-center gap-1.5">
              <MethodBadge method={item.method || 'GET'} small />
              {item.status && <StatusChip status={item.status} />}
              <span className="ml-auto text-[10px] text-[var(--tx-faint)]">
                {timeAgo(item.timestamp || new Date().toISOString())}
              </span>
            </div>
            <div className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10.5px] text-[var(--tx-faint)]">{item.url}</div>
          </div>
        ))
      }
    </div>
  )
}
