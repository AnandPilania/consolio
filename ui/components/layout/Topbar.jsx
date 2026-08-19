import { useStore } from '../../store'
import { Icon, IconBtn } from '../shared'
import styles from './Topbar.module.css'

export function Topbar() {
  const config       = useStore(s => s.config)
  const env          = useStore(s => s.getActiveEnv())
  const environments = useStore(s => s.environments)
  const activeEnvId  = useStore(s => s.activeEnvId)
  const showNotif    = useStore(s => s.showNotif)

  const switchEnv = (id) => {
    useStore.setState({ activeEnvId: id })
    const name = environments.find(e => e.id === id)?.name
    if (name) showNotif(`Switched to ${name}`, 'success')
  }

  return (
    <header className={styles.topbar}>
      <div className={styles.logo}>
        <Icon name="zap" size={16} style={{ color: 'var(--accent)' }} />
        <span>consolio</span>
      </div>

      <div className={styles.projectBadge}>
        {config.isProjectMode ? '📁' : '🌐'} {config.name}
      </div>

      <div className={styles.spacer} />

      <div className={styles.envPicker}>
        <span className={styles.envDot} style={{ background: env?.color || 'var(--accent)' }} />
        <select
          className={styles.envSelect}
          value={activeEnvId || ''}
          onChange={e => switchEnv(e.target.value)}
        >
          {environments.length === 0 && <option value="">No environments</option>}
          {environments.map(e => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
        <Icon name="chevDown" size={11} style={{ color: 'var(--tx-faint)', pointerEvents: 'none' }} />
      </div>

      <IconBtn name="globe"    title="Mock servers"     onClick={() => useStore.setState({ modal: 'mocks' })} />
      <IconBtn name="code"     title="Plugins"          onClick={() => useStore.setState({ modal: 'plugins' })} />
      <IconBtn name="layout"   title="Customise layout" onClick={() => useStore.setState({ showCustomise: true })} />
      <IconBtn name="settings" title="Settings"         onClick={() => useStore.setState({ modal: 'settings', modalData: {} })} />
    </header>
  )
}
