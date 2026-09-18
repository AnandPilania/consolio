import {
	Ban,
	BarChart3,
	Check,
	ChevronDown,
	ChevronRight,
	Code2,
	Copy,
	Eye,
	EyeOff,
	Filter,
	Folder,
	Globe,
	GripVertical,
	History,
	Loader2,
	PanelLeft,
	Pencil,
	Play,
	Plus,
	RefreshCw,
	Save,
	Search,
	Send,
	Settings,
	Shield,
	Sparkles,
	Terminal,
	Trash2,
	Upload,
	X,
	Zap,
} from "lucide-react"
import { useState } from "react"
import { MethodBadge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input as ShInput } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { uid } from "../../utils"

/* ── Icon ─────────────────────────────────────────────────────────────────── */
const ICONS = {
	plus: Plus,
	trash: Trash2,
	send: Send,
	folder: Folder,
	chevRight: ChevronRight,
	settings: Settings,
	history: History,
	zap: Zap,
	copy: Copy,
	x: X,
	check: Check,
	eye: Eye,
	eyeOff: EyeOff,
	save: Save,
	play: Play,
	code: Code2,
	terminal: Terminal,
	search: Search,
	upload: Upload,
	layout: PanelLeft,
	filter: Filter,
	globe: Globe,
	drag: GripVertical,
	chevDown: ChevronDown,
	refresh: RefreshCw,
	ban: Ban,
	shield: Shield,
	barChart: BarChart3,
	sparkle: Sparkles,
	edit: Pencil,
}

export function Icon({ name, size = 14, className, style }) {
	const Cmp = ICONS[name]
	if (!Cmp) return null
	return (
		<Cmp size={size} strokeWidth={1.8} className={className} style={style} />
	)
}

/* ── Method badge ─────────────────────────────────────────────────────────── */
export { MethodBadge }

/* ── IconButton ───────────────────────────────────────────────────────────── */
export function IconBtn({
	name,
	onClick,
	title,
	className,
	size = 14,
	danger,
}) {
	return (
		<Button
			type="button"
			variant="ghost"
			size="icon"
			onClick={onClick}
			title={title}
			className={cn(danger && "hover:text-destructive", className)}
		>
			<Icon name={name} size={size} />
		</Button>
	)
}

/* ── Button ───────────────────────────────────────────────────────────────── */
const VARIANT_MAP = {
	primary: "default",
	ghost: "outline",
	danger: "destructive",
}

export function Btn({
	children,
	variant = "ghost",
	onClick,
	className,
	disabled,
	size,
}) {
	return (
		<Button
			type="button"
			variant={VARIANT_MAP[variant] || "outline"}
			size={size === "sm" ? "sm" : "default"}
			onClick={onClick}
			disabled={disabled}
			className={className}
		>
			{children}
		</Button>
	)
}

/* ── Spinner ──────────────────────────────────────────────────────────────── */
export function Spinner({ size = 14 }) {
	return <Loader2 size={size} className="shrink-0 animate-spin text-primary" />
}

/* ── KVTable ──────────────────────────────────────────────────────────────── */
export function KVTable({ rows, onChange, placeholder = ["Key", "Value"] }) {
	const update = (i, f, v) =>
		onChange(rows.map((r, j) => (j === i ? { ...r, [f]: v } : r)))
	const del = (i) => onChange(rows.filter((_, j) => j !== i))
	const add = () =>
		onChange([...rows, { id: uid(), key: "", value: "", enabled: true }])
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex-1 overflow-y-auto">
				{rows.map((r, i) => (
					<div
						key={r.id || i}
						className="flex items-center gap-1 border-b border-[var(--bd-faint)] px-2 py-0.5 hover:bg-[var(--bg-raised)]"
					>
						<Checkbox
							checked={r.enabled}
							onCheckedChange={(v) => update(i, "enabled", !!v)}
						/>
						<input
							className="flex-1 rounded-sm border border-transparent bg-transparent px-1.5 py-1 font-mono text-[11.5px] text-foreground outline-none transition-colors placeholder:text-[var(--tx-faint)] focus:border-[var(--bd-base)] focus:bg-[var(--bg-overlay)]"
							placeholder={placeholder[0]}
							value={r.key || ""}
							onChange={(e) => update(i, "key", e.target.value)}
						/>
						<input
							className="flex-1 rounded-sm border border-transparent bg-transparent px-1.5 py-1 font-mono text-[11.5px] text-foreground outline-none transition-colors placeholder:text-[var(--tx-faint)] focus:border-[var(--bd-base)] focus:bg-[var(--bg-overlay)]"
							placeholder={placeholder[1]}
							value={r.value || ""}
							onChange={(e) => update(i, "value", e.target.value)}
						/>
						<IconBtn name="x" size={11} danger onClick={() => del(i)} />
					</div>
				))}
			</div>
			<button
				type="button"
				onClick={add}
				className="m-1.5 flex items-center gap-1 rounded-sm border border-dashed border-[var(--bd-subtle)] px-2.5 py-1 text-[11px] text-[var(--tx-faint)] transition-colors hover:border-primary hover:text-primary"
			>
				<Plus size={11} /> Add Row
			</button>
		</div>
	)
}

/* ── FormGroup ────────────────────────────────────────────────────────────── */
export function FormGroup({ label, children }) {
	return (
		<div className="flex flex-col gap-1.5">
			{label && <Label>{label}</Label>}
			{children}
		</div>
	)
}

export function Input({
	value,
	onChange,
	placeholder,
	type = "text",
	className,
}) {
	return (
		<ShInput
			type={type}
			className={className}
			value={value}
			onChange={onChange}
			placeholder={placeholder}
		/>
	)
}

