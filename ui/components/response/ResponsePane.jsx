import { useState, useMemo, useEffect, useRef } from 'react'
import { useStore } from '../../store'
import { Icon, IconBtn, Empty, Spinner, JsonTree, MessageLogView } from '../shared'
import { syntaxHighlight, fmtSize, fmtTime, cx, diffLines } from '../../utils'
import styles from './ResponsePane.module.css'

export function ResponsePane() {
  const tabs        = useStore(s => s.tabs)
  const activeTabId = useStore(s => s.activeTabId)
  const tab         = tabs.find(t => t.id === activeTabId) || tabs[0]
  const showNotif   = useStore(s => s.showNotif)
  const history     = useStore(s => s.history)
  const previewLiveRender = useStore(s => s.config?.settings?.previewLiveRender === true)
  const sslVerifyOn = useStore(s => s.config?.settings?.sslVerify !== false)
  const { response, loading, testResults = [] } = tab

  // Most recent *other* history entry for this same method+url — powers the Diff tab.
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

  // Default to the Preview tab whenever a new previewable response arrives.
  // Keyed on historyId so switching sub-tabs manually afterwards isn't overridden
  // until the *next* request completes.
  useEffect(() => {
    if (previewableType) setResTab('preview')
    else if (resTab === 'preview') setResTab('body')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response?.historyId])

  /* WebSocket */
  if (isWs) return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span className={styles.headerLabel}>WebSocket</span>
      </div>
      <MessageLogView frames={tab.wsFrames} connected={tab.wsConnected} onClear={clearWsFrames} emptyText="Not connected — press Connect to open the WebSocket" />
      {tab.wsConnected && (
        <div className={styles.wsComposeBar}>
          <input
            className={styles.wsComposeInput}
            placeholder="Message to send…"
            value={wsCompose}
            onChange={e => setWsCompose(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendCompose()}
          />
          <IconBtn name="send" size={13} title="Send message" onClick={sendCompose} />
        </div>
      )}
    </div>
  )

  /* SSE */
  if (isSse) return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span className={styles.headerLabel}>Server-Sent Events</span>
      </div>
      <MessageLogView frames={tab.sseFrames} connected={tab.sseConnected} onClear={clearSseFrames} emptyText="Not connected — press Connect to open the event stream" />
    </div>
  )

  /* Socket.IO */
  if (isSio) return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span className={styles.headerLabel}>Socket.IO</span>
      </div>
      <MessageLogView frames={tab.sioFrames} connected={tab.sioConnected} onClear={clearSioFrames} emptyText="Not connected — press Connect to open the Socket.IO connection" />
      {tab.sioConnected && (
        <div className={styles.wsComposeBar}>
          <input
            className={styles.wsComposeInput}
            style={{ flex: '0 0 120px' }}
            placeholder="event name"
            value={sioEvent}
            onChange={e => setSioEvent(e.target.value)}
          />
          <input
            className={styles.wsComposeInput}
            placeholder="payload (JSON or text)…"
            value={sioPayload}
            onChange={e => setSioPayload(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendSioEmit()}
          />
          <IconBtn name="send" size={13} title="Emit event" onClick={sendSioEmit} />
        </div>
      )}
    </div>
  )

  /* gRPC */
  if (isGrpc) return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span className={styles.headerLabel}>gRPC</span>
      </div>
      <MessageLogView frames={tab.grpcFrames} connected={tab.grpcConnected} onClear={clearGrpcFrames} emptyText="Load a .proto, pick a method, then press Call" />
    </div>
  )

  /* Loading */
  if (loading) return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span className={styles.headerLabel}>Response</span>
      </div>
      <Empty icon={<Spinner size={28} />} text="Sending request…" />
    </div>
  )

  /* Empty */
  if (!response) return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span className={styles.headerLabel}>Response</span>
      </div>
      <Empty icon="⚡" text="Hit Send to make a request" sub="Response will appear here" />
    </div>
  )

  /* Network error */
  if (response.error) {
    // Node's TLS errors always mention "certificate" (self-signed, expired, untrusted
    // chain, hostname mismatch) — cheaper and more robust than matching specific error
    // codes, which vary by failure type.
    const isSslError = /certificate/i.test(response.error)
    return (
      <div className={styles.wrap}>
        <div className={styles.header}>
          <span className={styles.headerLabel}>Response</span>
        </div>
        <Empty icon="✕" text={response.error} sub={response.code} />
        {isSslError && sslVerifyOn && (
          <p className={styles.hintRow}>
            If you trust this endpoint, turn off{' '}
            <button className={styles.hintLink} onClick={() => useStore.setState({ modal: 'settings' })}>SSL verify</button>{' '}
            in Settings.
          </p>
        )}
      </div>
    )
  }

  const statusClass = response.status < 300 ? styles.s2xx
    : response.status < 400 ? styles.s3xx
    : response.status < 500 ? styles.s4xx
    : styles.s5xx

  return (
    <div className={styles.wrap}>
      {/* ── Metadata row ────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <span className={`${styles.statusBadge} ${statusClass}`}>
          {response.status} {response.statusText || ''}
        </span>
        <div className={styles.meta}>
          <span><Icon name="zap" size={10} /> {fmtTime(response.elapsed)}</span>
          <span>{fmtSize(response.size || 0)}</span>
          {response.redirected && <span className={styles.redirected}>↪ redirected</span>}
        </div>
        <div className={styles.headerSpacer} />
        <IconBtn
          name="search" size={13} title="Search response"
          onClick={() => { setShowSearch(v => !v); setSearch('') }}
        />
        <IconBtn name="copy" size={13} title="Copy body" onClick={copyBody} />
      </div>

      {/* ── Sub-tabs ────────────────────────────────────────────────────── */}
      <div className={styles.tabs}>
        {previewableType && (
          <button className={`${styles.tab} ${resTab === 'preview' ? styles.tabActive : ''}`} onClick={() => setResTab('preview')}>
            <Icon name="eye" size={12} /> Preview
          </button>
        )}
        <button className={`${styles.tab} ${resTab === 'body'    ? styles.tabActive : ''}`} onClick={() => setResTab('body')}>
          Body
        </button>
        <button className={`${styles.tab} ${resTab === 'headers' ? styles.tabActive : ''}`} onClick={() => setResTab('headers')}>
          Headers <span className={styles.badge}>{Object.keys(response.headers || {}).length}</span>
        </button>
        {totalTests > 0 && (
          <button className={`${styles.tab} ${resTab === 'tests' ? styles.tabActive : ''}`} onClick={() => setResTab('tests')}>
            Tests{' '}
            <span className={`${styles.badge} ${failCount > 0 ? styles.badgeFail : passCount > 0 ? styles.badgePass : ''}`}>
              {passCount}/{totalTests}
            </span>
          </button>
        )}
        {prevEntry && (
          <button className={`${styles.tab} ${resTab === 'diff' ? styles.tabActive : ''}`} onClick={() => setResTab('diff')}>
            Diff
          </button>
        )}
      </div>

      {/* ── Search bar ──────────────────────────────────────────────────── */}
      {showSearch && resTab === 'body' && (
        <SearchBar query={search} onChange={setSearch} body={response.body || ''} />
      )}

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div className={styles.body}>
        {resTab === 'preview' && (
          <PreviewView
            body={response.body} bodyType={response.bodyType} imageMime={imageMime}
            requestUrl={response.finalUrl} method={tab.method}
            liveRender={previewLiveRender}
          />
        )}
        {resTab === 'body' && (
          <BodyView body={response.body} bodyType={response.bodyType} search={search} />
        )}
        {resTab === 'headers' && (
          Object.entries(response.headers || {}).map(([k, v]) => (
            <div key={k} className={styles.headerRow}>
              <span className={styles.hKey}>{k}</span>
              <span className={styles.hVal}>{v}</span>
            </div>
          ))
        )}
        {resTab === 'tests' && (
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
            return (
              <div key={i} className={`${styles.testRow} ${r.ran ? (r.pass ? styles.testPass : styles.testFail) : styles.testPending}`}>
                <span className={`${styles.testDot} ${r.ran ? (r.pass ? styles.dotPass : styles.dotFail) : styles.dotPending}`} />
                <span className={styles.testName}>{TYPE_LABELS[r.type] || r.type}</span>
                <span className={styles.testActual}>{r.actual}</span>
              </div>
            )
          })
        )}
        {resTab === 'diff' && prevEntry && (
          <DiffView oldBody={prevEntry.response?.body || ''} newBody={response.body || ''} />
        )}
      </div>
    </div>
  )
}

