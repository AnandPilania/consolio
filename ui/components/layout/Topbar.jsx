import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { useStore } from "../../store"
import { IconBtn } from "../shared"

export function Topbar() {
	const config = useStore((s) => s.config)
	const env = useStore((s) => s.getActiveEnv())
	const environments = useStore((s) => s.environments)
	const activeEnvId = useStore((s) => s.activeEnvId)
	const showNotif = useStore((s) => s.showNotif)

	const switchEnv = (id) => {
		useStore.setState({ activeEnvId: id })
		const name = environments.find((e) => e.id === id)?.name
		if (name) showNotif(`Switched to ${name}`, "success")
	}

	return (
		<header className="z-20 flex h-[var(--topbar-h)] shrink-0 items-center gap-2 border-b border-[var(--bd-faint)] bg-[var(--bg-surface)] px-3">
			<div className="relative flex items-center pr-2">
				<img
					src="/logo.png"
					alt="consolio"
					className="h-12 w-auto object-contain select-none"
				/>

				<span
					className="pointer-events-none absolute bottom-0 right-2 text-[8px] font-mono font-medium tracking-wider text-[var(--tx-faint)] leading-none"
					style={{ transform: "translateX(-95%) translateY(-40%)" }}
				>
					v1.0.0
				</span>
			</div>

			<div className="rounded-full border border-[var(--bd-faint)] bg-[var(--bg-raised)] px-2 py-0.5 text-[11px] text-[var(--tx-faint)]">
				{config.isProjectMode ? "📁" : "🌐"} {config.name}
			</div>

			<div className="flex-1" />

			<div className="flex items-center gap-1 rounded-md border border-[var(--bd-subtle)] bg-[var(--bg-raised)] pl-2 transition-colors hover:border-[var(--bd-base)]">
				<span
					className="h-1.5 w-1.5 shrink-0 rounded-full"
					style={{ background: env?.color || "var(--accent)" }}
				/>
				<Select value={activeEnvId || ""} onValueChange={switchEnv}>
					<SelectTrigger
						size="sm"
						className="h-6 gap-1 border-none bg-transparent px-1.5 text-muted-foreground shadow-none focus-visible:ring-0"
					>
						<SelectValue placeholder="No environments" />
					</SelectTrigger>
					<SelectContent>
						{environments.map((e) => (
							<SelectItem key={e.id} value={e.id}>
								{e.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<IconBtn
				name="globe"
				title="Mock servers"
				onClick={() => useStore.setState({ modal: "mocks" })}
			/>
			<IconBtn
				name="barChart"
				title="Dashboard"
				onClick={() => useStore.setState({ modal: "dashboard", modalData: {} })}
			/>
			<IconBtn
				name="code"
				title="Plugins"
				onClick={() => useStore.setState({ modal: "plugins" })}
			/>
			<IconBtn
				name="layout"
				title="Customise layout"
				onClick={() => useStore.setState({ showCustomise: true })}
			/>
			<IconBtn
				name="settings"
				title="Settings"
				onClick={() => useStore.setState({ modal: "settings", modalData: {} })}
			/>
		</header>
	)
}
