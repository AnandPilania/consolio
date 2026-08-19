import { useState } from 'react'
import { cx } from '../../utils'
import styles from './Shared.module.css'

/* ── Icon ─────────────────────────────────────────────────────────────────── */
const PATHS = {
  plus:      'M12 5v14M5 12h14',
  trash:     'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
  send:      'M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z',
  folder:    'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z',
  chevRight: 'M9 18l6-6-6-6',
  settings:  'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z',
  history:   'M12 8v4l3 3M3.05 11a9 9 0 100 2H3',
  zap:       'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  copy:      'M8 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2M8 4a2 2 0 012-2h4a2 2 0 012 2M8 4h8',
  x:         'M18 6L6 18M6 6l12 12',
  check:     'M20 6L9 17l-5-5',
  eye:       'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 100 6 3 3 0 000-6z',
  eyeOff:    'M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22',
  save:      'M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2zM17 21v-8H7v8M7 3v5h8',
  play:      'M5 3l14 9-14 9V3z',
  code:      'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4',
  terminal:  'M4 17l6-6-6-6M12 19h8',
  search:    'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
  upload:    'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12',
  layout:    'M12 3h7a2 2 0 012 2v14a2 2 0 01-2 2h-7M12 3H5a2 2 0 00-2 2v14a2 2 0 002 2h7M12 3v18',
  filter:    'M22 3H2l8 9.46V19l4 2v-8.54L22 3z',
  globe:     'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20',
  drag:      'M8 6h.01M8 12h.01M8 18h.01M16 6h.01M16 12h.01M16 18h.01',
  chevDown:  'M6 9l6 6 6-6',
  refresh:   'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15',
  ban:       'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636',
  shield:    'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
}

export function Icon({ name, size = 14, className, style }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size} height={size}
      viewBox="0 0 24 24"
      fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      className={className} style={style}
    >
      <path d={PATHS[name] || ''} />
    </svg>
  )
}

/* ── Method badge ─────────────────────────────────────────────────────────── */
export function MethodBadge({ method, small }) {
  return (
    <span className={cx(styles.badge, styles[`m_${method}`], small && styles.badgeSm)}>
      {method}
    </span>
  )
}

/* ── IconButton ───────────────────────────────────────────────────────────── */
export function IconBtn({ name, onClick, title, className, size = 14, danger }) {
  return (
    <button
      className={cx(styles.iconBtn, danger && styles.iconBtnDanger, className)}
      onClick={onClick} title={title}
    >
      <Icon name={name} size={size} />
    </button>
  )
}

/* ── Button ───────────────────────────────────────────────────────────────── */
export function Btn({ children, variant = 'ghost', onClick, className, disabled, size }) {
  return (
    <button
      className={cx(styles.btn, styles[`btn_${variant}`], size && styles[`btn_${size}`], className)}
      onClick={onClick} disabled={disabled}
    >
      {children}
    </button>
  )
}

/* ── Spinner ──────────────────────────────────────────────────────────────── */
export function Spinner({ size = 14 }) {
  return <span className={styles.spinner} style={{ width: size, height: size, borderWidth: size > 20 ? 3 : 2 }} />
}

/* ── KVTable ──────────────────────────────────────────────────────────────── */
import { uid } from '../../utils'

export function KVTable({ rows, onChange, placeholder = ['Key', 'Value'] }) {
  const update = (i, f, v) => onChange(rows.map((r, j) => j === i ? { ...r, [f]: v } : r))
  const del = i => onChange(rows.filter((_, j) => j !== i))
  const add = () => onChange([...rows, { id: uid(), key: '', value: '', enabled: true }])
  return (
    <div className={styles.kvWrap}>
      <div className={styles.kvTable}>
        {rows.map((r, i) => (
          <div key={r.id || i} className={styles.kvRow}>
            <input type="checkbox" className={styles.kvCheck} checked={r.enabled} onChange={e => update(i, 'enabled', e.target.checked)} />
            <input className={styles.kvInput} placeholder={placeholder[0]} value={r.key || ''} onChange={e => update(i, 'key', e.target.value)} />
            <input className={styles.kvInput} placeholder={placeholder[1]} value={r.value || ''} onChange={e => update(i, 'value', e.target.value)} />
            <button className={cx(styles.iconBtn, styles.iconBtnDanger)} onClick={() => del(i)}><Icon name="x" size={11} /></button>
          </div>
        ))}
      </div>
      <button className={styles.addRowBtn} onClick={add}>
        <Icon name="plus" size={11} /> Add Row
      </button>
    </div>
  )
}

/* ── FormGroup ────────────────────────────────────────────────────────────── */
export function FormGroup({ label, children }) {
  return (
    <div className={styles.formGroup}>
      {label && <label className={styles.formLabel}>{label}</label>}
      {children}
    </div>
  )
}

