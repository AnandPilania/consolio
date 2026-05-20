import { useState, useMemo } from 'react'
import { useStore } from '../../store'
import { Icon, IconBtn, Empty, Spinner } from '../shared'
import { syntaxHighlight, fmtSize, fmtTime } from '../../utils'
import styles from './ResponsePane.module.css'

export function ResponsePane() {
  const tabs        = useStore(s => s.tabs)
  const activeTabId = useStore(s => s.activeTabId)
  const tab         = tabs.find(t => t.id === activeTabId) || tabs[0]
  const showNotif   = useStore(s => s.showNotif)
  const { response, loading, testResults = [] } = tab

  const [resTab,      setResTab]      = useState('body')
  const [showSearch,  setShowSearch]  = useState(false)
  const [search,      setSearch]      = useState('')

  const copyBody = () => {
    navigator.clipboard.writeText(response?.body || '')
    showNotif('Copied', 'success')
  }

  const passCount  = testResults.filter(r => r.pass).length
  const failCount  = testResults.filter(r => !r.pass && r.ran).length
  const totalTests = testResults.length

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
  if (response.error) return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span className={styles.headerLabel}>Response</span>
      </div>
      <Empty icon="✕" text={response.error} sub={response.code} />
    </div>
  )

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
      </div>

      {/* ── Search bar ──────────────────────────────────────────────────── */}
      {showSearch && resTab === 'body' && (
        <SearchBar query={search} onChange={setSearch} body={response.body || ''} />
      )}

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div className={styles.body}>
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
              has_header: `Header: ${r.value}`,
              body_contains: `Body contains "${r.value}"`,
              body_json_path: `${r.path} = ${r.value}`,
              response_time: `Response ≤ ${r.value}ms`,
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
      </div>
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

/* ── Body view ────────────────────────────────────────────────────────────── */
function BodyView({ body, bodyType, search }) {
  const highlighted = useMemo(() => {
    if (!body) return ''
    if (bodyType === 'json') {
      try {
        const parsed = JSON.parse(body)
        return syntaxHighlight(JSON.stringify(parsed, null, 2))
      } catch { /* fall through to plain text */ }
    }
    return body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }, [body, bodyType])

  const withSearch = useMemo(() => {
    if (!search || !highlighted) return highlighted
    try {
      return highlighted.replace(
        new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
        '<mark class="hl">$1</mark>',
      )
    } catch { return highlighted }
  }, [highlighted, search])

  return (
    <pre
      className={styles.pre}
      dangerouslySetInnerHTML={{ __html: withSearch }}
    />
  )
}
