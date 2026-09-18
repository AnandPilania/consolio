import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { apiFetch, useStore } from "../../store"

export function PluginTabButton({ tab, active, onClick }) {
	return (
		<button
			type="button"
			className={cn(
				"mb-[-1px] flex items-center gap-1 border-b-2 border-transparent px-2.5 py-2 text-[12px] text-[var(--tx-faint)] transition-colors hover:text-muted-foreground",
				active && "border-b-primary text-foreground",
			)}
			onClick={onClick}
		>
			{tab.label}
		</button>
	)
}

export function PluginTabContent({ pane, tab, context }) {
	const [view, setView] = useState(null)
	const [error, setError] = useState("")
	const showNotif = useStore((s) => s.showNotif)
	const _contextKey = JSON.stringify(context)
	const pluginInfo = tab.pluginInfo || {
		name: tab.plugin,
		description: "Plugin-provided tab.",
	}

	const openPluginInfo = () =>
		useStore.setState({
			modal: "plugins",
			modalData: { pluginName: tab.plugin },
		})

	useEffect(() => {
		let cancelled = false
		setView(null)
		setError("")
		apiFetch("/api/plugins/ui/render", {
			method: "POST",
			body: { pane, plugin: tab.plugin, id: tab.id, context },
		})
			.then((result) => {
				if (!cancelled) setView(result)
			})
			.catch((e) => {
				if (!cancelled) {
					setError(e.message)
					showNotif(`Plugin tab: ${e.message}`, "error")
				}
			})
		return () => {
			cancelled = true
		}
	}, [pane, tab.plugin, tab.id, showNotif, context])

	const note = (
		<div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--bd-faint)] bg-[var(--bg-surface)] px-3.5 py-1.5 text-[10.5px] text-[var(--tx-faint)]">
			<span>Provided by {pluginInfo.name || tab.plugin}</span>
			{pluginInfo.updateAvailable && (
				<span className="text-[var(--warn)]">
					Update available: v{pluginInfo.latestVersion}
				</span>
			)}
			<button
				type="button"
				className="text-primary underline underline-offset-2 hover:text-foreground"
				onClick={openPluginInfo}
			>
				View in Plugins
			</button>
		</div>
	)

	if (error)
		return (
			<>
				{note}
				<div className="p-4 text-[12px] text-[var(--err)]">{error}</div>
			</>
		)
	if (!view)
		return (
			<>
				{note}
				<div className="p-4 text-[12px] text-[var(--tx-faint)]">
					Loading plugin tab...
				</div>
			</>
		)
	if (view.kind === "table" && Array.isArray(view.rows)) {
		return (
			<>
				{note}
				<div className="divide-y divide-[var(--bd-faint)] text-[12px]">
					{view.rows.map((row, _i) => (
						<div
							key={`${row.label}-${row.value}`}
							className="flex gap-4 px-3.5 py-2"
						>
							<span className="w-[180px] shrink-0 text-[var(--tx-faint)]">
								{row.label}
							</span>
							<span className="break-all font-mono text-foreground">
								{String(row.value ?? "")}
							</span>
						</div>
					))}
				</div>
			</>
		)
	}
	return (
		<>
			{note}
			<pre className="m-0 whitespace-pre-wrap break-words p-3.5 font-mono text-[12px] leading-relaxed text-foreground">
				{String(view.text ?? view)}
			</pre>
		</>
	)
}
