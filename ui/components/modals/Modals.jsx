import { useState } from 'react'
import { useStore, apiFetch } from '../../store'
import { Icon, Btn, FormGroup, Input, Select, Spinner, MethodBadge } from '../shared'
import { parseCurl, importPostmanCollection, uid, fmtTime } from '../../utils'
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
      } else {
        const json = JSON.parse(text)
        if (!json.info || !json.item) throw new Error('Not a valid Postman collection (needs info + item fields)')
        const imported = importPostmanCollection(json)
        const col = await apiFetch('/api/collections', {
          method: 'POST',
          body: { name: imported.name, description: 'Imported from Postman' },
        })
        for (const r of imported.requests) {
          await apiFetch(`/api/collections/${col.id}/requests`, { method: 'POST', body: r })
        }
        useStore.setState({ collections: await apiFetch('/api/collections') })
        showNotif(`Imported ${imported.requests.length} requests`, 'success')
        close()
      }
    } catch (e) { setError(e.message) }
  }

  return (
    <Modal
      title="Import" icon="upload" onClose={close}
      footer={<><Btn variant="ghost" onClick={close}>Cancel</Btn><Btn variant="primary" onClick={doImport}>Import</Btn></>}
    >
      <div className={styles.importTabs}>
        {[['curl', 'cURL command'], ['postman', 'Postman Collection JSON']].map(([key, label]) => (
          <button key={key} className={`${styles.importTab} ${tab === key ? styles.importTabActive : ''}`} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      <p className={styles.importHint}>
        {tab === 'curl'
          ? 'Paste a cURL command — headers, auth, body and URL are parsed automatically.'
          : 'Paste the full contents of an exported Postman collection JSON file.'}
      </p>
      <textarea
        className={styles.importArea}
        placeholder={tab === 'curl'
          ? "curl -X POST 'https://api.example.com/users' \\\n  -H 'Authorization: Bearer token' \\\n  -H 'Content-Type: application/json' \\\n  -d '{\"name\":\"John\"}'"
          : '{\n  "info": { "name": "My Collection" },\n  "item": [ ... ]\n}'}
        value={text}
        onChange={e => setText(e.target.value)}
      />
      {error && <div className={styles.importError}>{error}</div>}
    </Modal>
  )
}

/* ── Collection Runner ────────────────────────────────────────────────────── */
export function RunnerModal() {
  const collections = useStore(s => s.collections)
  const getEnvVars  = useStore(s => s.getEnvVars)
  const showNotif   = useStore(s => s.showNotif)
  const close = () => useStore.setState({ modal: null })

  const [colId,   setColId]   = useState(collections[0]?.id || '')
  const [delay,   setDelay]   = useState(0)
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState([])

  const col = collections.find(c => c.id === colId)

  const run = async () => {
    if (!col || running) return
    setRunning(true)
    const reqs    = col.requests || []
    const envVars = getEnvVars()
    setResults(reqs.map(r => ({ ...r, _status: 'pending' })))

    for (let i = 0; i < reqs.length; i++) {
      const req = reqs[i]
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
            environment: envVars,
            saveToHistory: false,
          },
        })
        setResults(prev => prev.map((r, j) => j === i
          ? { ...r, _status: res.status < 400 ? 'pass' : 'fail', _resStatus: res.status, _elapsed: res.elapsed }
          : r
        ))
      } catch {
        setResults(prev => prev.map((r, j) => j === i ? { ...r, _status: 'fail', _resStatus: 0, _elapsed: 0 } : r))
      }
      if (delay > 0 && i < reqs.length - 1) await new Promise(r => setTimeout(r, delay))
    }
    setRunning(false)
  }

  const passCount = results.filter(r => r._status === 'pass').length
  const failCount = results.filter(r => r._status === 'fail').length

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
        <div className={styles.delayControl}>
          <span>Delay</span>
          <input
            type="number" className={styles.delayInput}
            min={0} max={5000} value={delay}
            onChange={e => setDelay(parseInt(e.target.value) || 0)}
          />
          <span>ms</span>
        </div>
        <Btn variant="primary" onClick={run} disabled={running}>
          {running ? <><Spinner size={12} /> Running…</> : <><Icon name="play" size={13} /> Run All</>}
        </Btn>
      </div>

      {results.length > 0 && (
        <div className={styles.runnerSummary}>
          <span className={styles.passCount}>● {passCount} passed</span>
          <span className={styles.failCount}>{failCount} failed</span>
          <span className={styles.totalCount}>{col?.requests?.length || 0} total</span>
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
                 : '·'}
              </div>
              <MethodBadge method={r.method || 'GET'} small />
              <span className={styles.runnerName}>{r.name || r.url || `Request ${i + 1}`}</span>
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
