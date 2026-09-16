import { useState, useEffect } from 'react'
import { useStore, apiFetch } from '../../store'
import { Icon, IconBtn, Btn, FormGroup, Input, Select, Spinner, MethodBadge, KVTable } from '../shared'
import { parseCurl, importPostmanCollection, importInsomniaExport, importOpenAPI, exportPostmanCollection, exportInsomniaCollection, exportOpenAPI, uid, fmtTime, timeAgo, buildHarRequest, GENERATE_TARGETS, downloadJson, downloadText, buildJUnitXml } from '../../utils'
import styles from './Modals.module.css'

/* ── Modal shell ──────────────────────────────────────────────────────────── */
function Modal({ title, icon, onClose, children, footer, wide }) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={`${styles.modal} ${wide ? styles.wide : ''}`} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          {icon && <Icon name={icon} size={15} style={{ color: 'var(--accent)' }} />}
          <span className={styles.title}>{title}</span>
          <button className={styles.closeBtn} onClick={onClose}><Icon name="x" size={14} /></button>
        </div>
        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  )
}

/* ── New Collection ───────────────────────────────────────────────────────── */
export function NewCollectionModal() {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const showNotif = useStore(s => s.showNotif)
  const close = () => useStore.setState({ modal: null })

  const create = async () => {
    if (!name.trim()) return
    await apiFetch('/api/collections', { method: 'POST', body: { name, description: desc } })
    useStore.setState({ collections: await apiFetch('/api/collections') })
    showNotif('Collection created', 'success')
    close()
  }

  return (
    <Modal
      title="New Collection" icon="folder" onClose={close}
      footer={<><Btn variant="ghost" onClick={close}>Cancel</Btn><Btn variant="primary" onClick={create}>Create</Btn></>}
    >
      <FormGroup label="Name">
        <Input
          value={name} onChange={e => setName(e.target.value)}
          placeholder="My API Collection"
          onKeyDown={e => e.key === 'Enter' && create()}
        />
      </FormGroup>
      <FormGroup label="Description (optional)">
        <Input value={desc} onChange={e => setDesc(e.target.value)} placeholder="What APIs does this test?" />
      </FormGroup>
    </Modal>
  )
}

/* ── Import ───────────────────────────────────────────────────────────────── */
// Creates the collection, then its folders (sequentially, so client-temp folder
// ids can be remapped to server-assigned ids), then bulk-creates the requests.
async function createCollectionFromImport(imported, description) {
  const col = await apiFetch('/api/collections', { method: 'POST', body: { name: imported.name, description } })
  const idMap = {}
  for (const f of imported.folders || []) {
    const created = await apiFetch(`/api/collections/${col.id}/folders`, {
      method: 'POST', body: { name: f.name, parentId: idMap[f.parentId] || null },
    })
    idMap[f.id] = created.id
  }
  const requests = imported.requests.map(r => {
    const { _discoveredParams, ...clean } = r
    return { ...clean, folderId: idMap[r.folderId] || null }
  })
  if (requests.length) {
    await apiFetch(`/api/collections/${col.id}/requests/bulk`, { method: 'POST', body: { requests } })
  }
  useStore.setState({ collections: await apiFetch('/api/collections') })
  return requests.length
}

const IMPORT_TABS = [
  ['curl',     'cURL command'],
  ['postman',  'Postman Collection'],
  ['insomnia', 'Insomnia Export'],
  ['openapi',  'OpenAPI / Swagger'],
  ['scan',     'Scan Codebase'],
]

