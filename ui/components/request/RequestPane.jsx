import { useState } from 'react'
import { useStore, apiFetch } from '../../store'
import { Icon, IconBtn, KVTable, FormGroup, Input, Select, Empty, Btn, JsonTree } from '../shared'
import { uid, buildCurl } from '../../utils'
import styles from './RequestPane.module.css'
import sharedStyles from '../shared/Shared.module.css'

const GRAPHQL_INTROSPECTION_QUERY = `query IntrospectionQuery { __schema { queryType { name } mutationType { name } subscriptionType { name } types { ...FullType } } } fragment FullType on __Type { kind name description fields(includeDeprecated: true) { name description args { ...InputValue } type { ...TypeRef } isDeprecated deprecationReason } inputFields { ...InputValue } interfaces { ...TypeRef } enumValues(includeDeprecated: true) { name description isDeprecated deprecationReason } possibleTypes { ...TypeRef } } fragment InputValue on __InputValue { name description type { ...TypeRef } defaultValue } fragment TypeRef on __Type { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name } } } } } } } }`

export function RequestPane() {
  const tabs         = useStore(s => s.tabs)
  const activeTabId  = useStore(s => s.activeTabId)
  const tab          = tabs.find(t => t.id === activeTabId) || tabs[0]
  const environments = useStore(s => s.environments)
  const activeEnvId  = useStore(s => s.activeEnvId)
  const activeEnv    = environments.find(e => e.id === activeEnvId) || environments[0] || null
  const envVars      = Object.fromEntries(
    (activeEnv?.variables || []).filter(v => v.enabled).map(v => [v.key, v.value])
  )
  const secretKeys   = (activeEnv?.variables || []).filter(v => v.secret).map(v => v.key)
  const ut           = useStore(s => s.updateActiveTab)
  const sendRequest  = useStore(s => s.sendRequest)
  const saveRequest  = useStore(s => s.saveRequest)
  const setActiveTab = useStore(s => s.setActiveTab)
  const closeTab     = useStore(s => s.closeTab)
  const newTab       = useStore(s => s.newTab)
  const showNotif    = useStore(s => s.showNotif)
  const connectWs    = useStore(s => s.connectWs)
  const disconnectWs = useStore(s => s.disconnectWs)
  const connectSse    = useStore(s => s.connectSse)
  const disconnectSse = useStore(s => s.disconnectSse)
  const connectSio    = useStore(s => s.connectSio)
  const disconnectSio = useStore(s => s.disconnectSio)
  const loadGrpcProto = useStore(s => s.loadGrpcProto)
  const callGrpc      = useStore(s => s.callGrpc)
  const disconnectGrpc = useStore(s => s.disconnectGrpc)

  const isWs   = tab.wsMode
  const isSse  = tab.sseMode
  const isSio  = tab.sioMode
  const isGrpc = tab.grpcMode

  const METHOD_COLORS = {
    GET: 'var(--m-GET)', POST: 'var(--m-POST)', PUT: 'var(--m-PUT)',
    PATCH: 'var(--m-PATCH)', DELETE: 'var(--m-DELETE)',
    HEAD: 'var(--tx-muted)', OPTIONS: 'var(--tx-muted)',
  }

  const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
  const currentReqType = isWs ? 'WS' : isSse ? 'SSE' : isSio ? 'SIO' : isGrpc ? 'GRPC' : tab.method
  const selectReqType = value => {
    if (isWs && tab.wsConnected) disconnectWs()
    if (isSse && tab.sseConnected) disconnectSse()
    if (isSio && tab.sioConnected) disconnectSio()
    if (isGrpc && tab.grpcConnected) disconnectGrpc()
    if (['WS', 'SSE', 'SIO', 'GRPC'].includes(value)) {
      ut({ wsMode: value === 'WS', sseMode: value === 'SSE', sioMode: value === 'SIO', grpcMode: value === 'GRPC' })
    } else {
      ut({ method: value, wsMode: false, sseMode: false, sioMode: false, grpcMode: false })
    }
  }

  const copyCurl = () => {
    const curl = buildCurl({
      method: tab.method, url: tab.url,
      headers: tab.headers, params: tab.params,
      body: tab.body, auth: tab.auth,
      environment: envVars, secretKeys,
    })
    navigator.clipboard.writeText(curl)
    showNotif('cURL copied', 'success')
  }

  const countEnabled = arr => (arr || []).filter(r => r.enabled && r.key).length

  // Compute test badge
  const testBadge = (() => {
    if (!tab.tests?.length) return null
    const r = tab.testResults || []
    if (!r.length) return tab.tests.length
    const p = r.filter(x => x.pass).length
    return `${p}/${tab.tests.length}`
  })()
  const testBadgeClass = (() => {
    const r = tab.testResults || []
    if (!r.length) return ''
    return r.filter(x => !x.pass && x.ran).length > 0 ? styles.badgeFail : styles.badgePass
  })()

  return (
    <div className={styles.wrap}>
      {/* ── Multi-tab strip ─────────────────────────────────────────────── */}
      <div className={styles.tabStrip}>
        {tabs.map(t => (
          <div
            key={t.id}
            className={`${styles.tabItem} ${t.id === activeTabId ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            <span className={styles.tabMethod} style={{ color: METHOD_COLORS[t.method] || 'var(--tx-muted)' }}>
              {t.method}
            </span>
            <span className={styles.tabName}>{t.reqName || t.url || 'New Request'}</span>
            <button
              className={styles.tabClose}
              onClick={e => { e.stopPropagation(); closeTab(t.id) }}
              title="Close tab"
            >
              <Icon name="x" size={9} />
            </button>
          </div>
        ))}
        <button className={styles.tabAdd} onClick={() => newTab()} title="New tab">
          <Icon name="plus" size={12} />
        </button>
      </div>

      {/* ── URL bar ─────────────────────────────────────────────────────── */}
      <div className={styles.urlBar}>
        <select
          className={styles.methodSelect}
          value={currentReqType}
          onChange={e => selectReqType(e.target.value)}
          style={{ color: (isWs || isSse || isSio || isGrpc) ? 'var(--accent)' : (METHOD_COLORS[tab.method] || 'var(--tx-base)') }}
        >
          <optgroup label="HTTP">
            {HTTP_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
          </optgroup>
          <optgroup label="Protocols">
            <option value="WS">WebSocket</option>
            <option value="SSE">SSE</option>
            <option value="SIO">Socket.IO</option>
            <option value="GRPC">gRPC</option>
          </optgroup>
        </select>

        <input
          className={styles.urlInput}
          placeholder="https://api.example.com/endpoint  •  use {{VAR}} for env vars, or ws(s):// for WebSocket"
          value={tab.url}
          onChange={e => ut({ url: e.target.value })}
          onKeyDown={e => e.key === 'Enter' && !isWs && !isSse && !isSio && !isGrpc && sendRequest()}
        />

        {!isWs && !isSse && !isSio && !isGrpc && (
          <>
            <button className={styles.curlBtn} onClick={copyCurl} title="Copy as cURL">
              <Icon name="terminal" size={13} />
            </button>
            <button className={styles.curlBtn} onClick={() => useStore.setState({ modal: 'codegen' })} title="Generate code snippet">
              <Icon name="code" size={13} />
            </button>
          </>
        )}
        <button className={styles.saveBtn} onClick={saveRequest} title="Save request">
          <Icon name="save" size={13} />
        </button>
        {isWs ? (
          <button
            className={`${styles.sendBtn} ${tab.wsConnected ? styles.sending : ''}`}
            onClick={() => tab.wsConnected ? disconnectWs() : connectWs(tab.url)}
          >
            {tab.wsConnected ? <><Icon name="x" size={13} /> Disconnect</> : <><Icon name="zap" size={13} /> Connect</>}
          </button>
        ) : isSse ? (
          <button
            className={`${styles.sendBtn} ${tab.sseConnected ? styles.sending : ''}`}
            onClick={() => tab.sseConnected ? disconnectSse() : connectSse(tab.url)}
          >
            {tab.sseConnected ? <><Icon name="x" size={13} /> Disconnect</> : <><Icon name="zap" size={13} /> Connect</>}
          </button>
        ) : isSio ? (
          <button
            className={`${styles.sendBtn} ${tab.sioConnected ? styles.sending : ''}`}
            onClick={() => tab.sioConnected ? disconnectSio() : connectSio(tab.url)}
          >
            {tab.sioConnected ? <><Icon name="x" size={13} /> Disconnect</> : <><Icon name="zap" size={13} /> Connect</>}
          </button>
        ) : isGrpc ? (
          <button
            className={`${styles.sendBtn} ${tab.grpcConnected ? styles.sending : ''}`}
            onClick={() => tab.grpcConnected ? disconnectGrpc() : callGrpc()}
          >
            {tab.grpcConnected ? <><Icon name="x" size={13} /> Cancel</> : <><Icon name="zap" size={13} /> Call</>}
          </button>
        ) : (
          <button
            className={`${styles.sendBtn} ${tab.loading ? styles.sending : ''}`}
            onClick={sendRequest}
            disabled={tab.loading}
          >
            {tab.loading
              ? <><span className={styles.spinner} /> Sending…</>
              : <><Icon name="send" size={13} /> Send</>
            }
          </button>
        )}
      </div>

      {/* ── Request sub-tabs ────────────────────────────────────────────── */}
      <div className={styles.reqTabs}>
        {[
          { key: 'params',  label: 'Params',   badge: countEnabled(tab.params)  || null },
          { key: 'headers', label: 'Headers',  badge: countEnabled(tab.headers) || null },
          { key: 'body',    label: 'Body',     badge: null },
          { key: 'auth',    label: 'Auth',     badge: tab.auth?.type !== 'none' ? '●' : null },
          { key: 'pre',     label: 'Pre-req',  badge: tab.preScript  ? 'JS' : null },
          { key: 'post',    label: 'Post-res', badge: tab.postScript ? 'JS' : null },
          { key: 'tests',   label: 'Tests',    badge: testBadge, badgeClass: testBadgeClass },
        ].map(({ key, label, badge, badgeClass }) => (
          <button
            key={key}
            className={`${styles.reqTab} ${tab.reqTab === key ? styles.reqTabActive : ''}`}
            onClick={() => ut({ reqTab: key })}
          >
            {label}
            {badge !== null && badge !== undefined && (
              <span className={`${styles.badge} ${badgeClass || ''}`}>{badge}</span>
            )}
          </button>
        ))}
        <div className={styles.reqTabSpacer} />
        {tab.activeReq && (
          <input
            className={styles.reqNameInput}
            value={tab.reqName || ''}
            onChange={e => ut({ reqName: e.target.value })}
            placeholder="Request name…"
          />
        )}
      </div>

      {/* ── Panel content ───────────────────────────────────────────────── */}
      <div className={styles.panel}>
        {isGrpc && (
          <GrpcPanel tab={tab} ut={ut} loadGrpcProto={loadGrpcProto} />
        )}
        {!isGrpc && tab.reqTab === 'params'  && <KVTable rows={tab.params}  onChange={v => ut({ params: v })}  placeholder={['Parameter', 'Value']} />}
        {!isGrpc && tab.reqTab === 'headers' && <KVTable rows={tab.headers} onChange={v => ut({ headers: v })} placeholder={['Header',    'Value']} />}
        {!isGrpc && tab.reqTab === 'body'    && (
          <BodyPanel
            body={tab.body} onChange={v => ut({ body: v })}
            method={tab.method} setMethod={m => ut({ method: m })}
            url={tab.url} headers={tab.headers} auth={tab.auth} environment={envVars}
          />
        )}
        {!isGrpc && tab.reqTab === 'auth'    && <AuthPanel    auth={tab.auth}        onChange={v => ut({ auth: v })} />}
        {!isGrpc && tab.reqTab === 'pre'     && <ScriptPanel  code={tab.preScript}   onChange={v => ut({ preScript: v })}   type="pre"  logs={tab.preLogs} />}
        {!isGrpc && tab.reqTab === 'post'    && <ScriptPanel  code={tab.postScript}  onChange={v => ut({ postScript: v })}  type="post" logs={tab.postLogs} />}
        {!isGrpc && tab.reqTab === 'tests'   && <TestsPanel   tests={tab.tests}      onChange={v => ut({ tests: v })}       results={tab.testResults} />}
      </div>
    </div>
  )
}

/* ── Body panel ───────────────────────────────────────────────────────────── */
function BodyPanel({ body, onChange, method, setMethod, url, headers, auth, environment }) {
  const set = (k, v) => onChange({ ...body, [k]: v })
  const TYPES = ['none', 'json', 'text', 'form', 'multipart', 'raw', 'graphql']
  const LABELS = { multipart: 'Form Data', graphql: 'GraphQL' }
  const selectType = t => {
    onChange({ ...body, type: t })
    if (t === 'graphql' && method !== 'POST') setMethod('POST')
  }
  return (
    <div className={styles.bodyWrap}>
      <div className={styles.bodyTypeBar}>
        {TYPES.map(t => (
          <button
            key={t}
            className={`${styles.bodyType} ${body.type === t ? styles.bodyTypeActive : ''}`}
            onClick={() => selectType(t)}
          >
            {LABELS[t] || (t.charAt(0).toUpperCase() + t.slice(1))}
          </button>
        ))}
      </div>
      {body.type === 'none' && <Empty icon="📭" text="No body" sub="Select a body type above" />}
      {body.type === 'form' && (
        <KVTable rows={body.fields || []} onChange={v => set('fields', v)} placeholder={['Field', 'Value']} />
      )}
      {body.type === 'multipart' && (
        <MultipartTable rows={body.fields || []} onChange={v => set('fields', v)} />
      )}
      {['json', 'text', 'raw'].includes(body.type) && (
        <textarea
          className={styles.codeArea}
          placeholder={body.type === 'json' ? '{\n  "key": "value"\n}' : 'Body content…'}
          value={body.content || ''}
          onChange={e => set('content', e.target.value)}
        />
      )}
      {body.type === 'graphql' && (
        <GraphQLPanel body={body} onChange={onChange} url={url} headers={headers} auth={auth} environment={environment} />
      )}
    </div>
  )
}

/* ── GraphQL body editor (query + variables + schema introspection) ─────────── */
function GraphQLPanel({ body, onChange, url, headers, auth, environment }) {
  const set = (k, v) => onChange({ ...body, [k]: v })
  const [loading, setLoading] = useState(false)
  const [schema,  setSchema]  = useState(null)
  const [error,   setError]   = useState('')

  const fetchSchema = async () => {
    setLoading(true); setError(''); setSchema(null)
    try {
      const res = await apiFetch('/api/execute', {
        method: 'POST',
        body: {
          method: 'POST', url, headers, auth, environment, saveToHistory: false,
          body: { type: 'json', content: JSON.stringify({ query: GRAPHQL_INTROSPECTION_QUERY }) },
        },
      })
      if (res.error) throw new Error(res.error)
      const parsed = JSON.parse(res.body)
      if (parsed.errors?.length) throw new Error(parsed.errors[0].message || 'Introspection failed')
      if (!parsed.data?.__schema) throw new Error('Server did not return a schema')
      setSchema(parsed.data.__schema)
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  return (
    <div className={styles.graphqlWrap}>
      <div className={styles.graphqlLabel}>Query</div>
      <textarea
        className={styles.codeArea}
        placeholder={'query {\n  \n}'}
        value={body.query || ''}
        onChange={e => set('query', e.target.value)}
      />
      <div className={styles.graphqlLabel}>Variables (JSON)</div>
      <textarea
        className={styles.codeArea}
        style={{ minHeight: 70 }}
        placeholder="{}"
        value={body.variables || ''}
        onChange={e => set('variables', e.target.value)}
      />
      <div className={styles.graphqlSchemaBar}>
        <Btn variant="ghost" size="sm" onClick={fetchSchema} disabled={loading || !url}>
          {loading ? 'Loading schema…' : 'Fetch Schema'}
        </Btn>
        {error && <span className={styles.graphqlSchemaError}>{error}</span>}
      </div>
      {schema && <div className={styles.graphqlSchemaTree}><JsonTree value={schema} /></div>}
    </div>
  )
}

/* ── gRPC panel: paste a .proto, pick a method, fill the request JSON ────────
   Address goes in the URL bar (host:port). Only unary and server-streaming
   methods are supported — client-streaming/bidi is rejected server-side.    */
function GrpcPanel({ tab, ut, loadGrpcProto }) {
  return (
    <div className={styles.graphqlWrap}>
      <div className={styles.graphqlLabel}>.proto file</div>
      <textarea
        className={styles.codeArea}
        style={{ minHeight: 100 }}
        placeholder={'syntax = "proto3";\npackage demo;\n\nservice Greeter {\n  rpc SayHello (HelloRequest) returns (HelloReply) {}\n}\n\nmessage HelloRequest { string name = 1; }\nmessage HelloReply { string message = 1; }'}
        value={tab.grpcProtoText}
        onChange={e => ut({ grpcProtoText: e.target.value })}
      />
      <div className={styles.graphqlSchemaBar}>
        <Btn variant="ghost" size="sm" onClick={loadGrpcProto} disabled={!tab.grpcProtoText?.trim()}>
          Load Proto
        </Btn>
        {tab.grpcMethods?.length > 0 && (
          <select
            className={sharedStyles.formSelect}
            style={{ flex: 1 }}
            value={tab.grpcMethodPath}
            onChange={e => ut({ grpcMethodPath: e.target.value })}
          >
            <option value="">Select a method…</option>
            {tab.grpcMethods.map(m => (
              <option key={m.path} value={m.path}>
                {m.path}{m.responseStream ? ' (server-streaming)' : ''}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className={styles.graphqlLabel}>Request (JSON)</div>
      <textarea
        className={styles.codeArea}
        style={{ minHeight: 90 }}
        placeholder={'{\n  "name": "World"\n}'}
        value={tab.grpcRequestJson}
        onChange={e => ut({ grpcRequestJson: e.target.value })}
      />
    </div>
  )
}

/* ── Multipart / form-data table (text fields + file fields) ────────────────── */
function MultipartTable({ rows, onChange }) {
  const update = (i, patch) => onChange(rows.map((r, j) => j === i ? { ...r, ...patch } : r))
  const del    = i => onChange(rows.filter((_, j) => j !== i))
  const add    = () => onChange([...rows, { id: uid(), key: '', value: '', type: 'text', enabled: true }])

  const readFile = (i, file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      // reader.result is "data:<mime>;base64,<data>" — strip the prefix, keep raw base64.
      const base64 = String(reader.result).split(',')[1] || ''
      update(i, { fileName: file.name, fileType: file.type || 'application/octet-stream', fileSize: file.size, fileData: base64 })
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className={sharedStyles.kvWrap}>
      <div className={sharedStyles.kvTable}>
        {rows.map((r, i) => (
          <div key={r.id || i} className={styles.multipartRow}>
            <input
              type="checkbox"
              className={sharedStyles.kvCheck}
              checked={r.enabled}
              onChange={e => update(i, { enabled: e.target.checked })}
            />
            <input
              className={sharedStyles.kvInput}
              placeholder="Field"
              value={r.key || ''}
              onChange={e => update(i, { key: e.target.value })}
            />
            <select
              className={styles.multipartType}
              value={r.type || 'text'}
              onChange={e => update(i, { type: e.target.value, value: '', fileName: undefined, fileType: undefined, fileData: undefined })}
            >
              <option value="text">Text</option>
              <option value="file">File</option>
            </select>
            {r.type === 'file' ? (
              <label className={styles.filePicker}>
                <Icon name="upload" size={12} />
                <span className={styles.filePickerLabel}>
                  {r.fileName || 'Choose file…'}
                </span>
                <input
                  type="file"
                  className={styles.fileInputHidden}
                  onChange={e => readFile(i, e.target.files?.[0])}
                />
              </label>
            ) : (
              <input
                className={sharedStyles.kvInput}
                placeholder="Value"
                value={r.value || ''}
                onChange={e => update(i, { value: e.target.value })}
              />
            )}
            <button className={styles.iconBtnDangerRow} onClick={() => del(i)}>
              <Icon name="x" size={11} />
            </button>
          </div>
        ))}
      </div>
      <button className={sharedStyles.addRowBtn} onClick={add}>
        <Icon name="plus" size={11} /> Add Row
      </button>
    </div>
  )
}

/* ── Auth panel ───────────────────────────────────────────────────────────── */
function AuthPanel({ auth, onChange }) {
  const set = (k, v) => onChange({ ...auth, [k]: v })
  return (
    <div className={styles.authWrap}>
      <FormGroup label="Auth type">
        <Select value={auth.type || 'none'} onChange={e => set('type', e.target.value)} className={styles.authSelect}>
          <option value="none">No Auth</option>
          <option value="bearer">Bearer Token</option>
          <option value="basic">Basic Auth</option>
          <option value="apikey">API Key</option>
        </Select>
      </FormGroup>
      {auth.type === 'bearer' && (
        <FormGroup label="Token">
          <Input value={auth.token || ''} onChange={e => set('token', e.target.value)} placeholder="Bearer token…" />
        </FormGroup>
      )}
      {auth.type === 'basic' && <>
        <FormGroup label="Username">
          <Input value={auth.username || ''} onChange={e => set('username', e.target.value)} />
        </FormGroup>
        <FormGroup label="Password">
          <Input type="password" value={auth.password || ''} onChange={e => set('password', e.target.value)} />
        </FormGroup>
      </>}
      {auth.type === 'apikey' && <>
        <FormGroup label="Key name">
          <Input value={auth.key || ''} onChange={e => set('key', e.target.value)} placeholder="X-API-Key" />
        </FormGroup>
        <FormGroup label="Value">
          <Input value={auth.value || ''} onChange={e => set('value', e.target.value)} />
        </FormGroup>
        <FormGroup label="Send in">
          <Select value={auth.placement || 'header'} onChange={e => set('placement', e.target.value)} className={styles.authSelect}>
            <option value="header">Header</option>
            <option value="query">Query param</option>
          </Select>
        </FormGroup>
      </>}
    </div>
  )
}

/* ── Script panel ─────────────────────────────────────────────────────────── */
function ScriptPanel({ code, onChange, type, logs }) {
  return (
    <div className={styles.scriptWrap}>
      <div className={styles.scriptHint}>
        {type === 'pre'
          ? 'Runs before the request. '
          : 'Runs after the response. Access response.status / .body / .headers. '}
        Available: <code className={styles.scriptCode}>consolio.log()</code>,{' '}
        <code className={styles.scriptCode}>consolio.setVariable(key, val)</code>,{' '}
        <code className={styles.scriptCode}>consolio.getVariable(key)</code>
      </div>
      <textarea
        className={styles.codeArea}
        style={{ flex: 1 }}
        placeholder={`// ${type === 'pre' ? 'Pre-request' : 'Post-response'} script\nconsolio.log('status:', response?.status);\n// consolio.setVariable('token', JSON.parse(response.body).token);`}
        value={code || ''}
        onChange={e => onChange(e.target.value)}
      />
      {logs && logs.length > 0 && (
        <div className={styles.scriptLogs}>
          {logs.map((l, i) => <div key={i} className={styles.scriptLogLine}>› {l}</div>)}
        </div>
      )}
    </div>
  )
}

/* ── Tests panel ──────────────────────────────────────────────────────────── */
function TestsPanel({ tests, onChange, results }) {
  const add = () => onChange([...(tests || []), { id: uid(), type: 'status', value: '200', path: '' }])
  const upd = (i, f, v) => onChange(tests.map((t, j) => j === i ? { ...t, [f]: v } : t))
  const del = i => onChange(tests.filter((_, j) => j !== i))

  return (
    <div className={styles.testsWrap}>
      <div className={styles.testsHeader}>
        {results?.length > 0
          ? <>
              <span className={styles.passCount}>● {results.filter(r => r.pass).length} pass</span>
              {'  '}
              <span className={styles.failCount}>{results.filter(r => !r.pass && r.ran).length} fail</span>
            </>
          : <span style={{ color: 'var(--tx-faint)' }}>Assertions — evaluated on Send</span>
        }
      </div>
      <div className={styles.assertionList}>
        {(tests || []).map((t, i) => {
          const res   = results?.[i]
          const state = res ? (res.pass ? 'pass' : 'fail') : 'pending'
          return (
            <div key={t.id || i} className={styles.assertRow}>
              <span className={`${styles.assertDot} ${styles[`dot_${state}`]}`} />
              <select
                className={styles.assertSel}
                value={t.type}
                onChange={e => upd(i, 'type', e.target.value)}
              >
                <option value="status">Status =</option>
                <option value="status_lt">Status &lt;</option>
                <option value="status_in">Status in list</option>
                <option value="has_header">Has header</option>
                <option value="header_equals">Header =</option>
                <option value="body_contains">Body contains</option>
                <option value="body_not_contains">Body doesn't contain</option>
                <option value="body_json_path">JSON path =</option>
                <option value="response_time">Response ≤ ms</option>
                <option value="response_time_gt">Response &gt; ms</option>
                <option value="body_not_empty">Body not empty</option>
              </select>
              {t.type === 'body_json_path' && (
                <input
                  className={styles.assertInput}
                  style={{ width: 100 }}
                  placeholder="e.g. data[0].id"
                  value={t.path || ''}
                  onChange={e => upd(i, 'path', e.target.value)}
                />
              )}
              {t.type !== 'body_not_empty' && (
                <input
                  className={styles.assertInput}
                  placeholder={
                    t.type === 'status' ? '200' :
                    t.type === 'status_in' ? '200,201,204' :
                    t.type === 'response_time' || t.type === 'response_time_gt' ? '500' :
                    t.type === 'header_equals' ? 'content-type=application/json' :
                    'value…'
                  }
                  value={t.value || ''}
                  onChange={e => upd(i, 'value', e.target.value)}
                />
              )}
              {res && <span className={styles.assertActual}>{res.actual}</span>}
              <button className={styles.assertDel} onClick={() => del(i)}>
                <Icon name="x" size={10} />
              </button>
            </div>
          )
        })}
      </div>
      <button className={styles.addAssert} onClick={add}>
        <Icon name="plus" size={11} /> Add assertion
      </button>
    </div>
  )
}
