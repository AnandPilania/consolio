import { useState, useMemo, useEffect, useRef } from 'react'
import { useStore } from '../../store'
import { cn } from '@/lib/utils'
import { Zap, Search, Copy, Eye, Send } from 'lucide-react'
import { Icon, IconBtn, Empty, Spinner, JsonTree, MessageLogView } from '../shared'
import { syntaxHighlight, fmtSize, fmtTime, cx, diffLines } from '../../utils'
import { PluginTabButton, PluginTabContent } from '../shared/PluginTab'

export function ResponsePane() {
  const tabs        = useStore(s => s.tabs)
  const activeTabId = useStore(s => s.activeTabId)
  const tab         = tabs.find(t => t.id === activeTabId) || tabs[0]
  const showNotif   = useStore(s => s.showNotif)
  const history     = useStore(s => s.history)
  const previewLiveRender = useStore(s => s.config?.settings?.previewLiveRender === true)
  const sslVerifyOn = useStore(s => s.config?.settings?.sslVerify !== false)
  const pluginTabs = useStore(s => s.pluginTabs?.response || [])
  const { response, loading, testResults = [] } = tab

  const prevEntry = useMemo(() => {
    if (!response?.historyId) return null
    return history.find(h => h.id !== response.historyId && h.request?.method === tab.method && h.request?.url === response.finalUrl) || null
  }, [history, response?.historyId, response?.finalUrl, tab.method])

  const [resTab,      setResTab]      = useState('body')
  const [showSearch,  setShowSearch]  = useState(false)
  const [search,      setSearch]      = useState('')
  const [wsCompose,   setWsCompose]   = useState('')
  const [sioEvent,    setSioEvent]    = useState('')
  const [sioPayload,  setSioPayload]  = useState('')
  const [pluginTabKey, setPluginTabKey] = useState(null)

  const sendWsMessage  = useStore(s => s.sendWsMessage)
  const clearWsFrames  = useStore(s => s.clearWsFrames)
  const clearSseFrames = useStore(s => s.clearSseFrames)
  const clearSioFrames = useStore(s => s.clearSioFrames)
  const clearGrpcFrames = useStore(s => s.clearGrpcFrames)
  const emitSio        = useStore(s => s.emitSio)
  const isWs   = tab.wsMode
  const isSse  = tab.sseMode
  const isSio  = tab.sioMode
  const isGrpc = tab.grpcMode

  const copyBody = () => {
    navigator.clipboard.writeText(response?.body || '')
    showNotif('Copied', 'success')
  }

  const sendCompose = () => {
    if (!wsCompose.trim()) return
    sendWsMessage(wsCompose)
    setWsCompose('')
  }

  const sendSioEmit = () => {
    if (!sioEvent.trim()) return
    let data = sioPayload
    try { data = JSON.parse(sioPayload) } catch { /* send as plain string if not valid JSON */ }
    emitSio(sioEvent.trim(), data)
    setSioPayload('')
  }

  const passCount  = testResults.filter(r => r.pass).length
  const failCount  = testResults.filter(r => !r.pass && r.ran).length
  const totalTests = testResults.length

  const previewableType = response ? ['html', 'image'].includes(response.bodyType) : false
  const imageMime = response?.headers?.['content-type']?.split(';')[0]?.trim() || 'image/png'
  const responsePluginTab = pluginTabs.find(pluginTab => `plugin:${pluginTab.plugin}:${pluginTab.id}` === pluginTabKey)
  const selectNativeTab = key => { setPluginTabKey(null); setResTab(key) }

  useEffect(() => {
    if (previewableType) setResTab('preview')
    else if (resTab === 'preview') setResTab('body')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response?.historyId])

  /* WebSocket */
  if (isWs) return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <Header label="WebSocket" />
      <MessageLogView frames={tab.wsFrames} connected={tab.wsConnected} onClear={clearWsFrames} emptyText="Not connected — press Connect to open the WebSocket" />
      {tab.wsConnected && (
        <ComposeBar>
          <input
            className="h-8 flex-1 rounded-md border border-[var(--bd-subtle)] bg-[var(--bg-raised)] px-2.5 font-mono text-[12px] text-foreground outline-none focus:border-primary"
            placeholder="Message to send…"
            value={wsCompose}
            onChange={e => setWsCompose(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendCompose()}
          />
          <IconBtn name="send" size={13} title="Send message" onClick={sendCompose} />
        </ComposeBar>
      )}
    </div>
  )

  /* SSE */
  if (isSse) return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <Header label="Server-Sent Events" />
      <MessageLogView frames={tab.sseFrames} connected={tab.sseConnected} onClear={clearSseFrames} emptyText="Not connected — press Connect to open the event stream" />
    </div>
  )

  /* Socket.IO */
  if (isSio) return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <Header label="Socket.IO" />
      <MessageLogView frames={tab.sioFrames} connected={tab.sioConnected} onClear={clearSioFrames} emptyText="Not connected — press Connect to open the Socket.IO connection" />
      {tab.sioConnected && (
        <ComposeBar>
          <input
            className="h-8 w-[120px] shrink-0 rounded-md border border-[var(--bd-subtle)] bg-[var(--bg-raised)] px-2.5 font-mono text-[12px] text-foreground outline-none focus:border-primary"
            placeholder="event name"
            value={sioEvent}
            onChange={e => setSioEvent(e.target.value)}
          />
          <input
            className="h-8 flex-1 rounded-md border border-[var(--bd-subtle)] bg-[var(--bg-raised)] px-2.5 font-mono text-[12px] text-foreground outline-none focus:border-primary"
            placeholder="payload (JSON or text)…"
            value={sioPayload}
            onChange={e => setSioPayload(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendSioEmit()}
          />
          <IconBtn name="send" size={13} title="Emit event" onClick={sendSioEmit} />
        </ComposeBar>
      )}
    </div>
  )

  /* gRPC */
  if (isGrpc) return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <Header label="gRPC" />
      <MessageLogView frames={tab.grpcFrames} connected={tab.grpcConnected} onClear={clearGrpcFrames} emptyText="Load a .proto, pick a method, then press Call" />
    </div>
  )

  /* Loading */
  if (loading) return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <Header label="Response" />
      <Empty icon={<Spinner size={28} />} text="Sending request…" />
    </div>
  )

  /* Empty */
  if (!response) return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <Header label="Response" />
      <Empty icon="⚡" text="Hit Send to make a request" sub="Response will appear here" />
    </div>
  )

  /* Network error */
  if (response.error) {
    const isSslError = /certificate/i.test(response.error)
    return (
      <div className="flex h-full flex-col overflow-hidden bg-background">
        <Header label="Response" />
        <Empty icon="✕" text={response.error} sub={response.code} />
        {isSslError && sslVerifyOn && (
          <p className="shrink-0 px-6 pt-2 pb-3.5 text-center text-[11.5px] text-[var(--tx-faint)]">
            If you trust this endpoint, turn off{' '}
            <button className="text-primary underline underline-offset-2" onClick={() => useStore.setState({ modal: 'settings' })}>SSL verify</button>{' '}
            in Settings.
          </p>
        )}
      </div>
    )
  }

  const statusCls = response.status < 300 ? 'text-[var(--ok)] bg-[var(--ok-dim)]'
    : response.status < 400 ? 'text-[var(--info)] bg-[color-mix(in_srgb,var(--info)_12%,transparent)]'
    : response.status < 500 ? 'text-[var(--warn)] bg-[color-mix(in_srgb,var(--warn)_12%,transparent)]'
    : 'text-[var(--err)] bg-[var(--err-dim)]'

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* ── Metadata row ────────────────────────────────────────────────── */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-[var(--bd-faint)] bg-[var(--bg-surface)] px-3">
        <span className={cn('rounded-sm px-2 py-0.5 font-mono text-[12px] font-bold', statusCls)}>
          {response.status} {response.statusText || ''}
        </span>
        <div className="flex items-center gap-2.5 text-[11px] text-[var(--tx-faint)]">
          <span className="flex items-center gap-0.5"><Zap size={10} /> {fmtTime(response.elapsed)}</span>
          <span>{fmtSize(response.size || 0)}</span>
          {response.redirected && <span className="text-[var(--info)]">↪ redirected</span>}
        </div>
        <div className="flex-1" />
        <IconBtn
          name="search" size={13} title="Search response"
          onClick={() => { setShowSearch(v => !v); setSearch('') }}
        />
        <IconBtn name="copy" size={13} title="Copy body" onClick={copyBody} />
      </div>

      {/* ── Sub-tabs ────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 border-b border-[var(--bd-faint)] bg-[var(--bg-surface)] px-3">
        {previewableType && (
          <TabBtn active={!responsePluginTab && resTab === 'preview'} onClick={() => selectNativeTab('preview')}>
            <Eye size={12} /> Preview
          </TabBtn>
        )}
        <TabBtn active={!responsePluginTab && resTab === 'body'} onClick={() => selectNativeTab('body')}>Body</TabBtn>
        <TabBtn active={!responsePluginTab && resTab === 'headers'} onClick={() => selectNativeTab('headers')}>
          Headers <TabBadge>{Object.keys(response.headers || {}).length}</TabBadge>
        </TabBtn>
        {totalTests > 0 && (
          <TabBtn active={!responsePluginTab && resTab === 'tests'} onClick={() => selectNativeTab('tests')}>
            Tests{' '}
            <TabBadge className={failCount > 0 ? 'bg-[var(--err-dim)] text-[var(--err)]' : passCount > 0 ? 'bg-[var(--ok-dim)] text-[var(--ok)]' : ''}>
              {passCount}/{totalTests}
            </TabBadge>
          </TabBtn>
        )}
        {prevEntry && (
          <TabBtn active={!responsePluginTab && resTab === 'diff'} onClick={() => selectNativeTab('diff')}>Diff</TabBtn>
        )}
        {pluginTabs.map(pluginTab => {
          const key = `plugin:${pluginTab.plugin}:${pluginTab.id}`
          return <PluginTabButton key={key} tab={pluginTab} active={pluginTabKey === key} onClick={() => { setPluginTabKey(key); setResTab(null) }} />
        })}
      </div>

      {/* ── Search bar ──────────────────────────────────────────────────── */}
      {showSearch && !responsePluginTab && resTab === 'body' && (
        <SearchBar query={search} onChange={setSearch} body={response.body || ''} />
      )}

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {!responsePluginTab && resTab === 'preview' && (
          <PreviewView
            body={response.body} bodyType={response.bodyType} imageMime={imageMime}
            requestUrl={response.finalUrl} method={tab.method}
            liveRender={previewLiveRender}
          />
        )}
        {!responsePluginTab && resTab === 'body' && (
          <BodyView body={response.body} bodyType={response.bodyType} search={search} />
        )}
        {!responsePluginTab && resTab === 'headers' && (
          Object.entries(response.headers || {}).map(([k, v]) => (
            <div key={k} className="flex border-b border-[var(--bd-faint)] px-3.5 py-1 font-mono text-[12px] hover:bg-[var(--bg-raised)]">
              <span className="w-[220px] shrink-0 overflow-hidden text-ellipsis text-[var(--tx-faint)]">{k}</span>
              <span className="flex-1 break-all text-foreground">{v}</span>
            </div>
          ))
        )}
        {!responsePluginTab && resTab === 'tests' && (
          testResults.map((r, i) => {
            const TYPE_LABELS = {
              status: `Status = ${r.value}`,
              status_lt: `Status < ${r.value}`,
              status_in: `Status in [${r.value}]`,
              has_header: `Header: ${r.value}`,
              header_equals: `Header ${r.value}`,
              body_contains: `Body contains "${r.value}"`,
              body_not_contains: `Body doesn't contain "${r.value}"`,
              body_json_path: `${r.path} = ${r.value}`,
              response_time: `Response ≤ ${r.value}ms`,
              response_time_gt: `Response > ${r.value}ms`,
              body_not_empty: 'Body not empty',
            }
            const state = r.ran ? (r.pass ? 'pass' : 'fail') : 'pending'
            const rowCls = state === 'pass' ? 'text-[var(--ok)]' : state === 'fail' ? 'text-[var(--err)]' : 'italic text-[var(--tx-faint)]'
            const dotCls = state === 'pass' ? 'bg-[var(--ok)]' : state === 'fail' ? 'bg-[var(--err)]' : 'bg-[var(--tx-faint)]'
            return (
              <div key={i} className={cn('flex items-center gap-2 border-b border-[var(--bd-faint)] px-3.5 py-1.5 text-[12px] hover:bg-[var(--bg-raised)]', rowCls)}>
                <span className={cn('size-1.5 shrink-0 rounded-full', dotCls)} />
                <span className="flex-1">{TYPE_LABELS[r.type] || r.type}</span>
                <span className="font-mono text-[10.5px] text-[var(--tx-faint)]">{r.actual}</span>
              </div>
            )
          })
        )}
        {!responsePluginTab && resTab === 'diff' && prevEntry && (
          <DiffView oldBody={prevEntry.response?.body || ''} newBody={response.body || ''} />
        )}
        {responsePluginTab && (
          <PluginTabContent pane="response" tab={responsePluginTab} context={{ request: tab, response }} />
        )}
      </div>
    </div>
  )
}