export function ImportModal() {
  const [tab,   setTab]   = useState('curl')
  const [text,  setText]  = useState('')
  const [error, setError] = useState('')
  const [scanPath, setScanPath] = useState('')
  const [scanBaseUrl, setScanBaseUrl] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState(null)
  const showNotif = useStore(s => s.showNotif)
  const close = () => useStore.setState({ modal: null })

  const doScan = async () => {
    setError('')
    setScanResult(null)
    setScanning(true)
    try {
      const result = await apiFetch('/api/scan/routes', { method: 'POST', body: { path: scanPath || undefined, baseUrl: scanBaseUrl } })
      if (result.error) throw new Error(result.error)
      if (!result.requests.length) throw new Error('No routes found — check the path, or this framework style may not be supported yet (Express, Fastify, and NestJS route decorators are supported).')
      setScanResult(result)
    } catch (e) { setError(e.message) }
    setScanning(false)
  }

  const confirmScanImport = async () => {
    if (!scanResult) return
    const count = await createCollectionFromImport(scanResult, scanResult.description)
    showNotif(`Imported ${count} discovered routes`, 'success')
    close()
  }

  const doImport = async () => {
    setError('')
    try {
      if (tab === 'curl') {
        const req = parseCurl(text)
        if (!req.url) throw new Error('Could not parse a URL from this cURL command')
        useStore.getState().updateActiveTab({
          method:  req.method,
          url:     req.url,
          params:  req.params.length  ? req.params  : [{ id: uid(), key: '', value: '', enabled: true }],
          headers: req.headers.length ? req.headers : [{ id: uid(), key: '', value: '', enabled: true }],
          body:    req.body,
          auth:    req.auth,
          reqName: 'Imported',
          response: null,
        })
        showNotif('cURL imported', 'success')
        close()
      } else if (tab === 'postman') {
        const json = JSON.parse(text)
        if (!json.info || !json.item) throw new Error('Not a valid Postman collection (needs info + item fields)')
        const count = await createCollectionFromImport(importPostmanCollection(json), 'Imported from Postman')
        showNotif(`Imported ${count} requests`, 'success')
        close()
      } else if (tab === 'insomnia') {
        const json = JSON.parse(text)
        if (!json.resources) throw new Error('Not a valid Insomnia export (needs a "resources" field)')
        const count = await createCollectionFromImport(importInsomniaExport(json), 'Imported from Insomnia')
        showNotif(`Imported ${count} requests`, 'success')
        close()
      } else if (tab === 'openapi') {
        const { parse: parseYaml } = await import('yaml')
        const imported = importOpenAPI(text, parseYaml)
        const count = await createCollectionFromImport(imported, 'Imported from OpenAPI')
        showNotif(`Imported ${count} requests`, 'success')
        close()
      }
    } catch (e) { setError(e.message) }
  }

  const hints = {
    curl:     'Paste a cURL command — headers, auth, body and URL are parsed automatically.',
    postman:  'Paste the full contents of an exported Postman collection JSON file. Folders are preserved.',
    insomnia: 'Paste the full contents of an Insomnia v4 export (Export → resources). Folders are preserved.',
    openapi:  'Paste an OpenAPI/Swagger 3.x document (JSON or YAML). Requests are grouped into folders by tag.',
    scan:     'Statically scans this project\'s source files for Express, Fastify, and NestJS route definitions — no OpenAPI spec required. Read-only; nothing is executed.',
  }
  const placeholders = {
    curl: "curl -X POST 'https://api.example.com/users' \\\n  -H 'Authorization: Bearer token' \\\n  -H 'Content-Type: application/json' \\\n  -d '{\"name\":\"John\"}'",
    postman: '{\n  "info": { "name": "My Collection" },\n  "item": [ ... ]\n}',
    insomnia: '{\n  "_type": "export",\n  "resources": [ ... ]\n}',
    openapi: 'openapi: 3.0.0\ninfo:\n  title: My API\npaths:\n  /users:\n    get: ...',
  }

  const footer = tab === 'scan'
    ? (
      <>
        <Btn variant="ghost" onClick={close}>Cancel</Btn>
        {!scanResult
          ? <Btn variant="primary" onClick={doScan} disabled={scanning}>{scanning ? <Spinner size={12} /> : 'Scan'}</Btn>
          : <Btn variant="primary" onClick={confirmScanImport}>Import {scanResult.requests.length} route{scanResult.requests.length === 1 ? '' : 's'}</Btn>}
      </>
    )
    : <><Btn variant="ghost" onClick={close}>Cancel</Btn><Btn variant="primary" onClick={doImport}>Import</Btn></>

  return (
    <Modal title="Import" icon="upload" onClose={close} footer={footer}>
      <div className={styles.importTabs}>
        {IMPORT_TABS.map(([key, label]) => (
          <button key={key} className={`${styles.importTab} ${tab === key ? styles.importTabActive : ''}`} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      <p className={styles.importHint}>{hints[tab]}</p>

      {tab === 'scan' ? (
        <div className={styles.scanForm}>
          <FormGroup label="Subdirectory (optional — defaults to the whole project)">
            <Input value={scanPath} onChange={e => setScanPath(e.target.value)} placeholder="src/routes" />
          </FormGroup>
          <FormGroup label="Base URL (optional — prefixed onto every discovered path)">
            <Input value={scanBaseUrl} onChange={e => setScanBaseUrl(e.target.value)} placeholder="http://localhost:3000" />
          </FormGroup>
          {scanResult && (
            <div className={styles.scanResults}>
              <p className={styles.scanResultsHeader}>{scanResult.description}</p>
              {scanResult.requests.map(r => (
                <div key={r.id} className={styles.scanResultRow}>
                  <MethodBadge method={r.method} small />
                  <span className={styles.scanResultUrl}>{r.url}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <textarea
          className={styles.importArea}
          placeholder={placeholders[tab]}
          value={text}
          onChange={e => setText(e.target.value)}
        />
      )}
      {error && <div className={styles.importError}>{error}</div>}
    </Modal>
  )
}

/* ── Code generation ──────────────────────────────────────────────────────── */
export function CodeGenModal() {
  const tabs         = useStore(s => s.tabs)
  const activeTabId  = useStore(s => s.activeTabId)
  const tab          = tabs.find(t => t.id === activeTabId) || tabs[0]
  const environments = useStore(s => s.environments)
  const activeEnvId  = useStore(s => s.activeEnvId)
  const showNotif    = useStore(s => s.showNotif)
  const close = () => useStore.setState({ modal: null })

  const activeEnv  = environments.find(e => e.id === activeEnvId) || environments[0] || null
  const envVars    = Object.fromEntries((activeEnv?.variables || []).filter(v => v.enabled).map(v => [v.key, v.value]))
  const secretKeys = (activeEnv?.variables || []).filter(v => v.secret).map(v => v.key)

  const [targetIdx, setTargetIdx] = useState(0)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setError('')
    import('httpsnippet').then(({ HTTPSnippet }) => {
      if (cancelled) return
      try {
        const har = buildHarRequest({
          method: tab.method, url: tab.url, headers: tab.headers, params: tab.params,
          body: tab.body, auth: tab.auth, environment: envVars, secretKeys,
        })
        const { target, client } = GENERATE_TARGETS[targetIdx]
        setCode(new HTTPSnippet(har).convert(target, client) || '')
      } catch (e) { setError(e.message); setCode('') }
    }).catch(e => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetIdx, tab.method, tab.url, tab.headers, tab.params, tab.body, tab.auth])

  const copy = () => { navigator.clipboard.writeText(code); showNotif('Code copied', 'success') }

  return (
    <Modal
      title="Generate Code" icon="code" onClose={close} wide
      footer={<><Btn variant="ghost" onClick={close}>Close</Btn><Btn variant="primary" onClick={copy}>Copy</Btn></>}
    >
      <div className={styles.importTabs}>
        {GENERATE_TARGETS.map((t, i) => (
          <button
            key={t.label}
            className={`${styles.importTab} ${i === targetIdx ? styles.importTabActive : ''}`}
            onClick={() => setTargetIdx(i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {error
        ? <div className={styles.importError}>{error}</div>
        : <textarea className={styles.importArea} style={{ minHeight: 280 }} readOnly value={code} />
      }
    </Modal>
  )
}

/* ── Collection Runner ────────────────────────────────────────────────────── */
export function RunnerModal() {
  const collections = useStore(s => s.collections)
  const environments = useStore(s => s.environments)
  const activeEnvId  = useStore(s => s.activeEnvId)
  const showNotif    = useStore(s => s.showNotif)
  const close = () => useStore.setState({ modal: null })

  const [colId,       setColId]       = useState(collections[0]?.id || '')
  const [envId,       setEnvId]       = useState(activeEnvId || '')
  const [delay,       setDelay]       = useState(0)
  const [concurrency, setConcurrency] = useState(1)
  const [bail,        setBail]        = useState(false)
  const [running,     setRunning]     = useState(false)
  const [results,     setResults]     = useState([])

  const col = collections.find(c => c.id === colId)

  const run = async () => {
    if (!col || running) return
    setRunning(true)
    const reqs = col.requests || []
    const env  = environments.find(e => e.id === envId) || null
    const envVars = Object.fromEntries((env?.variables || []).filter(v => v.enabled).map(v => [v.key, v.value]))
    setResults(reqs.map(r => ({ ...r, _status: 'pending' })))

    let bailed = false
    const runOne = async (req, i) => {
      if (bailed) { setResults(prev => prev.map((r, j) => j === i ? { ...r, _status: 'skipped' } : r)); return }
      setResults(prev => prev.map((r, j) => j === i ? { ...r, _status: 'running' } : r))
      try {
        const res = await apiFetch('/api/execute', {
          method: 'POST',
          body: {
            method:      req.method,
            url:         req.url,
            headers:     req.headers  || [],
            params:      req.params   || [],
            body:        req.body     || { type: 'none' },
            auth:        req.auth     || { type: 'none' },
            preScript:   req.preScript  || '',
            postScript:  req.postScript || '',
            tests:       req.tests || [],
            environmentId: envId || null,
            environment: envVars,
            saveToHistory: false,
          },
        })
        const hasTests = (req.tests || []).length > 0
        const pass = !res.error && (hasTests ? res.testResults.every(t => t.pass) : res.status < 400)
        if (!pass && bail) bailed = true
        setResults(prev => prev.map((r, j) => j === i
          ? { ...r, _status: pass ? 'pass' : 'fail', _resStatus: res.status, _elapsed: res.elapsed, _testResults: res.testResults || [], _error: res.error }
          : r
        ))
      } catch (e) {
        if (bail) bailed = true
        setResults(prev => prev.map((r, j) => j === i ? { ...r, _status: 'fail', _resStatus: 0, _elapsed: 0, _error: e.message } : r))
      }
    }

    const step = Math.max(1, concurrency)
    for (let i = 0; i < reqs.length; i += step) {
      await Promise.all(reqs.slice(i, i + step).map((req, k) => runOne(req, i + k)))
      if (bailed) break
      if (delay > 0 && i + step < reqs.length) await new Promise(r => setTimeout(r, delay))
    }
    setRunning(false)
  }

  const passCount    = results.filter(r => r._status === 'pass').length
  const failCount    = results.filter(r => r._status === 'fail').length
  const skippedCount = results.filter(r => r._status === 'skipped').length

  const exportResults = format => {
    const items = results.map(r => ({
      name: r.name || r.url || 'Unnamed', pass: r._status === 'pass',
      elapsed: r._elapsed || 0, error: r._error || (r._testResults || []).filter(t => !t.pass).map(t => `${t.type}: expected ${t.value}, got ${t.actual}`).join('; '),
    }))
    if (format === 'json') downloadJson(`${col.name}.results.json`, items)
    else downloadText(`${col.name}.results.junit.xml`, buildJUnitXml(col.name, items), 'application/xml')
  }

  return (
    <Modal title="Collection Runner" icon="play" onClose={close} wide footer={
      <Btn variant="ghost" onClick={close}>Close</Btn>
    }>
      <div className={styles.runnerControls}>
        <Select value={colId} onChange={e => setColId(e.target.value)} className={styles.runnerSelect}>
          {collections.map(c => (
            <option key={c.id} value={c.id}>{c.name} ({c.requests?.length || 0} requests)</option>
          ))}
        </Select>
        <Select value={envId} onChange={e => setEnvId(e.target.value)} className={styles.runnerSelect} style={{ flex: 'unset', width: 140 }}>
          <option value="">No environment</option>
          {environments.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </Select>
        <div className={styles.delayControl}>
          <span>Concurrency</span>
          <input
            type="number" className={styles.delayInput}
            min={1} max={20} value={concurrency}
            onChange={e => setConcurrency(parseInt(e.target.value) || 1)}
          />
        </div>
        <div className={styles.delayControl}>
          <span>Delay</span>
          <input
            type="number" className={styles.delayInput}
            min={0} max={5000} value={delay}
            onChange={e => setDelay(parseInt(e.target.value) || 0)}
          />
          <span>ms</span>
        </div>
        <label className={styles.delayControl} style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={bail} onChange={e => setBail(e.target.checked)} />
          <span>Bail on fail</span>
        </label>
        <Btn variant="primary" onClick={run} disabled={running}>
          {running ? <><Spinner size={12} /> Running…</> : <><Icon name="play" size={13} /> Run All</>}
        </Btn>
      </div>

      {results.length > 0 && (
        <div className={styles.runnerSummary}>
          <span className={styles.passCount}>● {passCount} passed</span>
          <span className={styles.failCount}>{failCount} failed</span>
          {skippedCount > 0 && <span className={styles.totalCount}>{skippedCount} skipped</span>}
          <span className={styles.totalCount}>{col?.requests?.length || 0} total</span>
          {!running && (
            <>
              <span style={{ flex: 1 }} />
              <button className={styles.envAction} onClick={() => exportResults('json')} title="Export as JSON">JSON</button>
              <button className={styles.envAction} onClick={() => exportResults('junit')} title="Export as JUnit XML">JUnit</button>
            </>
          )}
        </div>
      )}

      <div className={styles.runnerResults}>
        {results.length === 0
          ? <p className={styles.runnerEmpty}>Select a collection and press Run All</p>
          : results.map((r, i) => (
            <div key={i} className={styles.runnerRow}>
              <div className={`${styles.runnerStatus} ${styles[`rs_${r._status}`]}`}>
                {r._status === 'pass'     ? '✓'
                 : r._status === 'fail'   ? '✕'
                 : r._status === 'running'? <Spinner size={10} />
                 : r._status === 'skipped'? '–'
                 : '·'}
              </div>
              <MethodBadge method={r.method || 'GET'} small />
              <span className={styles.runnerName}>{r.name || r.url || `Request ${i + 1}`}</span>
              {r._testResults?.length > 0 && (
                <span className={styles.runnerMeta}>{r._testResults.filter(t => t.pass).length}/{r._testResults.length} tests</span>
              )}
              {r._resStatus !== undefined && r._resStatus !== null && (
                <span className={styles.runnerMeta}>{r._resStatus} · {fmtTime(r._elapsed || 0)}</span>
              )}
            </div>
          ))
        }
      </div>
    </Modal>
  )
}

/* ── Settings ─────────────────────────────────────────────────────────────── */
export function SettingsModal() {
  const config       = useStore(s => s.config)
  const environments = useStore(s => s.environments)
  const activeEnvId  = useStore(s => s.activeEnvId)
  const showNotif    = useStore(s => s.showNotif)
  const aiConfig     = useStore(s => s.aiConfig)
  const setAiConfig  = useStore(s => s.setAiConfig)
  const close = () => useStore.setState({ modal: null })

  const [form,    setForm]    = useState({ ...config })
  const [envEdit, setEnvEdit] = useState(null)   // null | '__new__' | env.id
  const [envForm, setEnvForm] = useState({})

  const saveSettings = async () => {
    await apiFetch('/api/config', { method: 'PUT', body: form })
    useStore.setState({ config: { ...config, ...form } })
    showNotif('Settings saved', 'success')
    close()
  }

  const startEditEnv = env => {
    setEnvEdit(env.id)
    setEnvForm({ name: env.name, color: env.color || '#f59e0b', variables: [...(env.variables || [])] })
  }

  const saveEnv = async () => {
    if (!envForm.name) return
    const payload = { name: envForm.name, color: envForm.color || '#6366f1', variables: envForm.variables || [] }
    if (envEdit === '__new__') {
      const created = await apiFetch('/api/environments', { method: 'POST', body: payload })
      useStore.setState({ activeEnvId: created.id })
    } else {
      await apiFetch(`/api/environments/${envEdit}`, { method: 'PUT', body: payload })
    }
    const envs = await apiFetch('/api/environments')
    useStore.setState({ environments: envs })
    setEnvEdit(null)
    showNotif('Environment saved', 'success')
  }

  const deleteEnv = async id => {
    await apiFetch(`/api/environments/${id}`, { method: 'DELETE' })
    const envs = await apiFetch('/api/environments')
    useStore.setState({
      environments: envs,
      activeEnvId: envs.find(e => e.id !== id)?.id || null,
    })
    showNotif('Environment deleted', 'success')
  }

  const updEnvVar = (i, field, val) =>
    setEnvForm(f => ({ ...f, variables: f.variables.map((v, j) => j === i ? { ...v, [field]: val } : v) }))

  return (
    <Modal title="Settings" icon="settings" onClose={close} wide footer={
      <><Btn variant="ghost" onClick={close}>Cancel</Btn><Btn variant="primary" onClick={saveSettings}>Save Settings</Btn></>
    }>
      {/* ── Project ─────────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Project</h3>
        <div className={styles.settingsGrid}>
          <FormGroup label="Project name">
            <Input value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </FormGroup>
          <FormGroup label="Request timeout (ms)">
            <Input
              type="number"
              value={form.settings?.timeout || 30000}
              onChange={e => setForm(f => ({ ...f, settings: { ...(f.settings || {}), timeout: parseInt(e.target.value) } }))}
            />
          </FormGroup>
          <FormGroup label="Follow redirects">
            <Select
              value={String(form.settings?.followRedirects !== false)}
              onChange={e => setForm(f => ({ ...f, settings: { ...(f.settings || {}), followRedirects: e.target.value === 'true' } }))}
            >
              <option value="true">Yes</option>
              <option value="false">No</option>
            </Select>
          </FormGroup>
          <FormGroup label="SSL verify">
            <Select
              value={String(form.settings?.sslVerify !== false)}
              onChange={e => setForm(f => ({ ...f, settings: { ...(f.settings || {}), sslVerify: e.target.value === 'true' } }))}
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </Select>
          </FormGroup>
          <FormGroup label="Preview: live render">
            <Select
              value={String(form.settings?.previewLiveRender === true)}
              onChange={e => setForm(f => ({ ...f, settings: { ...(f.settings || {}), previewLiveRender: e.target.value === 'true' } }))}
            >
              <option value="false">Off — sandboxed, isolated from consolio</option>
              <option value="true">On — full app rendering (SPAs, cookies)</option>
            </Select>
          </FormGroup>
          <p className={styles.settingsHint}>
            When on, GET responses previewed as HTML navigate the browser directly to
            the request URL — needed for apps with their own scripts, cookies, and
            cross-origin assets to render correctly. That preview frame can then read
            and write cookies/storage for that site, same as a normal browser tab. Off
            is safer for previewing untrusted or third-party APIs.
          </p>
        </div>
      </section>

      {/* ── AI Assist ───────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>AI Assist</h3>
        <div className={styles.settingsGrid}>
          <FormGroup label="Provider">
            <Select value={aiConfig.provider} onChange={e => setAiConfig({ provider: e.target.value })}>
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
              <option value="azure-openai">Azure OpenAI</option>
              <option value="ollama">Ollama (local or remote)</option>
              <option value="openai-compatible">Other (OpenAI-compatible endpoint)</option>
            </Select>
          </FormGroup>

          {aiConfig.provider !== 'ollama' && (
            <FormGroup label={aiConfig.provider === 'azure-openai' ? 'API key' : 'API key' + (aiConfig.provider === 'openai-compatible' ? ' (optional)' : '')}>
              <Input
                type="password"
                value={aiConfig.apiKey}
                onChange={e => setAiConfig({ apiKey: e.target.value })}
                placeholder={aiConfig.provider === 'anthropic' ? 'sk-ant-…' : aiConfig.provider === 'openai' ? 'sk-…' : 'API key'}
              />
            </FormGroup>
          )}

          {(aiConfig.provider === 'azure-openai' || aiConfig.provider === 'openai-compatible') && (
            <FormGroup label="Base URL">
              <Input
                value={aiConfig.baseUrl}
                onChange={e => setAiConfig({ baseUrl: e.target.value })}
                placeholder={aiConfig.provider === 'azure-openai'
                  ? 'https://<resource>.openai.azure.com/openai/deployments/<deployment>'
                  : 'http://localhost:11434/v1'}
              />
            </FormGroup>
          )}

          {aiConfig.provider === 'ollama' && (
            <FormGroup label="Base URL (optional)">
              <Input
                value={aiConfig.baseUrl}
                onChange={e => setAiConfig({ baseUrl: e.target.value })}
                placeholder="http://localhost:11434 (default)"
              />
            </FormGroup>
          )}

          <FormGroup label={aiConfig.provider === 'anthropic' ? 'Model (optional)' : 'Model'}>
            <Input
              value={aiConfig.model}
              onChange={e => setAiConfig({ model: e.target.value })}
              placeholder={
                aiConfig.provider === 'anthropic' ? 'claude-sonnet-4-6 (default)'
                : aiConfig.provider === 'openai' ? 'gpt-4o-mini'
                : aiConfig.provider === 'azure-openai' ? 'your deployment name'
                : aiConfig.provider === 'ollama' ? 'llama3.1'
                : 'model name'
              }
            />
          </FormGroup>
        </div>
        <p className={styles.settingsHint}>
          Powers the "Fix with AI" button on a request's Info tab, which suggests a
          description and test assertions. Bring-your-own-endpoint — works with Anthropic,
          OpenAI, Azure OpenAI, a local or remote Ollama instance, or any other
          OpenAI-Chat-Completions-compatible server. Settings are stored only in this
          browser's local storage, sent only when you click that button, and never
          saved to the project or to consolio's own storage.
        </p>
      </section>

      {/* ── Environments ────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Environments</h3>
          <Btn variant="ghost" size="sm" onClick={() => {
            setEnvEdit('__new__')
            setEnvForm({ name: '', color: '#f59e0b', variables: [{ id: uid(), key: '', value: '', enabled: true, secret: false }] })
          }}>
            + New
          </Btn>
        </div>

        <div className={styles.envList}>
          {environments.map(env => (
            <div key={env.id} className={styles.envRow}>
              <span className={styles.envDot} style={{ background: env.color || '#6366f1' }} />
              <span className={styles.envName}>{env.name}</span>
              {activeEnvId === env.id && <span className={styles.activeTag}>active</span>}
              <button className={styles.envAction} title="Set active" onClick={() => useStore.setState({ activeEnvId: env.id })}>✓</button>
              <button className={styles.envAction} title="Edit"       onClick={() => startEditEnv(env)}><Icon name="settings" size={12} /></button>
              <button className={`${styles.envAction} ${styles.envDel}`} title="Delete" onClick={() => deleteEnv(env.id)}><Icon name="trash" size={12} /></button>
            </div>
          ))}
          {environments.length === 0 && <p className={styles.noEnvs}>No environments yet</p>}
        </div>

        {/* Inline editor */}
        {envEdit && (
          <div className={styles.envEditor}>
            <div className={styles.envEditorTitle}>
              {envEdit === '__new__' ? 'New Environment' : 'Edit Environment'}
            </div>
            <div className={styles.envEditorRow}>
              <Input
                value={envForm.name || ''}
                onChange={e => setEnvForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Environment name"
                className={styles.envNameInput}
              />
              <input
                type="color"
                value={envForm.color || '#f59e0b'}
                className={styles.colorPicker}
                onChange={e => setEnvForm(f => ({ ...f, color: e.target.value }))}
              />
            </div>

            <div className={styles.envVarLabel}>Variables</div>
            {(envForm.variables || []).map((v, i) => (
              <div key={v.id || i} className={styles.envVarRow}>
                <input
                  type="checkbox" className={styles.envCheck}
                  checked={v.enabled}
                  onChange={e => updEnvVar(i, 'enabled', e.target.checked)}
                />
                <input
                  className={styles.envVarInput} placeholder="KEY"
                  value={v.key || ''}
                  onChange={e => updEnvVar(i, 'key', e.target.value)}
                />
                <input
                  className={styles.envVarInput} placeholder="Value"
                  type={v.secret ? 'password' : 'text'}
                  value={v.value || ''}
                  onChange={e => updEnvVar(i, 'value', e.target.value)}
                />
                <button
                  className={styles.envSecretBtn}
                  title={v.secret ? 'Show value' : 'Hide value'}
                  onClick={() => updEnvVar(i, 'secret', !v.secret)}
                >
                  <Icon name={v.secret ? 'eyeOff' : 'eye'} size={11} />
                </button>
                <button
                  className={styles.envVarDel}
                  onClick={() => setEnvForm(f => ({ ...f, variables: f.variables.filter((_, j) => j !== i) }))}
                >
                  <Icon name="x" size={10} />
                </button>
              </div>
            ))}

            <div className={styles.envEditorActions}>
              <Btn variant="ghost" size="sm" onClick={() => setEnvForm(f => ({
                ...f,
                variables: [...(f.variables || []), { id: uid(), key: '', value: '', enabled: true, secret: false }],
              }))}>
                <Icon name="plus" size={11} /> Add Variable
              </Btn>
              <div style={{ flex: 1 }} />
              <Btn variant="ghost"   size="sm" onClick={() => setEnvEdit(null)}>Cancel</Btn>
              <Btn variant="primary" size="sm" onClick={saveEnv}>Save</Btn>
            </div>
          </div>
        )}
      </section>

      {/* ── Browser interceptor hint ─────────────────────────────────────── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Browser Interceptor</h3>
        <div className={styles.interceptorHint}>
          <p>1. Open <code>chrome://extensions/</code> → enable <strong>Developer Mode</strong></p>
          <p>2. Click <strong>Load unpacked</strong> → select the <code>extension/</code> folder</p>
          <p>3. Click the consolio icon in your Chrome toolbar</p>
          <p>4. Toggle <strong>Capture requests</strong> ON — requests appear in the <strong>Tap</strong> sidebar</p>
        </div>
      </section>
    </Modal>
  )
}

/* ── Plugin manager ───────────────────────────────────────────────────────── */
export function PluginManagerModal() {
  const showNotif = useStore(s => s.showNotif)
  const close = () => useStore.setState({ modal: null })

  const [plugins, setPlugins] = useState([])
  const [bundled, setBundled] = useState([])
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState(false)
  const [installingDir, setInstallingDir] = useState(null)
  const [pkgName, setPkgName] = useState('')

  const loadPlugins = async () => {
    setLoading(true)
    try {
      const [installed, avail] = await Promise.all([apiFetch('/api/plugins'), apiFetch('/api/plugins/bundled')])
      setPlugins(installed)
      setBundled(avail)
    } catch { }
    setLoading(false)
  }
  useEffect(() => { loadPlugins() }, [])

  const install = async () => {
    if (!pkgName.trim()) { showNotif('Enter a package name', 'error'); return }
    setInstalling(true)
    try {
      const res = await apiFetch('/api/plugins', { method: 'POST', body: { name: pkgName.trim() } })
      if (res.error) throw new Error(res.error)
      setPkgName('')
      showNotif(`Installed ${res.name}`, 'success')
      await loadPlugins()
    } catch (e) { showNotif(e.message, 'error') }
    setInstalling(false)
  }

  const installBundled = async (dir) => {
    setInstallingDir(dir)
    try {
      const res = await apiFetch('/api/plugins/bundled', { method: 'POST', body: { dir } })
      if (res.error) throw new Error(res.error)
      showNotif(`Installed ${res.name}`, 'success')
      await loadPlugins()
    } catch (e) { showNotif(e.message, 'error') }
    setInstallingDir(null)
  }

  const uninstall = async (name) => {
    await apiFetch(`/api/plugins/${name}`, { method: 'DELETE' })
    await loadPlugins()
  }

  const toggleEnabled = async (p) => {
    await apiFetch(`/api/plugins/${p.name}`, { method: 'PUT', body: { enabled: !p.enabled } })
    await loadPlugins()
  }

  const installedNames = new Set(plugins.map(p => p.name))
  const bundledNames = new Set(bundled.map(b => b.name))
  const notYetInstalled = bundled.filter(b => !installedNames.has(b.name))

  return (
    <Modal title="Plugins" icon="code" onClose={close} footer={<Btn variant="ghost" onClick={close}>Close</Btn>}>
      <p className={styles.importHint}>
        Installs an npm package into <code>.consolio/plugins/</code>. A plugin exports
        <code> requestHooks</code>, <code>responseHooks</code>, and/or <code>templateTags</code> — see the README.
      </p>
      <div className={styles.mockNewForm} style={{ flexDirection: 'row' }}>
        <Input value={pkgName} onChange={e => setPkgName(e.target.value)} placeholder="npm package name" />
        <Btn variant="primary" size="sm" onClick={install} disabled={installing}>
          {installing ? <Spinner size={12} /> : 'Install'}
        </Btn>
      </div>

      {!loading && notYetInstalled.length > 0 && (
        <>
          <p className={styles.settingsHint} style={{ marginTop: 14 }}>Bundled with consolio — install with one click:</p>
          <div className={styles.mockList} style={{ width: 'auto' }}>
            {notYetInstalled.map(b => (
              <div key={b.dir} className={styles.mockRow} style={{ cursor: 'default' }}>
                <div className={styles.mockInfo}>
                  <span className={styles.mockName}>{b.name}</span>
                  <span className={styles.mockMeta}>{b.description}</span>
                </div>
                <Btn variant="ghost" size="sm" onClick={() => installBundled(b.dir)} disabled={installingDir === b.dir}>
                  {installingDir === b.dir ? <Spinner size={12} /> : 'Install'}
                </Btn>
              </div>
            ))}
          </div>
        </>
      )}

      <div className={styles.mockList} style={{ width: 'auto', marginTop: 12 }}>
        {loading && <Spinner size={16} />}
        {!loading && plugins.length === 0 && <p className={styles.runnerEmpty}>No plugins installed</p>}
        {plugins.map(p => (
          <div key={p.name} className={styles.mockRow} style={{ cursor: 'default' }}>
            <span className={`${styles.mockDot} ${p.enabled ? styles.mockRunning : styles.mockStopped}`} />
            <div className={styles.mockInfo}>
              <span className={styles.mockName}>
                {p.name}{' '}
                {bundledNames.has(p.name) && <span className={styles.activeTag}>Core</span>}
              </span>
              <span className={styles.mockMeta}>v{p.version}</span>
            </div>
            <button className={styles.envAction} onClick={() => toggleEnabled(p)} title={p.enabled ? 'Disable' : 'Enable'}>
              <Icon name={p.enabled ? 'eyeOff' : 'eye'} size={13} />
            </button>
            <button className={`${styles.envAction} ${styles.envDel}`} onClick={() => uninstall(p.name)} title="Uninstall">
              <Icon name="trash" size={13} />
            </button>
          </div>
        ))}
      </div>
    </Modal>
  )
}

/* ── Mock servers ─────────────────────────────────────────────────────────── */
export function MockManagerModal() {
  const showNotif = useStore(s => s.showNotif)
  const close = () => useStore.setState({ modal: null })

  const [mocks,   setMocks]   = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPort, setNewPort] = useState('4300')
  const [routes,  setRoutes]  = useState([])

  const selected = mocks.find(m => m.id === selectedId) || null

  const loadMocks = async () => {
    setLoading(true)
    try { setMocks(await apiFetch('/api/mocks')) } catch { }
    setLoading(false)
  }

  useEffect(() => { loadMocks() }, [])
  useEffect(() => { setRoutes(selected?.routes || []) }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  const createMock = async () => {
    if (!newName.trim() || !newPort) { showNotif('Name and port are required', 'error'); return }
    const mock = await apiFetch('/api/mocks', { method: 'POST', body: { name: newName.trim(), port: parseInt(newPort) } })
    setNewName(''); setCreating(false)
    await loadMocks()
    setSelectedId(mock.id)
  }

  const deleteMock = async (id, e) => {
    e.stopPropagation()
    await apiFetch(`/api/mocks/${id}`, { method: 'DELETE' })
    if (selectedId === id) setSelectedId(null)
    await loadMocks()
  }

  const toggleRunning = async (mock, e) => {
    e.stopPropagation()
    try {
      await apiFetch(`/api/mocks/${mock.id}/${mock.running ? 'stop' : 'start'}`, { method: 'POST' })
      await loadMocks()
    } catch { showNotif('Could not toggle mock server', 'error') }
  }

  const saveRoutes = async () => {
    if (!selected) return
    await apiFetch(`/api/mocks/${selected.id}`, { method: 'PUT', body: { routes } })
    await loadMocks()
    showNotif('Routes saved', 'success')
  }

  const addRoute = () => setRoutes(r => [...r, { id: uid(), method: 'GET', path: '/', statusCode: 200, headers: [], body: '', delayMs: 0 }])
  const updateRoute = (i, patch) => setRoutes(r => r.map((route, j) => j === i ? { ...route, ...patch } : route))
  const deleteRoute = (i) => setRoutes(r => r.filter((_, j) => j !== i))

  return (
    <Modal title="Mock Servers" icon="globe" onClose={close} wide footer={<Btn variant="ghost" onClick={close}>Close</Btn>}>
      <div className={styles.mockLayout}>
        <div className={styles.mockList}>
          {loading && <Spinner size={16} />}
          {!loading && mocks.length === 0 && !creating && (
            <p className={styles.runnerEmpty}>No mock sets yet</p>
          )}
          {mocks.map(m => (
            <div
              key={m.id}
              className={`${styles.mockRow} ${m.id === selectedId ? styles.mockRowActive : ''}`}
              onClick={() => setSelectedId(m.id)}
            >
              <span className={`${styles.mockDot} ${m.running ? styles.mockRunning : styles.mockStopped}`} />
              <div className={styles.mockInfo}>
                <span className={styles.mockName}>{m.name}</span>
                <span className={styles.mockMeta}>:{m.port} · {m.routes?.length || 0} routes</span>
              </div>
              <button className={styles.envAction} onClick={e => toggleRunning(m, e)} title={m.running ? 'Stop' : 'Start'}>
                <Icon name={m.running ? 'ban' : 'play'} size={13} />
              </button>
              <button className={`${styles.envAction} ${styles.envDel}`} onClick={e => deleteMock(m.id, e)} title="Delete">
                <Icon name="trash" size={13} />
              </button>
            </div>
          ))}

          {creating ? (
            <div className={styles.mockNewForm}>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Mock set name" />
              <Input value={newPort} onChange={e => setNewPort(e.target.value)} placeholder="Port" />
              <div style={{ display: 'flex', gap: 6 }}>
                <Btn variant="ghost" size="sm" onClick={() => setCreating(false)}>Cancel</Btn>
                <Btn variant="primary" size="sm" onClick={createMock}>Create</Btn>
              </div>
            </div>
          ) : (
            <Btn variant="ghost" size="sm" onClick={() => setCreating(true)}>
              <Icon name="plus" size={11} /> New Mock Set
            </Btn>
          )}
        </div>

        <div className={styles.mockRoutes}>
          {!selected ? (
            <p className={styles.runnerEmpty}>Select a mock set to edit its routes</p>
          ) : (
            <>
              {routes.map((route, i) => (
                <div key={route.id} className={styles.mockRouteCard}>
                  <div className={styles.mockRouteHeader}>
                    <Select value={route.method} onChange={e => updateRoute(i, { method: e.target.value })} style={{ width: 90 }}>
                      {['GET','POST','PUT','PATCH','DELETE'].map(m => <option key={m} value={m}>{m}</option>)}
                    </Select>
                    <Input value={route.path} onChange={e => updateRoute(i, { path: e.target.value })} placeholder="/users/:id" className={styles.mockPathInput} />
                    <Input value={route.statusCode} onChange={e => updateRoute(i, { statusCode: parseInt(e.target.value) || 200 })} placeholder="200" className={styles.mockStatusInput} />
                    <Input value={route.delayMs} onChange={e => updateRoute(i, { delayMs: parseInt(e.target.value) || 0 })} placeholder="delay ms" className={styles.mockStatusInput} />
                    <IconBtn name="trash" size={13} title="Delete route" onClick={() => deleteRoute(i)} />
                  </div>
                  <KVTable rows={route.headers || []} onChange={v => updateRoute(i, { headers: v })} placeholder={['Header', 'Value']} />
                  <textarea
                    className={styles.mockBodyArea}
                    placeholder={'{\n  "id": "{{id}}"\n}'}
                    value={route.body || ''}
                    onChange={e => updateRoute(i, { body: e.target.value })}
                  />
                </div>
              ))}
              <div className={styles.mockRoutesFooter}>
                <Btn variant="ghost" size="sm" onClick={addRoute}><Icon name="plus" size={11} /> Add Route</Btn>
                <div style={{ flex: 1 }} />
                <Btn variant="primary" size="sm" onClick={saveRoutes}>Save Routes</Btn>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

/* ── Dashboard (Elva-style call analytics + readiness score) ────────────────── */
export function DashboardModal() {
  const collections = useStore(s => s.collections)
  const modalData    = useStore(s => s.modalData)
  const close = () => useStore.setState({ modal: null })

  const [collectionId, setCollectionId] = useState(modalData?.collectionId || '')
  const [analytics, setAnalytics] = useState(null)
  const [score, setScore] = useState(null)
  const [mcpManifest, setMcpManifest] = useState(null)
  const [showMcpConfig, setShowMcpConfig] = useState(false)
  const [loading, setLoading] = useState(true)
  const showNotif = useStore(s => s.showNotif)

  const load = async () => {
    setLoading(true)
    try {
      const qs = collectionId ? `?collectionId=${collectionId}` : ''
      const [a, s, m] = await Promise.all([
        apiFetch(`/api/history/analytics${qs}`),
        collectionId ? apiFetch(`/api/collections/${collectionId}/score`) : Promise.resolve(null),
        collectionId ? apiFetch(`/api/collections/${collectionId}/mcp-manifest`) : Promise.resolve(null),
      ])
      setAnalytics(a)
      setScore(s)
      setMcpManifest(m)
    } catch { }
    setLoading(false)
  }

  const copyMcpConfig = () => {
    navigator.clipboard.writeText(JSON.stringify(mcpManifest.configSnippet, null, 2))
    showNotif('MCP config copied to clipboard', 'success')
  }

  useEffect(() => { load() }, [collectionId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal title="Dashboard" icon="barChart" onClose={close} wide footer={<Btn variant="ghost" onClick={close}>Close</Btn>}>
      <div className={styles.settingsGrid} style={{ marginBottom: 14 }}>
        <FormGroup label="Scope">
          <Select value={collectionId} onChange={e => setCollectionId(e.target.value)}>
            <option value="">All collections</option>
            {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </FormGroup>
      </div>

      {loading && <Spinner size={16} />}

      {!loading && analytics && (
        <>
          <div className={styles.dashStatRow}>
            <DashStat label="Total requests" value={analytics.totalRequests} />
            <DashStat label="Avg latency"    value={`${analytics.avgLatencyMs}ms`} />
            <DashStat label="P95 latency"    value={`${analytics.p95LatencyMs}ms`} />
            <DashStat
              label="Error rate" value={`${analytics.errorRate}%`}
              tone={analytics.errorRate > 10 ? 'err' : analytics.errorRate > 0 ? 'warn' : 'ok'}
            />
            {score && (
              <DashStat
                label="Readiness score" value={`${score.grade} · ${score.score}`}
                tone={score.grade === 'A' || score.grade === 'B' ? 'ok' : score.grade === 'F' ? 'err' : 'warn'}
              />
            )}
          </div>

          {mcpManifest?.tools?.length > 0 && (
            <>
              <div className={styles.mcpSectionHeader}>
                <h3 className={styles.sectionTitle} style={{ margin: 0 }}>MCP Server</h3>
                <Btn variant="ghost" size="sm" onClick={() => setShowMcpConfig(v => !v)}>
                  <Icon name="sparkle" size={11} /> {showMcpConfig ? 'Hide' : 'Generate'} config
                </Btn>
              </div>
              <p className={styles.settingsHint} style={{ margin: '4px 0 8px' }}>
                This collection can be served as an MCP server — each request becomes a tool an AI agent can call directly.
              </p>
              <div className={styles.mockList} style={{ width: 'auto' }}>
                {mcpManifest.tools.map(t => (
                  <div key={t.name} className={styles.mockRow} style={{ cursor: 'default' }}>
                    <MethodBadge method={t.method || 'GET'} small />
                    <div className={styles.mockInfo}>
                      <span className={styles.mockName}>{t.name}</span>
                      <span className={styles.mockMeta}>{t.url}</span>
                    </div>
                  </div>
                ))}
              </div>
              {showMcpConfig && (
                <div className={styles.mcpConfigBox}>
                  <p className={styles.settingsHint} style={{ margin: '0 0 8px' }}>
                    Add this to your MCP client's config (e.g. Claude Desktop's <code>claude_desktop_config.json</code>):
                  </p>
                  <pre className={styles.mcpConfigCode}>{JSON.stringify(mcpManifest.configSnippet, null, 2)}</pre>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                    <Btn variant="primary" size="sm" onClick={copyMcpConfig}>Copy config</Btn>
                  </div>
                </div>
              )}
            </>
          )}

          {score?.topIssues?.length > 0 && (
            <>
              <h3 className={styles.sectionTitle} style={{ marginTop: 16 }}>Top issues</h3>
              <div className={styles.mockList} style={{ width: 'auto' }}>
                {score.topIssues.map(issue => (
                  <div key={issue.id} className={styles.mockRow} style={{ cursor: 'default' }}>
                    <div className={styles.mockInfo}>
                      <span className={styles.mockName}>{issue.label}</span>
                      <span className={styles.mockMeta}>{issue.fix}</span>
                    </div>
                    <span className={styles.colCount}>{issue.count} request{issue.count === 1 ? '' : 's'}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <h3 className={styles.sectionTitle} style={{ marginTop: 16 }}>By request</h3>
          {analytics.requestBreakdown.length === 0 && (
            <p className={styles.runnerEmpty}>No tracked calls yet — requests sent from a saved collection request will show up here.</p>
          )}
          <div className={styles.mockList} style={{ width: 'auto' }}>
            {analytics.requestBreakdown.map(r => (
              <div key={r.requestId} className={styles.mockRow} style={{ cursor: 'default' }}>
                <div className={styles.mockInfo}>
                  <span className={styles.mockName}>{r.requestName}</span>
                  <span className={styles.mockMeta}>{r.totalRequests} calls · avg {r.avgLatencyMs}ms · {r.errorRate}% errors</span>
                </div>
              </div>
            ))}
          </div>

          {analytics.recentErrors.length > 0 && (
            <>
              <h3 className={styles.sectionTitle} style={{ marginTop: 16 }}>Recent errors</h3>
              <div className={styles.mockList} style={{ width: 'auto' }}>
                {analytics.recentErrors.map(e => (
                  <div key={e.id} className={styles.mockRow} style={{ cursor: 'default' }}>
                    <MethodBadge method={e.method || 'GET'} small />
                    <div className={styles.mockInfo}>
                      <span className={styles.mockName}>{e.requestName || e.url}</span>
                      <span className={styles.mockMeta}>{timeAgo(e.timestamp)}</span>
                    </div>
                    <span className={styles.colCount} style={{ color: 'var(--err)' }}>{e.status} {e.statusText}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  )
}

function DashStat({ label, value, tone }) {
  const color = tone === 'ok' ? 'var(--ok)' : tone === 'err' ? 'var(--err)' : tone === 'warn' ? 'var(--warn)' : 'var(--tx-base)'
  return (
    <div className={styles.dashStat}>
      <span className={styles.dashStatValue} style={{ color }}>{value}</span>
      <span className={styles.dashStatLabel}>{label}</span>
    </div>
  )
}

/* ── Audience profiles (Elva Contracts-lite) ─────────────────────────────────── */
export function ProfilesModal() {
  const collections = useStore(s => s.collections)
  const modalData = useStore(s => s.modalData)
  const showNotif = useStore(s => s.showNotif)
  const close = () => useStore.setState({ modal: null })

  const col = collections.find(c => c.id === modalData?.collectionId)
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // null | 'new' | profile object
  const [impact, setImpact] = useState({}) // profileId -> impact

  const load = async () => {
    if (!col) return
    setLoading(true)
    const list = await apiFetch(`/api/collections/${col.id}/profiles`)
    setProfiles(list)
    const impacts = {}
    await Promise.all(list.map(async p => { impacts[p.id] = await apiFetch(`/api/collections/${col.id}/profiles/${p.id}/impact`) }))
    setImpact(impacts)
    setLoading(false)
  }
  useEffect(() => { load() }, [col?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const deleteProfile = async (id) => {
    await apiFetch(`/api/collections/${col.id}/profiles/${id}`, { method: 'DELETE' })
    showNotif('Profile deleted', 'success')
    load()
  }

  const exportProfile = async (profile, format) => {
    const filtered = await apiFetch(`/api/collections/${col.id}/profiles/${profile.id}/apply`)
    const data = format === 'postman' ? exportPostmanCollection(filtered)
      : format === 'openapi' ? exportOpenAPI(filtered)
      : exportInsomniaCollection(filtered)
    downloadJson(`${(filtered.name || 'collection').replace(/\s+/g, '_')}.${format}.json`, data)
  }

  if (!col) return null

  return (
    <Modal title={`Audience Profiles — ${col.name}`} icon="shield" onClose={close} wide footer={<Btn variant="ghost" onClick={close}>Close</Btn>}>
      {!editing && (
        <>
          <p className={styles.settingsHint} style={{ margin: '0 0 12px' }}>
            A profile scopes this collection to a subset of requests for a given audience — export or generate an MCP server from just that slice, with chosen headers/params stripped.
          </p>
          <Btn variant="primary" size="sm" onClick={() => setEditing('new')} style={{ marginBottom: 12 }}>
            <Icon name="plus" size={11} /> New profile
          </Btn>
          {loading && <Spinner size={14} />}
          {!loading && profiles.length === 0 && <p className={styles.runnerEmpty}>No profiles yet.</p>}
          <div className={styles.mockList} style={{ width: 'auto' }}>
            {profiles.map(p => (
              <div key={p.id} className={styles.mockRow} style={{ cursor: 'default', alignItems: 'flex-start' }}>
                <div className={styles.mockInfo}>
                  <span className={styles.mockName}>{p.name}</span>
                  <span className={styles.mockMeta}>
                    {impact[p.id] ? `${impact[p.id].includedRequests} of ${impact[p.id].totalRequests} requests` : '…'}
                    {p.redactHeaders.length > 0 && ` · redacts ${p.redactHeaders.length} header(s)`}
                    {p.redactParams.length > 0 && ` · redacts ${p.redactParams.length} param(s)`}
                  </span>
                </div>
                <select
                  className={styles.exportSel}
                  value=""
                  onChange={e => { if (e.target.value) exportProfile(p, e.target.value); e.target.value = '' }}
                  title="Export this profile"
                >
                  <option value="" disabled>Export…</option>
                  <option value="postman">as Postman</option>
                  <option value="insomnia">as Insomnia</option>
                  <option value="openapi">as OpenAPI 3.1</option>
                </select>
                <IconBtn name="edit"  size={11} title="Edit"   onClick={() => setEditing(p)} />
                <IconBtn name="trash" size={11} title="Delete" onClick={() => deleteProfile(p.id)} danger />
              </div>
            ))}
          </div>
        </>
      )}
      {editing && (
        <ProfileEditor
          collection={col}
          profile={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </Modal>
  )
}

function ProfileEditor({ collection, profile, onCancel, onSaved }) {
  const showNotif = useStore(s => s.showNotif)
  const [name, setName] = useState(profile?.name || '')
  const [description, setDescription] = useState(profile?.description || '')
  const [mode, setMode] = useState(profile?.mode || 'allowlist')
  const [requestIds, setRequestIds] = useState(new Set(profile?.requestIds || []))
  const [redactHeaders, setRedactHeaders] = useState((profile?.redactHeaders || []).join(', '))
  const [redactParams, setRedactParams] = useState((profile?.redactParams || []).join(', '))
  const [saving, setSaving] = useState(false)

  const toggleRequest = (id) => {
    setRequestIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const save = async () => {
    if (!name.trim()) { showNotif('Profile name is required', 'error'); return }
    setSaving(true)
    const body = {
      name, description, mode,
      requestIds: [...requestIds],
      redactHeaders: redactHeaders.split(',').map(s => s.trim()).filter(Boolean),
      redactParams: redactParams.split(',').map(s => s.trim()).filter(Boolean),
    }
    try {
      if (profile) await apiFetch(`/api/collections/${collection.id}/profiles/${profile.id}`, { method: 'PUT', body })
      else await apiFetch(`/api/collections/${collection.id}/profiles`, { method: 'POST', body })
      showNotif('Profile saved', 'success')
      onSaved()
    } catch (e) { showNotif(e.message || 'Failed to save profile', 'error') }
    setSaving(false)
  }

  return (
    <div className={styles.settingsGrid} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <FormGroup label="Name">
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Public, Partner, AI Agent…" />
      </FormGroup>
      <FormGroup label="Description (optional)">
        <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="What is this audience allowed to see?" />
      </FormGroup>
      <FormGroup label="Mode">
        <Select value={mode} onChange={e => setMode(e.target.value)}>
          <option value="allowlist">Allowlist — only checked requests are included</option>
          <option value="blocklist">Blocklist — everything except checked requests</option>
        </Select>
      </FormGroup>
      <FormGroup label={mode === 'allowlist' ? 'Included requests' : 'Excluded requests'}>
        <div className={styles.mcpConfigBox} style={{ maxHeight: 180, overflowY: 'auto' }}>
          {(collection.requests || []).map(r => (
            <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={requestIds.has(r.id)} onChange={() => toggleRequest(r.id)} />
              <MethodBadge method={r.method} small />
              {r.name}
            </label>
          ))}
          {(collection.requests || []).length === 0 && <span className={styles.settingsHint}>This collection has no requests yet.</span>}
        </div>
      </FormGroup>
      <FormGroup label="Redact headers (comma-separated, optional)">
        <Input value={redactHeaders} onChange={e => setRedactHeaders(e.target.value)} placeholder="X-Admin-Token, X-Internal-Id" />
      </FormGroup>
      <FormGroup label="Redact query params (comma-separated, optional)">
        <Input value={redactParams} onChange={e => setRedactParams(e.target.value)} placeholder="debug, internal_flag" />
      </FormGroup>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
        <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
        <Btn variant="primary" onClick={save} disabled={saving}>{saving ? <Spinner size={12} /> : 'Save profile'}</Btn>
      </div>
    </div>
  )
}
