import { useEffect } from "react"
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels"
import { Toaster } from "@/components/ui/sonner"
import { Topbar } from "./components/layout/Topbar"
import { CustomiseModal } from "./components/modals/CustomiseModal"
import {
	CodeGenModal,
	DashboardModal,
	ImportModal,
	MockManagerModal,
	NewCollectionModal,
	PluginManagerModal,
	ProfilesModal,
	RunnerModal,
	SettingsModal,
} from "./components/modals/Modals"
import { RequestPane } from "./components/request/RequestPane"
import { ResponsePane } from "./components/response/ResponsePane"
import { Notification } from "./components/shared/Notification"
import { Sidebar } from "./components/sidebar/Sidebar"
import { useStore } from "./store"

export default function App() {
	const boot = useStore((s) => s.boot)
	const panels = useStore((s) => s.panels)
	const showCustomise = useStore((s) => s.showCustomise)
	const modal = useStore((s) => s.modal)
	const addIntercepted = useStore((s) => s.addIntercepted)

	/* ── Bootstrap ─────────────────────────────────────────────────────────── */
	useEffect(() => {
		boot()

		let ws
		let retryTimer

		function connect() {
			const proto = location.protocol === "https:" ? "wss:" : "ws:"
			ws = new WebSocket(`${proto}//${location.host}/ws?type=ui`)

			ws.onmessage = (e) => {
				try {
					const msg = JSON.parse(e.data)
					if (msg.type === "intercepted") addIntercepted(msg.data)
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
	}, [boot, addIntercepted])

	const sidebarPanel = panels.sidebar
	const requestPanel = panels.requestPane
	const responsePanel = panels.responsePane

	return (
		<div className="flex h-screen flex-col overflow-hidden bg-background">
			<Topbar />

			<div className="flex min-h-0 flex-1 overflow-hidden">
				<PanelGroup direction="horizontal" className="h-full w-full">
					{sidebarPanel.visible ? (
						<Panel
							id="sidebar"
							defaultSize={Number(toPct(sidebarPanel.size))}
							minSize={Number(toPct(sidebarPanel.minSize))}
							maxSize={Number(toPct(sidebarPanel.maxSize))}
							onResize={(pct) =>
								useStore.getState().updatePanelSize("sidebar", fromPct(pct))
							}
							className="overflow-hidden"
						>
							<Sidebar />
						</Panel>
					) : null}

					{sidebarPanel.visible ? (
						<PanelResizeHandle
							id="h-handle"
							className="group relative w-1 shrink-0 cursor-col-resize bg-[var(--bd-faint)] transition-colors hover:bg-[var(--accent-glow)] data-[resize-handle-active]:bg-[var(--accent-glow)]"
						>
							<span className="absolute top-1/2 left-1/2 h-8 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary opacity-0 transition-opacity group-hover:opacity-100 group-data-[resize-handle-active]:opacity-100" />
						</PanelResizeHandle>
					) : null}

					<Panel id="main" className="min-w-0 overflow-hidden">
						<PanelGroup direction="vertical" className="h-full w-full">
							{requestPanel.visible ? (
								<Panel
									id="request"
									defaultSize={Number(requestPanel.size)}
									minSize={Number(requestPanel.minSize)}
									maxSize={Number(requestPanel.maxSize)}
									onResize={(pct) =>
										useStore.getState().updatePanelSize("requestPane", pct)
									}
									className="overflow-hidden"
								>
									<RequestPane />
								</Panel>
							) : null}

							{requestPanel.visible && responsePanel.visible ? (
								<PanelResizeHandle
									id="v-handle"
									className="group relative h-1 shrink-0 cursor-row-resize bg-[var(--bd-faint)] transition-colors hover:bg-[var(--accent-glow)] data-[resize-handle-active]:bg-[var(--accent-glow)]"
								>
									<span className="absolute top-1/2 left-1/2 h-0.5 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary opacity-0 transition-opacity group-hover:opacity-100 group-data-[resize-handle-active]:opacity-100" />
								</PanelResizeHandle>
							) : null}

							{responsePanel.visible ? (
								<Panel
									id="response"
									defaultSize={Number(requestPanel.size)}
									minSize={Number(requestPanel.minSize)}
									maxSize={Number(requestPanel.maxSize)}
									onResize={(pct) =>
										useStore.getState().updatePanelSize("responsePane", pct)
									}
									className="overflow-hidden"
								>
									<ResponsePane />
								</Panel>
							) : null}

							{!requestPanel.visible && !responsePanel.visible && (
								<div className="flex flex-1 items-center justify-center p-6 text-center text-[13px] text-[var(--tx-faint)]">
									<p>
										All panels hidden — open <strong>Customise Layout</strong>{" "}
										to restore them.
									</p>
								</div>
							)}
						</PanelGroup>
					</Panel>
				</PanelGroup>
			</div>

			{showCustomise && <CustomiseModal />}
			{modal === "newCollection" && <NewCollectionModal />}
			{modal === "import" && <ImportModal />}
			{modal === "runner" && <RunnerModal />}
			{modal === "settings" && <SettingsModal />}
			{modal === "codegen" && <CodeGenModal />}
			{modal === "mocks" && <MockManagerModal />}
			{modal === "plugins" && <PluginManagerModal />}
			{modal === "dashboard" && <DashboardModal />}
			{modal === "profiles" && <ProfilesModal />}

			<Notification />
			<Toaster />
		</div>
	)
}

const REF_WIDTH = 1280
const toPct = (px) => Math.round((px / REF_WIDTH) * 100 * 10) / 10
const fromPct = (pct) => Math.round((pct / 100) * REF_WIDTH)