function Header({ label }) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-[var(--bd-faint)] bg-[var(--bg-surface)] px-3">
      <span className="text-[10.5px] font-bold tracking-wide text-[var(--tx-faint)] uppercase">{label}</span>
    </div>
  )
}

function ComposeBar({ children }) {
  return <div className="flex shrink-0 items-center gap-1.5 border-t border-[var(--bd-faint)] px-2.5 py-2">{children}</div>
}

function TabBtn({ active, onClick, children }) {
  return (
    <button
      className={cn(
        'mb-[-1px] flex items-center gap-1 border-b-2 border-transparent px-2.5 py-1.5 text-[12px] text-[var(--tx-faint)] transition-colors hover:text-muted-foreground',
        active && 'border-b-primary text-foreground'
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function TabBadge({ className, children }) {
  return <span className={cn('rounded-full bg-[var(--bg-overlay)] px-1.5 py-px font-mono text-[10px] text-[var(--tx-faint)]', className)}>{children}</span>
}

/* ── Diff view (vs. previous history entry for this same request) ───────────── */
function DiffView({ oldBody, newBody }) {
  const lines = useMemo(() => diffLines(oldBody, newBody), [oldBody, newBody])
  if (!lines) return <Empty text="Response too large to diff" />
  if (lines.every(l => l.type === 'same')) return <Empty icon="✓" text="Identical to the previous response" />
  return (
    <div className="py-2 font-mono text-[12px] leading-[1.6]">
      {lines.map((l, i) => (
        <div key={i} className={cx('flex gap-2 px-3.5 whitespace-pre-wrap break-all', l.type === 'add' && 'bg-[var(--ok-dim)]', l.type === 'del' && 'bg-[var(--err-dim)]')}>
          <span className={cn('w-2.5 shrink-0 text-[var(--tx-faint)]', l.type === 'add' && 'text-[var(--ok)]', l.type === 'del' && 'text-[var(--err)]')}>
            {l.type === 'add' ? '+' : l.type === 'del' ? '−' : ' '}
          </span>
          <span>{l.line}</span>
        </div>
      ))}
    </div>
  )
}

/* ── Search bar ───────────────────────────────────────────────────────────── */
function SearchBar({ query, onChange, body }) {
  const count = useMemo(() => {
    if (!query) return 0
    try { return (body.match(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length }
    catch { return 0 }
  }, [query, body])

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-[var(--bd-faint)] bg-[var(--bg-raised)] px-3 py-1.5">
      <Search size={12} className="shrink-0 text-[var(--tx-faint)]" />
      <input
        className="flex-1 rounded-sm border border-[var(--bd-subtle)] bg-[var(--bg-overlay)] px-2 py-1 font-mono text-[12px] text-foreground placeholder:text-[var(--tx-faint)] focus:border-primary focus:outline-none"
        placeholder="Search response…"
        value={query}
        onChange={e => onChange(e.target.value)}
        autoFocus
      />
      <span className="min-w-[60px] shrink-0 text-right text-[11px] whitespace-nowrap text-[var(--tx-faint)]">
        {query ? (count > 0 ? `${count} match${count > 1 ? 'es' : ''}` : 'No matches') : ''}
      </span>
    </div>
  )
}

/* ── Preview view (HTML iframe / image) ──────────────────────────────────── */
function PreviewView({ body, bodyType, imageMime, requestUrl, method, liveRender }) {
  if (bodyType === 'html') {
    const canNavigate = liveRender && method === 'GET' && requestUrl
    return canNavigate
      ? <LiveFrame url={requestUrl} />
      : <SandboxedFrame html={body} />
  }
  if (bodyType === 'image') {
    return (
      <div
        className="flex h-full items-center justify-center p-4"
        style={{ background: 'repeating-conic-gradient(var(--bg-raised) 0% 25%, var(--bg-overlay) 0% 50%) 50% / 16px 16px' }}
      >
        <img
          className="max-h-full max-w-full object-contain shadow-[0_2px_12px_rgba(0,0,0,.35)]"
          src={`data:${imageMime};base64,${body || ''}`}
          alt="Response preview"
        />
      </div>
    )
  }
  return null
}

/* Live navigation frame — real page load, used only when Preview: live render is on. */
function LiveFrame({ url }) {
  const [slow,    setSlow]    = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [loaded,  setLoaded]  = useState(false)
  const loadedRef = useRef(false)

  useEffect(() => {
    loadedRef.current = false
    setSlow(false)
    setBlocked(false)
    setLoaded(false)
    const slowTimer = setTimeout(() => { if (!loadedRef.current) setSlow(true) }, 3000)
    const blockedTimer = setTimeout(() => { if (!loadedRef.current) setBlocked(true) }, 10000)
    return () => { clearTimeout(slowTimer); clearTimeout(blockedTimer) }
  }, [url])

  const handleLoad = () => {
    loadedRef.current = true
    setLoaded(true)
    setSlow(false)
    setBlocked(false)
  }

  return (
    <div className="relative h-full">
      <iframe
        key={url /* force remount on URL change so the load/blocked state resets cleanly */}
        className="size-full border-none bg-white"
        src={url}
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        title="Response preview"
        onLoad={handleLoad}
      />
      {slow && !blocked && !loaded && (
        <div className="absolute top-2 right-2 rounded-md border border-[var(--bd-subtle)] bg-[var(--bg-overlay)] px-2.5 py-1 text-[11px] text-[var(--tx-faint)]">Still loading…</div>
      )}
      {blocked && !loaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background p-6">
          <Empty
            icon="🚫"
            text="This page can't be previewed here"
            sub="The site likely sends X-Frame-Options or a Content-Security-Policy that blocks embedding — the same protection that stops clickjacking on any site. Open it in a new tab, or check the Body tab for the raw response."
          />
          <p className="shrink-0 px-6 pt-2 pb-3.5 text-center text-[11.5px] text-[var(--tx-faint)]">
            Or turn off{' '}
            <button className="text-primary underline underline-offset-2" onClick={() => useStore.setState({ modal: 'settings' })}>Preview: live render</button>{' '}
            in Settings to view the captured response instead — that sandboxed view isn't affected by this.
          </p>
        </div>
      )}
    </div>
  )
}

/* Sandboxed captured-HTML frame — no same-origin, used when live render is off or the
   request wasn't a GET (an iframe navigation can't replay POST bodies/headers). */
function SandboxedFrame({ html }) {
  return (
    <iframe
      className="size-full border-none bg-white"
      srcDoc={html || ''}
      sandbox="allow-scripts allow-popups allow-forms"
      title="Response preview"
    />
  )
}

/* ── Body view ────────────────────────────────────────────────────────────── */
function BodyView({ body, bodyType, search }) {
  const parsedJson = useMemo(() => {
    if (bodyType !== 'json' || !body) return undefined
    try { return JSON.parse(body) } catch { return undefined }
  }, [body, bodyType])

  const [mode, setMode] = useState(parsedJson !== undefined ? 'tree' : 'raw')
  useEffect(() => { setMode(parsedJson !== undefined ? 'tree' : 'raw') }, [body, parsedJson])

  const highlighted = useMemo(() => {
    if (!body) return ''
    if (parsedJson !== undefined) return syntaxHighlight(JSON.stringify(parsedJson, null, 2))
    return body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }, [body, parsedJson])

  const withSearch = useMemo(() => {
    if (!search || !highlighted) return highlighted
    try {
      return highlighted.replace(
        new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
        '<mark class="hl">$1</mark>',
      )
    } catch { return highlighted }
  }, [highlighted, search])

  if (bodyType === 'image') {
    return <Empty icon="🖼" text="Binary image data" sub="Switch to the Preview tab to view it" />
  }

  const showTree = mode === 'tree' && parsedJson !== undefined && !search

  return (
    <div className="h-full">
      {parsedJson !== undefined && !search && (
        <div className="flex gap-0.5 px-3.5 pt-2">
          <button className={cn('rounded-full border border-[var(--bd-subtle)] px-2.5 py-0.5 text-[10.5px] font-semibold text-[var(--tx-faint)] transition-colors hover:text-muted-foreground', mode === 'tree' && 'border-transparent bg-[var(--accent-dim)] text-primary!')} onClick={() => setMode('tree')}>Tree</button>
          <button className={cn('rounded-full border border-[var(--bd-subtle)] px-2.5 py-0.5 text-[10.5px] font-semibold text-[var(--tx-faint)] transition-colors hover:text-muted-foreground', mode === 'raw' && 'border-transparent bg-[var(--accent-dim)] text-primary!')} onClick={() => setMode('raw')}>Raw</button>
        </div>
      )}
      {showTree
        ? <JsonTree value={parsedJson} />
        : <pre className="px-3.5 py-3 font-mono text-[12px] leading-[1.65] whitespace-pre-wrap break-all text-foreground" dangerouslySetInnerHTML={{ __html: withSearch }} />
      }
    </div>
  )
}
