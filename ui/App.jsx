import { useEffect } from 'react'
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels'
import { useStore } from './store'
import { Topbar }         from './components/layout/Topbar'
import { Sidebar }        from './components/sidebar/Sidebar'
import { RequestPane }    from './components/request/RequestPane'
import { ResponsePane }   from './components/response/ResponsePane'
import { CustomiseModal } from './components/modals/CustomiseModal'
import { NewCollectionModal, ImportModal, RunnerModal, SettingsModal, CodeGenModal, MockManagerModal, PluginManagerModal } from './components/modals/Modals'
import { Notification }   from './components/shared/Notification'
import styles from './App.module.css'

export default function App() {
  const boot           = useStore(s => s.boot)
  const panels         = useStore(s => s.panels)
  const showCustomise  = useStore(s => s.showCustomise)
  const modal          = useStore(s => s.modal)
  const addIntercepted = useStore(s => s.addIntercepted)

  /* ── Bootstrap ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    boot()

    let ws
    let retryTimer

    function connect() {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
      ws = new WebSocket(`${proto}//${location.host}/ws?type=ui`)

      ws.onmessage = e => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'intercepted') addIntercepted(msg.data)
        } catch {}
      }

      ws.onclose = () => {
        retryTimer = setTimeout(connect, 3000)
      }
    }

    connect()
    return () => {
      clearTimeout(retryTimer)
      ws?.close()
    }
  }, [boot])

  const sidebarPanel  = panels.sidebar
  const requestPanel  = panels.requestPane
  const responsePanel = panels.responsePane

  return (
    <div className={styles.app}>
      <Topbar />

      <div className={styles.workspace}>
        {/* ── Horizontal split: Sidebar | Main ──────────────────────────── */}
        <PanelGroup direction="horizontal" className={styles.hGroup}>

          {sidebarPanel.visible
            ? <Panel
                id="sidebar"
                defaultSize={Number(toPct(sidebarPanel.size))}
                minSize={Number(toPct(sidebarPanel.minSize))}
                maxSize={Number(toPct(sidebarPanel.maxSize))}
                onResize={pct => useStore.getState().updatePanelSize('sidebar', fromPct(pct))}
                style={{ overflow: 'hidden' }}
              >
                <Sidebar />
              </Panel>
            : null
          }

          {sidebarPanel.visible
            ? <PanelResizeHandle id="h-handle" className={styles.hHandle} />
            : null
          }

          {/* ── Vertical split: Request / Response ──────────────────────── */}
          <Panel id="main" style={{ overflow: 'hidden', minWidth: 0 }}>
            <PanelGroup direction="vertical" className={styles.vGroup}>

              {requestPanel.visible
                ? <Panel
                    id="request"
                    defaultSize={Number(requestPanel.size)}
                    minSize={Number(requestPanel.minSize)}
                    maxSize={Number(requestPanel.maxSize)}
                    onResize={pct => useStore.getState().updatePanelSize('requestPane', pct)}
                    style={{ overflow: 'hidden' }}
                  >
                    <RequestPane />
                  </Panel>
                : null
              }

              {requestPanel.visible && responsePanel.visible
                ? <PanelResizeHandle id="v-handle" className={styles.vHandle} />
                : null
              }

              {responsePanel.visible
                ? <Panel
                    id="response"
                    defaultSize={Number(requestPanel.size)}
                    minSize={Number(requestPanel.minSize)}
                    maxSize={Number(requestPanel.maxSize)}
                    onResize={pct => useStore.getState().updatePanelSize('responsePane', pct)}
                    style={{ overflow: 'hidden' }}
                  >
                    <ResponsePane />
                  </Panel>
                : null
              }

              {!requestPanel.visible && !responsePanel.visible && (
                <div className={styles.allHidden}>
                  <p>All panels hidden — open <strong>Customise Layout</strong> to restore them.</p>
                </div>
              )}

            </PanelGroup>
          </Panel>

        </PanelGroup>
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {showCustomise             && <CustomiseModal />}
      {modal === 'newCollection' && <NewCollectionModal />}
      {modal === 'import'        && <ImportModal />}
      {modal === 'runner'        && <RunnerModal />}
      {modal === 'settings'      && <SettingsModal />}
      {modal === 'codegen'       && <CodeGenModal />}
      {modal === 'mocks'         && <MockManagerModal />}
      {modal === 'plugins'       && <PluginManagerModal />}

      <Notification />
    </div>
  )
}

const REF_WIDTH = 1280
const toPct    = px  => Math.round((px  / REF_WIDTH) * 100 * 10) / 10
const fromPct  = pct => Math.round((pct / 100) * REF_WIDTH)
