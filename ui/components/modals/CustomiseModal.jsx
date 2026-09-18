import {
	closestCenter,
	DndContext,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core"
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Eye, EyeOff, GripVertical } from "lucide-react"
import { useState } from "react"
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { useStore } from "../../store"
import { Btn, Icon } from "../shared"

const PANEL_INFO = {
	sidebar: {
		label: "Sidebar",
		icon: "layout",
		desc: "Collections, history & interceptor",
	},
	requestPane: {
		label: "Request Panel",
		icon: "send",
		desc: "URL bar, params, headers, body, auth, scripts",
	},
	responsePane: {
		label: "Response Panel",
		icon: "globe",
		desc: "Response body, headers, test results",
	},
}

export function CustomiseModal() {
	const panels = useStore((s) => s.panels)
	const togglePanel = useStore((s) => s.togglePanel)
	const resetPanels = useStore((s) => s.resetPanels)
	const updatePanelSize = useStore((s) => s.updatePanelSize)
	const close = () => useStore.setState({ showCustomise: false })

	const ordered = Object.entries(panels)
		.sort(([, a], [, b]) => a.order - b.order)
		.map(([key]) => key)

	const [items, setItems] = useState(ordered)

	const sensors = useSensors(
		useSensor(PointerSensor),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	)

	const handleDragEnd = ({ active, over }) => {
		if (!over || active.id === over.id) return
		const oldIdx = items.indexOf(active.id)
		const newIdx = items.indexOf(over.id)
		const next = arrayMove(items, oldIdx, newIdx)
		setItems(next)
		const newPanels = { ...panels }
		next.forEach((key, i) => {
			newPanels[key] = { ...newPanels[key], order: i }
		})
		useStore.setState({ panels: newPanels })
	}

	return (
		<Dialog open onOpenChange={(o) => !o && close()}>
			<DialogContent size="default" className="gap-0">
				<DialogHeader>
					<div className="flex items-center gap-2">
						<Icon name="layout" size={15} className="text-primary" />
						<DialogTitle>Customise Layout</DialogTitle>
					</div>
				</DialogHeader>

				<div className="flex flex-col gap-2.5 overflow-y-auto p-4">
					<p className="m-0 text-[11.5px] text-[var(--tx-faint)]">
						Drag panels to reorder • toggle visibility • resize in-app by
						dragging the dividers
					</p>

					<DndContext
						sensors={sensors}
						collisionDetection={closestCenter}
						onDragEnd={handleDragEnd}
					>
						<SortableContext
							items={items}
							strategy={verticalListSortingStrategy}
						>
							{items.map((key) => (
								<SortablePanel
									key={key}
									id={key}
									info={PANEL_INFO[key]}
									panel={panels[key]}
									onToggle={() => togglePanel(key)}
									onSizeChange={(v) => updatePanelSize(key, parseInt(v, 10))}
								/>
							))}
						</SortableContext>
					</DndContext>

					<div className="my-1.5 h-px bg-[var(--bd-faint)]" />

					<div className="flex flex-col gap-2">
						<p className="m-0 text-[10.5px] font-semibold tracking-wide text-[var(--tx-faint)] uppercase">
							Quick presets
						</p>
						<div className="flex flex-wrap gap-1.5">
							{[
								{ label: "Default", action: resetPanels },
								{
									label: "Focus: Request",
									action: () => {
										useStore.setState((s) => ({
											panels: {
												...s.panels,
												responsePane: {
													...s.panels.responsePane,
													size: 20,
												},
												requestPane: {
													...s.panels.requestPane,
													size: 80,
												},
											},
										}))
									},
								},
								{
									label: "Focus: Response",
									action: () => {
										useStore.setState((s) => ({
											panels: {
												...s.panels,
												requestPane: {
													...s.panels.requestPane,
													size: 20,
												},
												responsePane: {
													...s.panels.responsePane,
													size: 80,
												},
											},
										}))
									},
								},
								{
									label: "No sidebar",
									action: () => togglePanel("sidebar"),
								},
							].map((p) => (
								<Btn key={p.label} variant="ghost" size="sm" onClick={p.action}>
									{p.label}
								</Btn>
							))}
						</div>
					</div>
				</div>

				<DialogFooter>
					<Btn variant="ghost" onClick={resetPanels}>
						Reset to defaults
					</Btn>
					<Btn variant="primary" onClick={close}>
						Done
					</Btn>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

function SortablePanel({ id, info, panel, onToggle, onSizeChange }) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id })
	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
	}
	const isSplit = id === "requestPane" || id === "responsePane"

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={cn(
				"flex items-center gap-2.5 rounded-md border border-[var(--bd-subtle)] bg-[var(--bg-raised)] p-2.5",
				!panel.visible && "opacity-50",
			)}
		>
			<button
				className="flex shrink-0 cursor-grab items-center text-[var(--tx-faint)] active:cursor-grabbing"
				{...attributes}
				{...listeners}
			>
				<GripVertical size={14} />
			</button>

			<div className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-[var(--accent-dim)]">
				<Icon name={info.icon} size={14} className="text-primary" />
			</div>

			<div className="flex min-w-0 flex-1 flex-col">
				<span className="text-[12px] font-semibold text-foreground">
					{info.label}
				</span>
				<span className="overflow-hidden text-ellipsis whitespace-nowrap text-[10.5px] text-[var(--tx-faint)]">
					{info.desc}
				</span>
			</div>

			<div className="flex shrink-0 items-center gap-3">
				<div className="flex items-center gap-1.5">
					<span className="text-[10px] text-[var(--tx-faint)]">
						{isSplit ? "Split %" : "Width"}
					</span>
					<input
						type="range"
						className="w-[90px] accent-[var(--accent)]"
						min={panel.minSize}
						max={panel.maxSize}
						value={panel.size}
						onChange={(e) => onSizeChange(e.target.value)}
					/>
					<span className="w-9 shrink-0 text-right font-mono text-[10px] text-[var(--tx-faint)]">
						{panel.size}
						{isSplit ? "%" : "px"}
					</span>
				</div>
				<button
					type="button"
					className={cn(
						"flex size-6 items-center justify-center rounded-sm transition-colors",
						panel.visible ? "text-primary" : "text-[var(--tx-faint)]",
					)}
					onClick={onToggle}
					title={panel.visible ? "Hide panel" : "Show panel"}
				>
					{panel.visible ? <Eye size={13} /> : <EyeOff size={13} />}
				</button>
			</div>
		</div>
	)
}
