import { useState, useEffect, useRef } from 'react'
import { useStore, apiFetch } from '../../store'
import { cn } from '@/lib/utils'
import { Plus, X, Sparkles, Play, Ban, Eye, EyeOff, Pencil, Trash2, Info } from 'lucide-react'
import { Icon, IconBtn, Btn, FormGroup, Input, Select, Spinner, MethodBadge, KVTable } from '../shared'
import { parseCurl, importPostmanCollection, importInsomniaExport, importOpenAPI, exportPostmanCollection, exportInsomniaCollection, exportOpenAPI, uid, fmtTime, timeAgo, buildHarRequest, GENERATE_TARGETS, downloadJson, downloadText, buildJUnitXml } from '../../utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

/* ── Modal shell ──────────────────────────────────────────────────────────── */
function Modal({ title, icon, onClose, children, footer, wide }) {
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent size={wide ? 'lg' : 'default'} className="gap-0">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            {icon && <Icon name={icon} size={15} className="text-primary" />}
            <DialogTitle>{title}</DialogTitle>
          </div>
        </DialogHeader>
        <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto p-5">{children}</div>
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  )
}

/* Pill-style tab strip, shared by Import / CodeGen ────────────────────────── */
function PillTabs({ items, activeKey, onChange, getKey = x => x, getLabel = x => x }) {
  return (
    <div className="flex flex-wrap gap-1">
      {items.map(item => {
        const key = getKey(item)
        return (
          <button
            key={key}
            className={cn(
              'rounded-sm border border-[var(--bd-subtle)] px-3.5 py-1 text-[11px] font-semibold text-[var(--tx-faint)] transition-colors hover:text-muted-foreground',
              key === activeKey && 'border-transparent bg-[var(--accent-dim)] text-primary!'
            )}
            onClick={() => onChange(key)}
          >
            {getLabel(item)}
          </button>
        )
      })}
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
      <PillTabs items={IMPORT_TABS} activeKey={tab} onChange={setTab} getKey={([k]) => k} getLabel={([, l]) => l} />
      <p className="m-0 text-[11.5px] text-[var(--tx-faint)]">{hints[tab]}</p>

      {tab === 'scan' ? (
        <div className="flex flex-col gap-2.5">
          <FormGroup label="Subdirectory (optional — defaults to the whole project)">
            <Input value={scanPath} onChange={e => setScanPath(e.target.value)} placeholder="src/routes" />
          </FormGroup>
          <FormGroup label="Base URL (optional — prefixed onto every discovered path)">
            <Input value={scanBaseUrl} onChange={e => setScanBaseUrl(e.target.value)} placeholder="http://localhost:3000" />
          </FormGroup>
          {scanResult && (
            <div className="mt-1.5 max-h-64 overflow-y-auto rounded-md border border-[var(--bd-subtle)]">
              <p className="m-0 border-b border-[var(--bd-faint)] px-3 py-2 text-[11px] text-[var(--tx-faint)]">{scanResult.description}</p>
              {scanResult.requests.map(r => (
                <div key={r.id} className="flex items-center gap-2 border-b border-[var(--bd-faint)] px-3 py-1.5 last:border-b-0">
                  <MethodBadge method={r.method} small />
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11.5px] text-foreground">{r.url}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <Textarea
          className="min-h-[130px] resize-y text-[11.5px] leading-[1.55]"
          placeholder={placeholders[tab]}
          value={text}
          onChange={e => setText(e.target.value)}
        />
      )}
      {error && <div className="rounded-sm border border-destructive/25 bg-[var(--err-dim)] px-3 py-2 text-[12px] text-destructive">{error}</div>}
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
      <PillTabs items={GENERATE_TARGETS} activeKey={targetIdx} onChange={setTargetIdx} getKey={(t, i) => GENERATE_TARGETS.indexOf(t)} getLabel={t => t.label} />
      {error
        ? <div className="rounded-sm border border-destructive/25 bg-[var(--err-dim)] px-3 py-2 text-[12px] text-destructive">{error}</div>
        : <Textarea className="min-h-[280px] resize-y text-[11.5px] leading-[1.55]" readOnly value={code} />
      }
    </Modal>
  )
}

/* ── Collection Runner ────────────────────────────────────────────────────── */
export function RunnerModal() {
  const collections = useStore(s => s.collections)
  const environments = useStore(s => s.environments)
  const activeEnvId  = useStore(s => s.activeEnvId)
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

  const RS_CLASS = {
    pass: 'bg-[var(--ok-dim)] text-[var(--ok)]',
    fail: 'bg-[var(--err-dim)] text-[var(--err)]',
    pending: 'bg-[var(--bg-overlay)] text-[var(--tx-faint)]',
    running: 'bg-[var(--accent-dim)] text-primary',
    skipped: 'bg-[var(--bg-overlay)] text-[var(--tx-faint)]',
  }

  return (
    <Modal title="Collection Runner" icon="play" onClose={close} wide footer={
      <Btn variant="ghost" onClick={close}>Close</Btn>
    }>
      <div className="flex items-center gap-2">
        <Select value={colId} onChange={e => setColId(e.target.value)} className="flex-1">
          {collections.map(c => (
            <option key={c.id} value={c.id}>{c.name} ({c.requests?.length || 0} requests)</option>
          ))}
        </Select>
        <Select value={envId} onChange={e => setEnvId(e.target.value)} className="w-[140px] shrink-0">
          <option value="">No environment</option>
          {environments.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </Select>
        <div className="flex shrink-0 items-center gap-1.5 text-[11px] text-[var(--tx-faint)]">
          <span>Concurrency</span>
          <input
            type="number" className="w-[60px] rounded-sm border border-[var(--bd-subtle)] bg-[var(--bg-raised)] px-1.5 py-1 text-right text-[11.5px] text-foreground focus:border-primary focus:outline-none"
            min={1} max={20} value={concurrency}
            onChange={e => setConcurrency(parseInt(e.target.value) || 1)}
          />
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-[11px] text-[var(--tx-faint)]">
          <span>Delay</span>
          <input
            type="number" className="w-[60px] rounded-sm border border-[var(--bd-subtle)] bg-[var(--bg-raised)] px-1.5 py-1 text-right text-[11.5px] text-foreground focus:border-primary focus:outline-none"
            min={0} max={5000} value={delay}
            onChange={e => setDelay(parseInt(e.target.value) || 0)}
          />
          <span>ms</span>
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] text-[var(--tx-faint)]">
          <input type="checkbox" checked={bail} onChange={e => setBail(e.target.checked)} />
          <span>Bail on fail</span>
        </label>
        <Btn variant="primary" onClick={run} disabled={running}>
          {running ? <><Spinner size={12} /> Running…</> : <><Play size={13} /> Run All</>}
        </Btn>
      </div>

      {results.length > 0 && (
        <div className="flex items-center gap-3.5 rounded-md border border-[var(--bd-faint)] bg-[var(--bg-raised)] px-3 py-2 text-[12px]">
          <span className="text-[var(--ok)]">● {passCount} passed</span>
          <span className="text-destructive">{failCount} failed</span>
          {skippedCount > 0 && <span className="text-[var(--tx-faint)]">{skippedCount} skipped</span>}
          <span className="text-[var(--tx-faint)]">{col?.requests?.length || 0} total</span>
          {!running && (
            <>
              <span className="flex-1" />
              <button className="text-[var(--tx-faint)] transition-colors hover:text-foreground" onClick={() => exportResults('json')} title="Export as JSON">JSON</button>
              <button className="text-[var(--tx-faint)] transition-colors hover:text-foreground" onClick={() => exportResults('junit')} title="Export as JUnit XML">JUnit</button>
            </>
          )}
        </div>
      )}

      <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
        {results.length === 0
          ? <p className="p-6 text-center text-[12px] text-[var(--tx-faint)]">Select a collection and press Run All</p>
          : results.map((r, i) => (
            <div key={i} className="flex items-center gap-2 rounded-sm border border-[var(--bd-faint)] bg-[var(--bg-raised)] px-2.5 py-1.5">
              <div className={cn('flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold', RS_CLASS[r._status])}>
                {r._status === 'pass'     ? '✓'
                 : r._status === 'fail'   ? '✕'
                 : r._status === 'running'? <Spinner size={10} />
                 : r._status === 'skipped'? '–'
                 : '·'}
              </div>
              <MethodBadge method={r.method || 'GET'} small />
              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-foreground">{r.name || r.url || `Request ${i + 1}`}</span>
              {r._testResults?.length > 0 && (
                <span className="shrink-0 font-mono text-[11px] text-[var(--tx-faint)]">{r._testResults.filter(t => t.pass).length}/{r._testResults.length} tests</span>
              )}
              {r._resStatus !== undefined && r._resStatus !== null && (
                <span className="shrink-0 font-mono text-[11px] text-[var(--tx-faint)]">{r._resStatus} · {fmtTime(r._elapsed || 0)}</span>
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
      <section className="flex flex-col gap-3">
        <h3 className="m-0 text-[11px] font-bold tracking-wide text-[var(--tx-faint)] uppercase">Project</h3>
        <div className="grid grid-cols-2 gap-3">
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
          <p className="col-span-full -mt-1 text-[11px] leading-[1.5] text-[var(--tx-faint)]">
            When on, GET responses previewed as HTML navigate the browser directly to
            the request URL — needed for apps with their own scripts, cookies, and
            cross-origin assets to render correctly. That preview frame can then read
            and write cookies/storage for that site, same as a normal browser tab. Off
            is safer for previewing untrusted or third-party APIs.
          </p>
        </div>
      </section>

      {/* ── AI Assist ───────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <h3 className="m-0 text-[11px] font-bold tracking-wide text-[var(--tx-faint)] uppercase">AI Assist</h3>
        <div className="grid grid-cols-2 gap-3">
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
        <p className="-mt-1 text-[11px] leading-[1.5] text-[var(--tx-faint)]">
          Powers the "Fix with AI" button on a request's Info tab, which suggests a
          description and test assertions. Bring-your-own-endpoint — works with Anthropic,
          OpenAI, Azure OpenAI, a local or remote Ollama instance, or any other
          OpenAI-Chat-Completions-compatible server. Settings are stored only in this
          browser's local storage, sent only when you click that button, and never
          saved to the project or to consolio's own storage.
        </p>
      </section>

      {/* ── Environments ────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center">
          <h3 className="m-0 flex-1 text-[11px] font-bold tracking-wide text-[var(--tx-faint)] uppercase">Environments</h3>
          <Btn variant="ghost" size="sm" onClick={() => {
            setEnvEdit('__new__')
            setEnvForm({ name: '', color: '#f59e0b', variables: [{ id: uid(), key: '', value: '', enabled: true, secret: false }] })
          }}>
            + New
          </Btn>
        </div>

        <div className="flex flex-col gap-1.5">
          {environments.map(env => (
            <div key={env.id} className="flex items-center gap-1.5 rounded-sm border border-[var(--bd-faint)] bg-[var(--bg-raised)] px-2.5 py-1.5">
              <span className="size-2 shrink-0 rounded-full" style={{ background: env.color || '#6366f1' }} />
              <span className="flex-1 text-[12px] text-foreground">{env.name}</span>
              {activeEnvId === env.id && <span className="rounded-full bg-[var(--ok-dim)] px-1.5 py-px text-[10px] text-[var(--ok)]">active</span>}
              <button className="flex items-center p-0.5 text-[var(--tx-faint)] transition-colors hover:text-foreground" title="Set active" onClick={() => useStore.setState({ activeEnvId: env.id })}>✓</button>
              <button className="flex items-center p-0.5 text-[var(--tx-faint)] transition-colors hover:text-foreground" title="Edit" onClick={() => startEditEnv(env)}><Icon name="settings" size={12} /></button>
              <button className="flex items-center p-0.5 text-[var(--tx-faint)] transition-colors hover:text-destructive!" title="Delete" onClick={() => deleteEnv(env.id)}><Icon name="trash" size={12} /></button>
            </div>
          ))}
          {environments.length === 0 && <p className="text-[12px] text-[var(--tx-faint)]">No environments yet</p>}
        </div>

        {/* Inline editor */}
        {envEdit && (
          <div className="flex flex-col gap-2.5 rounded-md border border-[var(--bd-base)] bg-[var(--bg-raised)] p-3.5">
            <div className="text-[11px] font-bold tracking-wide text-primary uppercase">
              {envEdit === '__new__' ? 'New Environment' : 'Edit Environment'}
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={envForm.name || ''}
                onChange={e => setEnvForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Environment name"
                className="flex-1"
              />
              <input
                type="color"
                value={envForm.color || '#f59e0b'}
                className="size-9 shrink-0 cursor-pointer rounded-sm border border-[var(--bd-subtle)] bg-[var(--bg-overlay)] p-0.5"
                onChange={e => setEnvForm(f => ({ ...f, color: e.target.value }))}
              />
            </div>

            <div className="text-[10.5px] font-semibold tracking-wide text-[var(--tx-faint)] uppercase">Variables</div>
            {(envForm.variables || []).map((v, i) => (
              <div key={v.id || i} className="flex items-center gap-1">
                <input
                  type="checkbox" className="size-3.5 shrink-0 accent-[var(--accent)]"
                  checked={v.enabled}
                  onChange={e => updEnvVar(i, 'enabled', e.target.checked)}
                />
                <input
                  className="flex-1 rounded-sm border border-[var(--bd-faint)] bg-[var(--bg-overlay)] px-1.5 py-1 font-mono text-[11px] text-foreground placeholder:text-[var(--tx-faint)] focus:border-primary focus:outline-none"
                  placeholder="KEY"
                  value={v.key || ''}
                  onChange={e => updEnvVar(i, 'key', e.target.value)}
                />
                <input
                  className="flex-1 rounded-sm border border-[var(--bd-faint)] bg-[var(--bg-overlay)] px-1.5 py-1 font-mono text-[11px] text-foreground placeholder:text-[var(--tx-faint)] focus:border-primary focus:outline-none"
                  placeholder="Value"
                  type={v.secret ? 'password' : 'text'}
                  value={v.value || ''}
                  onChange={e => updEnvVar(i, 'value', e.target.value)}
                />
                <button
                  className="flex p-0.5 text-[var(--tx-faint)] transition-colors hover:text-muted-foreground"
                  title={v.secret ? 'Show value' : 'Hide value'}
                  onClick={() => updEnvVar(i, 'secret', !v.secret)}
                >
                  <Icon name={v.secret ? 'eyeOff' : 'eye'} size={11} />
                </button>
                <button
                  className="flex p-0.5 text-[var(--tx-faint)] transition-colors hover:text-destructive"
                  onClick={() => setEnvForm(f => ({ ...f, variables: f.variables.filter((_, j) => j !== i) }))}
                >
                  <Icon name="x" size={10} />
                </button>
              </div>
            ))}

            <div className="flex items-center gap-2">
              <Btn variant="ghost" size="sm" onClick={() => setEnvForm(f => ({
                ...f,
                variables: [...(f.variables || []), { id: uid(), key: '', value: '', enabled: true, secret: false }],
              }))}>
                <Icon name="plus" size={11} /> Add Variable
              </Btn>
              <div className="flex-1" />
              <Btn variant="ghost"   size="sm" onClick={() => setEnvEdit(null)}>Cancel</Btn>
              <Btn variant="primary" size="sm" onClick={saveEnv}>Save</Btn>
            </div>
          </div>
        )}
      </section>

      {/* ── Browser interceptor hint ─────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <h3 className="m-0 text-[11px] font-bold tracking-wide text-[var(--tx-faint)] uppercase">Browser Interceptor</h3>
        <div className="flex flex-col gap-1.5 rounded-md border border-[var(--bd-faint)] bg-[var(--bg-raised)] px-3.5 py-3 text-[12px] leading-[1.7] text-muted-foreground [&_code]:rounded-[3px] [&_code]:bg-[var(--bg-overlay)] [&_code]:px-1.5 [&_code]:py-px [&_code]:text-primary">
          <p className="m-0">1. Open <code>chrome://extensions/</code> → enable <strong>Developer Mode</strong></p>
          <p className="m-0">2. Click <strong>Load unpacked</strong> → select the <code>extension/</code> folder</p>
          <p className="m-0">3. Click the consolio icon in your Chrome toolbar</p>
          <p className="m-0">4. Toggle <strong>Capture requests</strong> ON — requests appear in the <strong>Tap</strong> sidebar</p>
        </div>
      </section>
    </Modal>
  )
}

/* ── Plugin manager ───────────────────────────────────────────────────────── */
export function PluginManagerModal() {
  const showNotif = useStore(s => s.showNotif)
  const loadPluginTabs = useStore(s => s.loadPluginTabs)
  const modalData = useStore(s => s.modalData)
  const close = () => useStore.setState({ modal: null })

  const [plugins, setPlugins] = useState([])
  const [bundled, setBundled] = useState([])
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState(false)
  const [installingDirs, setInstallingDirs] = useState(() => new Set())
  const [pkgName, setPkgName] = useState('')
  const [infoPlugin, setInfoPlugin] = useState(null)
  const [focusedPlugin, setFocusedPlugin] = useState(null)
  const pluginNodes = useRef({})

  const loadPlugins = async () => {
    setLoading(true)
    try {
      const [installed, avail] = await Promise.all([apiFetch('/api/plugins'), apiFetch('/api/plugins/bundled')])
      setPlugins(installed)
      setBundled(avail)
    } catch { }
    setLoading(false)
    await loadPluginTabs()
  }
  useEffect(() => { loadPlugins() }, [])
  useEffect(() => {
    const name = modalData?.pluginName
    if (!name || !pluginNodes.current[name]) return
    pluginNodes.current[name].scrollIntoView({ block: 'center', behavior: 'smooth' })
    setFocusedPlugin(name)
    const timer = setTimeout(() => setFocusedPlugin(null), 1800)
    return () => clearTimeout(timer)
  }, [modalData?.pluginName, plugins, bundled])

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
    setInstallingDirs(current => new Set(current).add(dir))
    try {
      const res = await apiFetch('/api/plugins/bundled', { method: 'POST', body: { dir } })
      if (res.error) throw new Error(res.error)
      showNotif(`Installed ${res.name}`, 'success')
      await loadPlugins()
    } catch (e) { showNotif(e.message, 'error') }
    finally {
      setInstallingDirs(current => {
        const next = new Set(current)
        next.delete(dir)
        return next
      })
    }
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
  const setPluginNode = name => node => {
    if (node) pluginNodes.current[name] = node
    else delete pluginNodes.current[name]
  }

  return (
    <>
      <Modal title="Plugins" icon="code" onClose={close} footer={<Btn variant="ghost" onClick={close}>Close</Btn>}>
      <p className="m-0 text-[11.5px] text-[var(--tx-faint)]">
        Installs an npm package into <code className="rounded-[3px] bg-[var(--bg-overlay)] px-1.5 py-px text-primary">.consolio/plugins/</code>. A plugin exports
        <code className="rounded-[3px] bg-[var(--bg-overlay)] px-1.5 py-px text-primary"> requestHooks</code>, <code className="rounded-[3px] bg-[var(--bg-overlay)] px-1.5 py-px text-primary">responseHooks</code>, <code className="rounded-[3px] bg-[var(--bg-overlay)] px-1.5 py-px text-primary">templateTags</code>, and/or <code className="rounded-[3px] bg-[var(--bg-overlay)] px-1.5 py-px text-primary">paneTabs</code> — see the README.
      </p>
      <div className="flex flex-row gap-1.5 rounded-sm border border-dashed border-[var(--bd-subtle)] p-2">
        <Input value={pkgName} onChange={e => setPkgName(e.target.value)} placeholder="npm package name" />
        <Btn variant="primary" size="sm" onClick={install} disabled={installing}>
          {installing ? <Spinner size={12} /> : 'Install'}
        </Btn>
      </div>

      {!loading && notYetInstalled.length > 0 && (
        <>
          <p className="mt-3.5 text-[11px] leading-[1.5] text-[var(--tx-faint)]">Bundled with consolio — install with one click:</p>
          <div className="flex flex-col gap-1">
            {notYetInstalled.map(b => (
              <div key={b.dir} ref={setPluginNode(b.name)} className={cn('flex cursor-default items-center gap-2 rounded-sm border border-[var(--bd-faint)] bg-[var(--bg-raised)] px-2 py-1.5 transition-colors', focusedPlugin === b.name && 'border-primary bg-[var(--accent-dim)]')}>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-foreground">{b.name}</span>
                  <span className="font-mono text-[10px] text-[var(--tx-faint)]">{b.description}</span>
                </div>
                <button className="flex items-center p-0.5 text-[var(--tx-faint)] transition-colors hover:text-foreground" onClick={() => setInfoPlugin(b)} title="Plugin information"><Info size={13} /></button>
                <Btn variant="ghost" size="sm" onClick={() => installBundled(b.dir)} disabled={installingDirs.has(b.dir)}>
                  {installingDirs.has(b.dir) ? <Spinner size={12} /> : 'Install'}
                </Btn>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-3 flex flex-col gap-1">
        {loading && <Spinner size={16} />}
        {!loading && plugins.length === 0 && <p className="p-6 text-center text-[12px] text-[var(--tx-faint)]">No plugins installed</p>}
        {plugins.map(p => (
          <div key={p.name} ref={setPluginNode(p.name)} className={cn('flex cursor-default items-center gap-2 rounded-sm border border-[var(--bd-faint)] bg-[var(--bg-raised)] px-2 py-1.5 transition-colors', focusedPlugin === p.name && 'border-primary bg-[var(--accent-dim)]')}>
            <span className={cn('size-1.5 shrink-0 rounded-full', p.enabled ? 'bg-[var(--ok)] shadow-[0_0_0_3px_var(--ok-dim)]' : 'bg-[var(--tx-faint)]')} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-foreground">
                {p.name}{' '}
                {bundledNames.has(p.name) && <span className="rounded-full bg-[var(--ok-dim)] px-1.5 py-px text-[10px] text-[var(--ok)]">Core</span>}
              </span>
              <span className="font-mono text-[10px] text-[var(--tx-faint)]">v{p.version}</span>
            </div>
            <button className="flex items-center p-0.5 text-[var(--tx-faint)] transition-colors hover:text-foreground" onClick={() => setInfoPlugin(p)} title="Plugin information">
              <Info size={13} />
            </button>
            <button className="flex items-center p-0.5 text-[var(--tx-faint)] transition-colors hover:text-foreground" onClick={() => toggleEnabled(p)} title={p.enabled ? 'Disable' : 'Enable'}>
              <Icon name={p.enabled ? 'eyeOff' : 'eye'} size={13} />
            </button>
            <button className="flex items-center p-0.5 text-[var(--tx-faint)] transition-colors hover:text-destructive!" onClick={() => uninstall(p.name)} title="Uninstall">
              <Icon name="trash" size={13} />
            </button>
          </div>
        ))}
      </div>
      </Modal>
      {infoPlugin && <PluginInfoModal plugin={infoPlugin} onClose={() => setInfoPlugin(null)} />}
    </>
  )
}

function PluginInfoModal({ plugin, onClose }) {
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent size="default" className="gap-0">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <Info size={15} className="text-primary" />
            <DialogTitle>{plugin.name}</DialogTitle>
          </div>
        </DialogHeader>
        <div className="flex flex-col gap-4 p-5">
          <div className="grid grid-cols-3 gap-2 text-[11.5px]">
            <div><div className="text-[var(--tx-faint)]">Author</div><div className="mt-0.5 text-foreground">{plugin.author || 'Not specified'}</div></div>
            <div><div className="text-[var(--tx-faint)]">Version</div><div className="mt-0.5 font-mono text-foreground">{plugin.version || 'Not specified'}</div></div>
            <div><div className="text-[var(--tx-faint)]">Release</div><div className="mt-0.5 text-foreground">{plugin.release || 'Not specified'}</div></div>
          </div>
          <section>
            <h3 className="m-0 text-[11px] font-bold uppercase tracking-wide text-[var(--tx-faint)]">Description</h3>
            <p className="mt-1.5 mb-0 text-[12px] leading-relaxed text-foreground">{plugin.description || 'No description provided.'}</p>
          </section>
          <section className="border-l-2 border-primary pl-3">
            <h3 className="m-0 text-[11px] font-bold uppercase tracking-wide text-[var(--tx-faint)]">Developer use-case</h3>
            <p className="mt-1.5 mb-0 text-[12px] leading-relaxed text-foreground">{plugin.useCase || 'Use this plugin to extend consolio for a recurring API development workflow.'}</p>
          </section>
          {plugin.homepage && <a className="text-[12px] text-primary underline underline-offset-2" href={plugin.homepage} target="_blank" rel="noreferrer">Plugin homepage</a>}
        </div>
      </DialogContent>
    </Dialog>
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
      <div className="flex min-h-[360px] gap-3.5">
        <div className="flex w-[220px] shrink-0 flex-col gap-1">
          {loading && <Spinner size={16} />}
          {!loading && mocks.length === 0 && !creating && (
            <p className="p-6 text-center text-[12px] text-[var(--tx-faint)]">No mock sets yet</p>
          )}
          {mocks.map(m => (
            <div
              key={m.id}
              className={cn('flex cursor-pointer items-center gap-2 rounded-sm border border-[var(--bd-faint)] bg-[var(--bg-raised)] px-2 py-1.5', m.id === selectedId && 'border-primary')}
              onClick={() => setSelectedId(m.id)}
            >
              <span className={cn('size-1.5 shrink-0 rounded-full', m.running ? 'bg-[var(--ok)] shadow-[0_0_0_3px_var(--ok-dim)]' : 'bg-[var(--tx-faint)]')} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-foreground">{m.name}</span>
                <span className="font-mono text-[10px] text-[var(--tx-faint)]">:{m.port} · {m.routes?.length || 0} routes</span>
              </div>
              <button className="flex items-center p-0.5 text-[var(--tx-faint)] transition-colors hover:text-foreground" onClick={e => toggleRunning(m, e)} title={m.running ? 'Stop' : 'Start'}>
                <Icon name={m.running ? 'ban' : 'play'} size={13} />
              </button>
              <button className="flex items-center p-0.5 text-[var(--tx-faint)] transition-colors hover:text-destructive!" onClick={e => deleteMock(m.id, e)} title="Delete">
                <Icon name="trash" size={13} />
              </button>
            </div>
          ))}

          {creating ? (
            <div className="flex flex-col gap-1.5 rounded-sm border border-dashed border-[var(--bd-subtle)] p-2">
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Mock set name" />
              <Input value={newPort} onChange={e => setNewPort(e.target.value)} placeholder="Port" />
              <div className="flex gap-1.5">
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

        <div className="flex min-w-0 flex-1 flex-col gap-2.5 overflow-y-auto">
          {!selected ? (
            <p className="p-6 text-center text-[12px] text-[var(--tx-faint)]">Select a mock set to edit its routes</p>
          ) : (
            <>
              {routes.map((route, i) => (
                <div key={route.id} className="flex flex-col gap-1.5 rounded-md border border-[var(--bd-faint)] bg-[var(--bg-raised)] p-2">
                  <div className="flex items-center gap-1.5">
                    <Select value={route.method} onChange={e => updateRoute(i, { method: e.target.value })} className="w-[90px] shrink-0">
                      {['GET','POST','PUT','PATCH','DELETE'].map(m => <option key={m} value={m}>{m}</option>)}
                    </Select>
                    <Input value={route.path} onChange={e => updateRoute(i, { path: e.target.value })} placeholder="/users/:id" className="flex-1" />
                    <Input value={route.statusCode} onChange={e => updateRoute(i, { statusCode: parseInt(e.target.value) || 200 })} placeholder="200" className="w-[70px] shrink-0" />
                    <Input value={route.delayMs} onChange={e => updateRoute(i, { delayMs: parseInt(e.target.value) || 0 })} placeholder="delay ms" className="w-[70px] shrink-0" />
                    <IconBtn name="trash" size={13} title="Delete route" onClick={() => deleteRoute(i)} />
                  </div>
                  <KVTable rows={route.headers || []} onChange={v => updateRoute(i, { headers: v })} placeholder={['Header', 'Value']} />
                  <Textarea
                    className="min-h-[70px] resize-y rounded-sm bg-[var(--bg-base)] font-mono text-[11.5px]"
                    placeholder={'{\n  "id": "{{id}}"\n}'}
                    value={route.body || ''}
                    onChange={e => updateRoute(i, { body: e.target.value })}
                  />
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Btn variant="ghost" size="sm" onClick={addRoute}><Icon name="plus" size={11} /> Add Route</Btn>
                <div className="flex-1" />
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
      <div className="mb-3.5 grid grid-cols-2 gap-3">
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
          <div className="flex flex-wrap gap-2.5">
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
              <div className="mt-4 flex items-center justify-between">
                <h3 className="m-0 text-[11px] font-bold tracking-wide text-[var(--tx-faint)] uppercase">MCP Server</h3>
                <Btn variant="ghost" size="sm" onClick={() => setShowMcpConfig(v => !v)}>
                  <Icon name="sparkle" size={11} /> {showMcpConfig ? 'Hide' : 'Generate'} config
                </Btn>
              </div>
              <p className="my-1 text-[11px] leading-[1.5] text-[var(--tx-faint)]">
                This collection can be served as an MCP server — each request becomes a tool an AI agent can call directly.
              </p>
              <div className="flex flex-col gap-1">
                {mcpManifest.tools.map(t => (
                  <div key={t.name} className="flex cursor-default items-center gap-2 rounded-sm border border-[var(--bd-faint)] bg-[var(--bg-raised)] px-2 py-1.5">
                    <MethodBadge method={t.method || 'GET'} small />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-foreground">{t.name}</span>
                      <span className="font-mono text-[10px] text-[var(--tx-faint)]">{t.url}</span>
                    </div>
                  </div>
                ))}
              </div>
              {showMcpConfig && (
                <div className="mt-2.5 rounded-md border border-[var(--bd-subtle)] bg-[var(--bg-overlay)] px-3.5 py-3">
                  <p className="mb-2 text-[11px] leading-[1.5] text-[var(--tx-faint)]">
                    Add this to your MCP client's config (e.g. Claude Desktop's <code>claude_desktop_config.json</code>):
                  </p>
                  <pre className="m-0 overflow-x-auto rounded-sm border border-[var(--bd-faint)] bg-[var(--bg-raised)] px-3 py-2.5 font-mono text-[11px] leading-[1.5] whitespace-pre text-foreground">{JSON.stringify(mcpManifest.configSnippet, null, 2)}</pre>
                  <div className="mt-2 flex justify-end">
                    <Btn variant="primary" size="sm" onClick={copyMcpConfig}>Copy config</Btn>
                  </div>
                </div>
              )}
            </>
          )}

          {score?.topIssues?.length > 0 && (
            <>
              <h3 className="m-0 mt-4 text-[11px] font-bold tracking-wide text-[var(--tx-faint)] uppercase">Top issues</h3>
              <div className="mt-2 flex flex-col gap-1">
                {score.topIssues.map(issue => (
                  <div key={issue.id} className="flex cursor-default items-center gap-2 rounded-sm border border-[var(--bd-faint)] bg-[var(--bg-raised)] px-2 py-1.5">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-foreground">{issue.label}</span>
                      <span className="font-mono text-[10px] text-[var(--tx-faint)]">{issue.fix}</span>
                    </div>
                    <span className="shrink-0 text-[11px] text-[var(--tx-faint)]">{issue.count} request{issue.count === 1 ? '' : 's'}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <h3 className="m-0 mt-4 text-[11px] font-bold tracking-wide text-[var(--tx-faint)] uppercase">By request</h3>
          {analytics.requestBreakdown.length === 0 && (
            <p className="p-6 text-center text-[12px] text-[var(--tx-faint)]">No tracked calls yet — requests sent from a saved collection request will show up here.</p>
          )}
          <div className="mt-2 flex flex-col gap-1">
            {analytics.requestBreakdown.map(r => (
              <div key={r.requestId} className="flex cursor-default items-center gap-2 rounded-sm border border-[var(--bd-faint)] bg-[var(--bg-raised)] px-2 py-1.5">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-foreground">{r.requestName}</span>
                  <span className="font-mono text-[10px] text-[var(--tx-faint)]">{r.totalRequests} calls · avg {r.avgLatencyMs}ms · {r.errorRate}% errors</span>
                </div>
              </div>
            ))}
          </div>

          {analytics.recentErrors.length > 0 && (
            <>
              <h3 className="m-0 mt-4 text-[11px] font-bold tracking-wide text-[var(--tx-faint)] uppercase">Recent errors</h3>
              <div className="mt-2 flex flex-col gap-1">
                {analytics.recentErrors.map(e => (
                  <div key={e.id} className="flex cursor-default items-center gap-2 rounded-sm border border-[var(--bd-faint)] bg-[var(--bg-raised)] px-2 py-1.5">
                    <MethodBadge method={e.method || 'GET'} small />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-foreground">{e.requestName || e.url}</span>
                      <span className="font-mono text-[10px] text-[var(--tx-faint)]">{timeAgo(e.timestamp)}</span>
                    </div>
                    <span className="shrink-0 text-[11px] text-destructive">{e.status} {e.statusText}</span>
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
    <div className="flex min-w-[110px] flex-col gap-0.5 rounded-lg border border-[var(--bd-subtle)] bg-[var(--bg-overlay)] px-3.5 py-2.5">
      <span className="text-[18px] font-bold" style={{ color }}>{value}</span>
      <span className="text-[10.5px] text-[var(--tx-faint)]">{label}</span>
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
          <p className="mb-3 text-[11.5px] text-[var(--tx-faint)]">
            A profile scopes this collection to a subset of requests for a given audience — export or generate an MCP server from just that slice, with chosen headers/params stripped.
          </p>
          <Btn variant="primary" size="sm" onClick={() => setEditing('new')} className="mb-3 self-start">
            <Icon name="plus" size={11} /> New profile
          </Btn>
          {loading && <Spinner size={14} />}
          {!loading && profiles.length === 0 && <p className="p-6 text-center text-[12px] text-[var(--tx-faint)]">No profiles yet.</p>}
          <div className="flex flex-col gap-1">
            {profiles.map(p => (
              <div key={p.id} className="flex cursor-default items-start gap-2 rounded-sm border border-[var(--bd-faint)] bg-[var(--bg-raised)] px-2 py-1.5">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-foreground">{p.name}</span>
                  <span className="font-mono text-[10px] text-[var(--tx-faint)]">
                    {impact[p.id] ? `${impact[p.id].includedRequests} of ${impact[p.id].totalRequests} requests` : '…'}
                    {p.redactHeaders.length > 0 && ` · redacts ${p.redactHeaders.length} header(s)`}
                    {p.redactParams.length > 0 && ` · redacts ${p.redactParams.length} param(s)`}
                  </span>
                </div>
                <select
                  className="shrink-0 cursor-pointer bg-transparent text-[10px] text-[var(--tx-faint)] hover:text-muted-foreground"
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
    <div className="flex flex-col gap-2.5">
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
        <div className="max-h-[180px] overflow-y-auto rounded-md border border-[var(--bd-subtle)] bg-[var(--bg-overlay)] px-3.5 py-3">
          {(collection.requests || []).map(r => (
            <label key={r.id} className="flex cursor-pointer items-center gap-2 py-1 text-[12px]">
              <input type="checkbox" checked={requestIds.has(r.id)} onChange={() => toggleRequest(r.id)} />
              <MethodBadge method={r.method} small />
              {r.name}
            </label>
          ))}
          {(collection.requests || []).length === 0 && <span className="text-[11px] text-[var(--tx-faint)]">This collection has no requests yet.</span>}
        </div>
      </FormGroup>
      <FormGroup label="Redact headers (comma-separated, optional)">
        <Input value={redactHeaders} onChange={e => setRedactHeaders(e.target.value)} placeholder="X-Admin-Token, X-Internal-Id" />
      </FormGroup>
      <FormGroup label="Redact query params (comma-separated, optional)">
        <Input value={redactParams} onChange={e => setRedactParams(e.target.value)} placeholder="debug, internal_flag" />
      </FormGroup>
      <div className="mt-1 flex justify-end gap-2">
        <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
        <Btn variant="primary" onClick={save} disabled={saving}>{saving ? <Spinner size={12} /> : 'Save profile'}</Btn>
      </div>
    </div>
  )
}