export function Input({ value, onChange, placeholder, type = 'text', className }) {
  return <input type={type} className={cx(styles.formInput, className)} value={value} onChange={onChange} placeholder={placeholder} />
}

export function Select({ value, onChange, children, className, style }) {
  return <select className={cx(styles.formSelect, className)} value={value} onChange={onChange} style={style}>{children}</select>
}

/* ── Empty state ──────────────────────────────────────────────────────────── */
export function Empty({ icon, text, sub }) {
  return (
    <div className={styles.empty}>
      {icon && <span className={styles.emptyIcon}>{icon}</span>}
      {text && <p className={styles.emptyText}>{text}</p>}
      {sub  && <p className={styles.emptySub}>{sub}</p>}
    </div>
  )
}

/* ── Message log ──────────────────────────────────────────────────────────────
   Generic timestamped frame/event list with a connect/disconnect indicator —
   shared by the WebSocket, SSE, Socket.io and gRPC-stream tabs.
   frames: [{ id, direction: 'out'|'in'|'system', timestamp, data }]          */
/* ── Collapsible JSON tree ────────────────────────────────────────────────────
   Used by the response Body tab and by the GraphQL schema panel.             */
export function JsonTree({ value }) {
  return <div className={styles.jsonTree}><JsonNode label={null} value={value} depth={0} /></div>
}

function JsonNode({ label, isIndex, value, depth }) {
  const [open, setOpen] = useState(depth < 2)
  const isObj = value !== null && typeof value === 'object'

  const labelSpan = label !== null && (
    <>
      <span className={isIndex ? styles.jsonIndex : 'tok-key'}>{isIndex ? label : `"${label}"`}</span>
      <span className={styles.jsonColon}>: </span>
    </>
  )

  if (!isObj) {
    return (
      <div className={styles.jsonLine} style={{ paddingLeft: depth * 14 }}>
        {labelSpan}
        <JsonValue value={value} />
      </div>
    )
  }

  const isArray = Array.isArray(value)
  const entries = isArray ? value.map((v, i) => [i, v]) : Object.entries(value)
  const [open_, close_] = isArray ? ['[', ']'] : ['{', '}']

  return (
    <div>
      <div className={styles.jsonLine} style={{ paddingLeft: depth * 14, cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <Icon name="chevRight" size={9} className={cx(styles.jsonArrow, open && styles.jsonArrowOpen)} />
        {labelSpan}
        <span className={styles.jsonBracket}>{open_}</span>
        {!open && <span className={styles.jsonCollapsedHint}>{entries.length} {isArray ? 'items' : 'keys'}</span>}
        {!open && <span className={styles.jsonBracket}>{close_}</span>}
      </div>
      {open && (
        <>
          {entries.map(([k, v]) => (
            <JsonNode key={k} label={k} isIndex={isArray} value={v} depth={depth + 1} />
          ))}
          <div className={styles.jsonLine} style={{ paddingLeft: depth * 14 }}>
            <span className={styles.jsonBracket}>{close_}</span>
          </div>
        </>
      )}
    </div>
  )
}

function JsonValue({ value }) {
  if (value === null) return <span className="tok-null">null</span>
  if (typeof value === 'boolean') return <span className="tok-bool">{String(value)}</span>
  if (typeof value === 'number') return <span className="tok-num">{value}</span>
  return <span className="tok-str">"{String(value)}"</span>
}

export function MessageLogView({ frames = [], connected, onClear, emptyText = 'No messages yet' }) {
  return (
    <div className={styles.msgLog}>
      <div className={styles.msgLogHeader}>
        <span className={cx(styles.msgLogDot, connected ? styles.msgLogConnected : styles.msgLogDisconnected)} />
        <span className={styles.msgLogStatus}>{connected ? 'Connected' : 'Disconnected'}</span>
        <span style={{ flex: 1 }} />
        {onClear && <IconBtn name="trash" size={11} title="Clear log" onClick={onClear} />}
      </div>
      <div className={styles.msgLogList}>
        {frames.length === 0
          ? <Empty text={emptyText} />
          : frames.map(f => (
            <div key={f.id} className={cx(styles.msgLogRow, styles[`msgLog_${f.direction}`])}>
              <span className={styles.msgLogArrow}>{f.direction === 'out' ? '→' : f.direction === 'in' ? '←' : '·'}</span>
              <span className={styles.msgLogTime}>{new Date(f.timestamp).toLocaleTimeString()}</span>
              <pre className={styles.msgLogData}>{typeof f.data === 'string' ? f.data : JSON.stringify(f.data)}</pre>
            </div>
          ))
        }
      </div>
    </div>
  )
}
