import { useState } from 'react'
import { useStore } from '../../store'
import { Icon, Btn } from '../shared'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import styles from './CustomiseModal.module.css'

const PANEL_INFO = {
  sidebar:      { label: 'Sidebar',        icon: 'layout',  desc: 'Collections, history & interceptor' },
  requestPane:  { label: 'Request Panel',  icon: 'send',    desc: 'URL bar, params, headers, body, auth, scripts' },
  responsePane: { label: 'Response Panel', icon: 'globe',   desc: 'Response body, headers, test results' },
}

export function CustomiseModal() {
  const panels       = useStore(s => s.panels)
  const togglePanel  = useStore(s => s.togglePanel)
  const resetPanels  = useStore(s => s.resetPanels)
  const updatePanelSize = useStore(s => s.updatePanelSize)
  const close = () => useStore.setState({ showCustomise: false })

  // Build ordered list from panel order values
  const ordered = Object.entries(panels)
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([key]) => key)

  const [items, setItems] = useState(ordered)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return
    const oldIdx = items.indexOf(active.id)
    const newIdx = items.indexOf(over.id)
    const next = arrayMove(items, oldIdx, newIdx)
    setItems(next)
    // Persist order into store
    const newPanels = { ...panels }
    next.forEach((key, i) => { newPanels[key] = { ...newPanels[key], order: i } })
    useStore.setState({ panels: newPanels })
  }

  return (
    <div className={styles.overlay} onClick={close}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <Icon name="layout" size={15} style={{ color: 'var(--accent)' }} />
          <span className={styles.title}>Customise Layout</span>
          <button className={styles.closeBtn} onClick={close}>
            <Icon name="x" size={14} />
          </button>
        </div>

        <div className={styles.body}>
          <p className={styles.hint}>Drag panels to reorder • toggle visibility • resize in-app by dragging the dividers</p>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items} strategy={verticalListSortingStrategy}>
              {items.map(key => (
                <SortablePanel
                  key={key}
                  id={key}
                  info={PANEL_INFO[key]}
                  panel={panels[key]}
                  onToggle={() => togglePanel(key)}
                  onSizeChange={v => updatePanelSize(key, parseInt(v))}
                />
              ))}
            </SortableContext>
          </DndContext>

          <div className={styles.divider} />

          <div className={styles.presets}>
            <p className={styles.presetsLabel}>Quick presets</p>
            <div className={styles.presetRow}>
              {[
                { label: 'Default',        action: resetPanels },
                { label: 'Focus: Request', action: () => { useStore.setState(s => ({ panels: { ...s.panels, responsePane: { ...s.panels.responsePane, size: 20 }, requestPane: { ...s.panels.requestPane, size: 80 } } })) } },
                { label: 'Focus: Response',action: () => { useStore.setState(s => ({ panels: { ...s.panels, requestPane: { ...s.panels.requestPane, size: 20 }, responsePane: { ...s.panels.responsePane, size: 80 } } })) } },
                { label: 'No sidebar',     action: () => togglePanel('sidebar') },
              ].map(p => (
                <Btn key={p.label} variant="ghost" size="sm" onClick={p.action}>{p.label}</Btn>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <Btn variant="ghost" onClick={resetPanels}>Reset to defaults</Btn>
          <Btn variant="primary" onClick={close}>Done</Btn>
        </div>
      </div>
    </div>
  )
}

function SortablePanel({ id, info, panel, onToggle, onSizeChange }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  return (
    <div ref={setNodeRef} style={style} className={`${styles.panelRow} ${!panel.visible ? styles.panelHidden : ''}`}>
      <button className={styles.dragHandle} {...attributes} {...listeners}>
        <Icon name="drag" size={14} />
      </button>

      <div className={styles.panelIcon}>
        <Icon name={info.icon} size={14} style={{ color: 'var(--accent)' }} />
      </div>

      <div className={styles.panelInfo}>
        <span className={styles.panelName}>{info.label}</span>
        <span className={styles.panelDesc}>{info.desc}</span>
      </div>

      <div className={styles.panelControls}>
        {id !== 'requestPane' && id !== 'responsePane' && (
          <div className={styles.sizeControl}>
            <span className={styles.sizeLabel}>Width</span>
            <input
              type="range"
              className={styles.sizeSlider}
              min={panel.minSize} max={panel.maxSize}
              value={panel.size}
              onChange={e => onSizeChange(e.target.value)}
            />
            <span className={styles.sizeVal}>{panel.size}px</span>
          </div>
        )}
        {(id === 'requestPane' || id === 'responsePane') && (
          <div className={styles.sizeControl}>
            <span className={styles.sizeLabel}>Split %</span>
            <input
              type="range"
              className={styles.sizeSlider}
              min={panel.minSize} max={panel.maxSize}
              value={panel.size}
              onChange={e => onSizeChange(e.target.value)}
            />
            <span className={styles.sizeVal}>{panel.size}%</span>
          </div>
        )}
        <button
          className={`${styles.toggleBtn} ${panel.visible ? styles.toggleOn : styles.toggleOff}`}
          onClick={onToggle}
          title={panel.visible ? 'Hide panel' : 'Show panel'}
        >
          <Icon name={panel.visible ? 'eye' : 'eyeOff'} size={13} />
        </button>
      </div>
    </div>
  )
}