export function Select({ value, onChange, children, className, style }) {
	return (
		<select
			className={cn(
				"w-full cursor-pointer appearance-none rounded-md border border-[var(--bd-subtle)] bg-[var(--bg-raised)] px-2.5 py-1.5 font-mono text-[12px] text-foreground transition-colors focus:border-primary",
				className,
			)}
			value={value}
			onChange={onChange}
			style={style}
		>
			{children}
		</select>
	)
}

/* ── Empty state ──────────────────────────────────────────────────────────── */
export function Empty({ icon, text, sub }) {
	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-[var(--tx-faint)]">
			{icon && <span className="text-[28px] opacity-30">{icon}</span>}
			{text && <p className="text-[13px] text-muted-foreground">{text}</p>}
			{sub && <p className="text-[11px] text-[var(--tx-faint)]">{sub}</p>}
		</div>
	)
}

/* ── Collapsible JSON tree ────────────────────────────────────────────────────
   Used by the response Body tab and by the GraphQL schema panel.             */
export function JsonTree({ value }) {
	return (
		<div className="px-3.5 pt-2 pb-3.5 font-mono text-[12px] leading-[1.7]">
			<JsonNode label={null} value={value} depth={0} />
		</div>
	)
}

function JsonNode({ label, isIndex, value, depth }) {
	const [open, setOpen] = useState(depth < 2)
	const isObj = value !== null && typeof value === "object"

	const labelSpan = label !== null && (
		<>
			<span className={isIndex ? "text-[var(--tx-faint)]" : "tok-key"}>
				{isIndex ? label : `"${label}"`}
			</span>
			<span className="text-[var(--tx-faint)]">: </span>
		</>
	)

	if (!isObj) {
		return (
			<div className="whitespace-pre" style={{ paddingLeft: depth * 14 }}>
				{labelSpan}
				<JsonValue value={value} />
			</div>
		)
	}

	const isArray = Array.isArray(value)
	const entries = isArray ? value.map((v, i) => [i, v]) : Object.entries(value)
	const [open_, close_] = isArray ? ["[", "]"] : ["{", "}"]

	return (
		<div>
			<button
				type="button"
				className="flex cursor-pointer items-center whitespace-pre"
				style={{ paddingLeft: depth * 14 }}
				onClick={() => setOpen((o) => !o)}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault()
						setOpen((o) => !o)
					}
				}}
			>
				<ChevronRight
					size={9}
					className={cn(
						"mr-0.5 inline-block shrink-0 text-[var(--tx-faint)] transition-transform",
						open && "rotate-90",
					)}
				/>
				{labelSpan}
				<span className="text-[var(--tx-faint)]">{open_}</span>
				{!open && (
					<span className="mx-1 italic text-[var(--tx-faint)]">
						{entries.length} {isArray ? "items" : "keys"}
					</span>
				)}
				{!open && <span className="text-[var(--tx-faint)]">{close_}</span>}
			</button>
			{open && (
				<>
					{entries.map(([k, v]) => (
						<JsonNode
							key={k}
							label={k}
							isIndex={isArray}
							value={v}
							depth={depth + 1}
						/>
					))}
					<div className="whitespace-pre" style={{ paddingLeft: depth * 14 }}>
						<span className="text-[var(--tx-faint)]">{close_}</span>
					</div>
				</>
			)}
		</div>
	)
}

function JsonValue({ value }) {
	if (value === null) return <span className="tok-null">null</span>
	if (typeof value === "boolean")
		return <span className="tok-bool">{String(value)}</span>
	if (typeof value === "number") return <span className="tok-num">{value}</span>
	return <span className="tok-str">"{String(value)}"</span>
}

export function MessageLogView({
	frames = [],
	connected,
	onClear,
	emptyText = "No messages yet",
}) {
	return (
		<div className="flex h-full flex-col">
			<div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--bd-faint)] px-2.5 py-1.5">
				<span
					className={cn(
						"h-1.5 w-1.5 shrink-0 rounded-full",
						connected
							? "bg-[var(--ok)] shadow-[0_0_0_3px_var(--ok-dim)]"
							: "bg-[var(--tx-faint)]",
					)}
				/>
				<span className="text-[11px] font-semibold text-muted-foreground">
					{connected ? "Connected" : "Disconnected"}
				</span>
				<span className="flex-1" />
				{onClear && (
					<IconBtn name="trash" size={11} title="Clear log" onClick={onClear} />
				)}
			</div>
			<div className="flex flex-1 flex-col overflow-y-auto">
				{frames.length === 0 ? (
					<Empty text={emptyText} />
				) : (
					frames.map((f) => (
						<div
							key={f.id}
							className="flex items-start gap-2 border-b border-[var(--bd-faint)] px-2.5 py-1 font-mono text-[11.5px]"
						>
							<span
								className={cn(
									"w-3 shrink-0",
									f.direction === "out"
										? "text-primary"
										: f.direction === "in"
											? "text-[var(--ok)]"
											: "text-[var(--tx-faint)]",
								)}
							>
								{f.direction === "out" ? "→" : f.direction === "in" ? "←" : "·"}
							</span>
							<span className="shrink-0 pt-px text-[10.5px] text-[var(--tx-faint)]">
								{new Date(f.timestamp).toLocaleTimeString()}
							</span>
							<pre className="flex-1 whitespace-pre-wrap break-all text-foreground">
								{typeof f.data === "string" ? f.data : JSON.stringify(f.data)}
							</pre>
						</div>
					))
				)}
			</div>
		</div>
	)
}
