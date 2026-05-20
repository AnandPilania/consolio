import { useStore } from '../../store'
import { Icon } from '../shared'
import styles from './Notification.module.css'

export function Notification() {
  const notif = useStore(s => s.notif)
  if (!notif) return null
  return (
    <div key={notif.id} className={`${styles.notif} ${styles[notif.type]}`}>
      <Icon name={notif.type === 'success' ? 'check' : 'x'} size={13} />
      {notif.msg}
    </div>
  )
}
