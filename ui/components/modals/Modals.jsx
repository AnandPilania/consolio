import { useState, useEffect } from 'react'
import { useStore, apiFetch } from '../../store'
import { Icon, IconBtn, Btn, FormGroup, Input, Select, Spinner, MethodBadge, KVTable } from '../shared'
import { parseCurl, importPostmanCollection, importInsomniaExport, importOpenAPI, uid, fmtTime, buildHarRequest, GENERATE_TARGETS, downloadJson, downloadText, buildJUnitXml } from '../../utils'
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
  const requests = imported.requests.map(r => ({ ...r, folderId: idMap[r.folderId] || null }))
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
]

export function ImportModal() {
  const [tab,   setTab]   = useState('curl')
  const [text,  setText]  = useState('')
  const [error, setError] = useState('')
  const showNotif = useStore(s => s.showNotif)
  const close = () => useStore.setState({ modal: null })

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
  }
  const placeholders = {
    curl: "curl -X POST 'https://api.example.com/users' \\\n  -H 'Authorization: Bearer token' \\\n  -H 'Content-Type: application/json' \\\n  -d '{\"name\":\"John\"}'",
    postman: '{\n  "info": { "name": "My Collection" },\n  "item": [ ... ]\n}',
    insomnia: '{\n  "_type": "export",\n  "resources": [ ... ]\n}',
    openapi: 'openapi: 3.0.0\ninfo:\n  title: My API\npaths:\n  /users:\n    get: ...',
  }

  return (
    <Modal
      title="Import" icon="upload" onClose={close}
      footer={<><Btn variant="ghost" onClick={close}>Cancel</Btn><Btn variant="primary" onClick={doImport}>Import</Btn></>}
    >
      <div className={styles.importTabs}>
        {IMPORT_TABS.map(([key, label]) => (
          <button key={key} className={`${styles.importTab} ${tab === key ? styles.importTabActive : ''}`} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      <p className={styles.importHint}>{hints[tab]}</p>
      <textarea
        className={styles.importArea}
        placeholder={placeholders[tab]}
        value={text}
        onChange={e => setText(e.target.value)}
      />
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