/* ── Diff view (vs. previous history entry for this same request) ───────────── */
function DiffView({ oldBody, newBody }) {
  const lines = useMemo(() => diffLines(oldBody, newBody), [oldBody, newBody])
  if (!lines) return <Empty text="Response too large to diff" />
  if (lines.every(l => l.type === 'same')) return <Empty icon="✓" text="Identical to the previous response" />
  return (
    <div className={styles.diffWrap}>
      {lines.map((l, i) => (
        <div key={i} className={cx(styles.diffLine, l.type === 'add' && styles.diffAdd, l.type === 'del' && styles.diffDel)}>
          <span className={styles.diffMarker}>{l.type === 'add' ? '+' : l.type === 'del' ? '−' : ' '}</span>
          <span className={styles.diffText}>{l.line}</span>
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
    <div className={styles.searchBar}>
      <Icon name="search" size={12} style={{ color: 'var(--tx-faint)', flexShrink: 0 }} />
      <input
        className={styles.searchInput}
        placeholder="Search response…"
        value={query}
        onChange={e => onChange(e.target.value)}
        autoFocus
      />
      <span className={styles.searchCount}>
        {query ? (count > 0 ? `${count} match${count > 1 ? 'es' : ''}` : 'No matches') : ''}
      </span>
    </div>
  )
}

/* ── Preview view (HTML iframe / image) ──────────────────────────────────── */
function PreviewView({ body, bodyType, imageMime, requestUrl, method, liveRender }) {
  if (bodyType === 'html') {
    // Two rendering strategies, chosen by the "Preview: live render" setting:
    //
    // 1. Live navigation (src=URL, liveRender on) — the iframe actually navigates the
    //    browser to the real URL. This is the only way a full app (cookie-based session,
    //    cross-origin JS bundles, relative asset paths) renders correctly, because the
    //    browser then has a real origin to attach cookies to and resolve asset URLs
    //    against. Only valid for GET — an iframe navigation can't replay a POST body or
    //    custom headers. Requires allow-same-origin, meaning the preview frame can read/
    //    write cookies and storage for that site, same as opening it in a normal tab.
    //
    // 2. Captured HTML (srcDoc, liveRender off / non-GET) — renders the exact bytes
    //    consolio received, sandboxed with no same-origin access. Reliable for static/
    //    server-rendered fragments; a full SPA won't fully function since its own
    //    cross-origin asset fetches still hit real CORS rules and it has no cookie jar.
    const canNavigate = liveRender && method === 'GET' && requestUrl
    return canNavigate
      ? <LiveFrame url={requestUrl} />
      : <SandboxedFrame html={body} />
  }
  if (bodyType === 'image') {
    return (
      <div className={styles.previewImageWrap}>
        <img
          className={styles.previewImage}
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
    // X-Frame-Options / frame-ancestors CSP blocks are silent — no error event fires on
    // the iframe element itself, the browser just shows an empty frame. There's no direct
    // way to detect this from the parent (cross-origin access to the frame is blocked by
    // design), so we fall back to a load-timeout heuristic. Two stages: a quick, non-covering
    // "still loading" note (plenty of real sites legitimately take a few seconds), then only
    // after a much longer wait with still no `load` event do we assume it was actually
    // refused — a genuinely blocked navigation never fires `load` at all, so a longer wait
    // costs nothing but false-positive "can't be previewed" flashes on slow-but-working pages.
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
    <div className={styles.previewFrameWrap}>
      <iframe
        key={url /* force remount on URL change so the load/blocked state resets cleanly */}
        className={styles.previewFrame}
        src={url}
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        title="Response preview"
        onLoad={handleLoad}
      />
      {slow && !blocked && !loaded && (
        <div className={styles.previewSlowNote}>Still loading…</div>
      )}
      {blocked && !loaded && (
        <div className={styles.previewBlocked}>
          <Empty
            icon="🚫"
            text="This page can't be previewed here"
            sub="The site likely sends X-Frame-Options or a Content-Security-Policy that blocks embedding — the same protection that stops clickjacking on any site. Open it in a new tab, or check the Body tab for the raw response."
          />
          <p className={styles.hintRow}>
            Or turn off{' '}
            <button className={styles.hintLink} onClick={() => useStore.setState({ modal: 'settings' })}>Preview: live render</button>{' '}
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
      className={styles.previewFrame}
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
    <div className={styles.bodyViewWrap}>
      {parsedJson !== undefined && !search && (
        <div className={styles.bodyModeToggle}>
          <button className={cx(styles.bodyModeBtn, mode === 'tree' && styles.bodyModeActive)} onClick={() => setMode('tree')}>Tree</button>
          <button className={cx(styles.bodyModeBtn, mode === 'raw' && styles.bodyModeActive)} onClick={() => setMode('raw')}>Raw</button>
        </div>
      )}
      {showTree
        ? <JsonTree value={parsedJson} />
        : <pre className={styles.pre} dangerouslySetInnerHTML={{ __html: withSearch }} />
      }
    </div>
  )
}
