import {
	Code2,
	Plus,
	Save,
	Send,
	Sparkles,
	Terminal,
	Upload,
	X,
	Zap,
} from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
	SelectContent,
	SelectItem,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
	Select as ShSelect,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { apiFetch, useStore } from "../../store"
import { buildCurl, uid } from "../../utils"
import {
	Btn,
	Empty,
	FormGroup,
	Input,
	JsonTree,
	KVTable,
	Spinner,
} from "../shared"
import { PluginTabButton, PluginTabContent } from "../shared/PluginTab"

const GRAPHQL_INTROSPECTION_QUERY = `query IntrospectionQuery { __schema { queryType { name } mutationType { name } subscriptionType { name } types { ...FullType } } } fragment FullType on __Type { kind name description fields(includeDeprecated: true) { name description args { ...InputValue } type { ...TypeRef } isDeprecated deprecationReason } inputFields { ...InputValue } interfaces { ...TypeRef } enumValues(includeDeprecated: true) { name description isDeprecated deprecationReason } possibleTypes { ...TypeRef } } fragment InputValue on __InputValue { name description type { ...TypeRef } defaultValue } fragment TypeRef on __Type { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name } } } } } } } }`

export function RequestPane() {
	const tabs = useStore((s) => s.tabs)
	const activeTabId = useStore((s) => s.activeTabId)
	const tab = tabs.find((t) => t.id === activeTabId) || tabs[0]
	const environments = useStore((s) => s.environments)
	const activeEnvId = useStore((s) => s.activeEnvId)
	const activeEnv =
		environments.find((e) => e.id === activeEnvId) || environments[0] || null
	const envVars = Object.fromEntries(
		(activeEnv?.variables || [])
			.filter((v) => v.enabled)
			.map((v) => [v.key, v.value]),
	)
	const secretKeys = (activeEnv?.variables || [])
		.filter((v) => v.secret)
		.map((v) => v.key)
	const ut = useStore((s) => s.updateActiveTab)
	const sendRequest = useStore((s) => s.sendRequest)
	const saveRequest = useStore((s) => s.saveRequest)
	const setActiveTab = useStore((s) => s.setActiveTab)
	const closeTab = useStore((s) => s.closeTab)
	const newTab = useStore((s) => s.newTab)
	const showNotif = useStore((s) => s.showNotif)
	const connectWs = useStore((s) => s.connectWs)
	const disconnectWs = useStore((s) => s.disconnectWs)
	const connectSse = useStore((s) => s.connectSse)
	const disconnectSse = useStore((s) => s.disconnectSse)
	const connectSio = useStore((s) => s.connectSio)
	const disconnectSio = useStore((s) => s.disconnectSio)
	const loadGrpcProto = useStore((s) => s.loadGrpcProto)
	const callGrpc = useStore((s) => s.callGrpc)
	const disconnectGrpc = useStore((s) => s.disconnectGrpc)
	const pluginTabs = useStore((s) => s.pluginTabs?.request || [])

	const isWs = tab.wsMode
	const isSse = tab.sseMode
	const isSio = tab.sioMode
	const isGrpc = tab.grpcMode

	const METHOD_COLORS = {
		GET: "var(--m-GET)",
		POST: "var(--m-POST)",
		PUT: "var(--m-PUT)",
		PATCH: "var(--m-PATCH)",
		DELETE: "var(--m-DELETE)",
		HEAD: "var(--tx-muted)",
		OPTIONS: "var(--tx-muted)",
	}

	const HTTP_METHODS = [
		"GET",
		"POST",
		"PUT",
		"PATCH",
		"DELETE",
		"HEAD",
		"OPTIONS",
	]
	const currentReqType = isWs
		? "WS"
		: isSse
			? "SSE"
			: isSio
				? "SIO"
				: isGrpc
					? "GRPC"
					: tab.method
	const selectReqType = (value) => {
		if (isWs && tab.wsConnected) disconnectWs()
		if (isSse && tab.sseConnected) disconnectSse()
		if (isSio && tab.sioConnected) disconnectSio()
		if (isGrpc && tab.grpcConnected) disconnectGrpc()
		if (["WS", "SSE", "SIO", "GRPC"].includes(value)) {
			ut({
				wsMode: value === "WS",
				sseMode: value === "SSE",
				sioMode: value === "SIO",
				grpcMode: value === "GRPC",
			})
		} else {
			ut({
				method: value,
				wsMode: false,
				sseMode: false,
				sioMode: false,
				grpcMode: false,
			})
		}
	}

	const copyCurl = () => {
		const curl = buildCurl({
			method: tab.method,
			url: tab.url,
			headers: tab.headers,
			params: tab.params,
			body: tab.body,
			auth: tab.auth,
			environment: envVars,
			secretKeys,
		})
		navigator.clipboard.writeText(curl)
		showNotif("cURL copied", "success")
	}

	const countEnabled = (arr) =>
		(arr || []).filter((r) => r.enabled && r.key).length

	const testBadge = (() => {
		if (!tab.tests?.length) return null
		const r = tab.testResults || []
		if (!r.length) return tab.tests.length
		const p = r.filter((x) => x.pass).length
		return `${p}/${tab.tests.length}`
	})()
	const testBadgeClass = (() => {
		const r = tab.testResults || []
		if (!r.length) return ""
		return r.filter((x) => !x.pass && x.ran).length > 0
			? "bg-[var(--err-dim)] text-[var(--err)]"
			: "bg-[var(--ok-dim)] text-[var(--ok)]"
	})()

	const _connecting = isWs
		? tab.wsConnected
		: isSse
			? tab.sseConnected
			: isSio
				? tab.sioConnected
				: isGrpc
					? tab.grpcConnected
					: tab.loading
	const requestPluginTab = pluginTabs.find(
		(pluginTab) => `plugin:${pluginTab.plugin}:${pluginTab.id}` === tab.reqTab,
	)

	return (
		<div className="flex h-full flex-col overflow-hidden bg-background">
			{/* ── Multi-tab strip ─────────────────────────────────────────────── */}
			<div className="flex min-h-[var(--tabbar-h)] shrink-0 items-stretch overflow-x-auto border-b border-[var(--bd-faint)] bg-[var(--bg-surface)]">
				{tabs.map((t) => {
					const active = t.id === activeTabId
					return (
						<div
							key={t.id}
							role="tab"
							aria-selected={active}
							tabIndex={0}
							className={cn(
								"group flex min-w-0 max-w-[200px] shrink-0 items-center gap-1.5 border-r border-[var(--bd-faint)] px-3 text-[11.5px] text-[var(--tx-faint)] transition-colors cursor-pointer",
								active
									? "border-b-2 border-b-primary bg-[var(--bg-raised)] text-foreground"
									: "hover:bg-[var(--bg-raised)] hover:text-muted-foreground",
							)}
							onClick={() => setActiveTab(t.id)}
							onKeyDown={(e) => e.key === "Enter" && setActiveTab(t.id)}
						>
							<span
								className="shrink-0 font-mono text-[9px] font-bold"
								style={{
									color: METHOD_COLORS[t.method] || "var(--tx-muted)",
								}}
							>
								{t.method}
							</span>
							<span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
								{t.reqName || t.url || "New Request"}
							</span>
							<button
								type="button"
								className={cn(
									"flex size-3.5 shrink-0 items-center justify-center rounded-[2px] text-[var(--tx-faint)] opacity-0 transition-opacity hover:bg-[var(--bg-overlay)] hover:text-destructive group-hover:opacity-100",
									active && "opacity-100",
								)}
								onClick={(e) => {
									e.stopPropagation()
									closeTab(t.id)
								}}
								title="Close tab"
							>
								<X size={9} />
							</button>
						</div>
					)
				})}
				<button
					type="button"
					className="flex w-[34px] shrink-0 items-center justify-center text-[var(--tx-faint)] transition-colors hover:text-primary"
					onClick={() => newTab()}
					title="New tab"
				>
					<Plus size={12} />
				</button>
			</div>

			{/* ── URL bar ─────────────────────────────────────────────────────── */}
			<div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--bd-faint)] bg-[var(--bg-surface)] px-3 py-2">
				<ShSelect value={currentReqType} onValueChange={selectReqType}>
					<SelectTrigger
						className="w-[104px] justify-center border-[var(--bd-subtle)] bg-[var(--bg-raised)] font-mono text-[11.5px] font-bold"
						style={{
							color:
								isWs || isSse || isSio || isGrpc
									? "var(--accent)"
									: METHOD_COLORS[tab.method] || "var(--tx-base)",
						}}
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{HTTP_METHODS.map((m) => (
							<SelectItem key={m} value={m}>
								{m}
							</SelectItem>
						))}
						<SelectSeparator />
						<SelectItem value="WS">WebSocket</SelectItem>
						<SelectItem value="SSE">SSE</SelectItem>
						<SelectItem value="SIO">Socket.IO</SelectItem>
						<SelectItem value="GRPC">gRPC</SelectItem>
					</SelectContent>
				</ShSelect>

				<input
					className="h-8 flex-1 rounded-md border border-[var(--bd-subtle)] bg-[var(--bg-raised)] px-3 font-mono text-[12.5px] text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-[var(--tx-faint)] focus:border-primary focus:shadow-[0_0_0_3px_var(--accent-dim)]"
					placeholder="https://api.example.com/endpoint  •  use {{VAR}} for env vars, or ws(s):// for WebSocket"
					value={tab.url}
					onChange={(e) => ut({ url: e.target.value })}
					onKeyDown={(e) =>
						e.key === "Enter" &&
						!isWs &&
						!isSse &&
						!isSio &&
						!isGrpc &&
						sendRequest()
					}
				/>

				{!isWs && !isSse && !isSio && !isGrpc && (
					<>
						<Button
							variant="outline"
							size="icon"
							className="size-8 border-[var(--bd-subtle)] bg-[var(--bg-raised)]"
							onClick={copyCurl}
							title="Copy as cURL"
						>
							<Terminal size={13} />
						</Button>
						<Button
							variant="outline"
							size="icon"
							className="size-8 border-[var(--bd-subtle)] bg-[var(--bg-raised)]"
							onClick={() => useStore.setState({ modal: "codegen" })}
							title="Generate code snippet"
						>
							<Code2 size={13} />
						</Button>
					</>
				)}
				<Button
					variant="outline"
					size="icon"
					className="size-8 border-[var(--bd-subtle)] bg-[var(--bg-raised)]"
					onClick={saveRequest}
					title="Save request"
				>
					<Save size={13} />
				</Button>
				{isWs ? (
					<SendButton
						connecting={tab.wsConnected}
						onClick={() =>
							tab.wsConnected ? disconnectWs() : connectWs(tab.url)
						}
						connectedLabel="Disconnect"
						idleLabel="Connect"
					/>
				) : isSse ? (
					<SendButton
						connecting={tab.sseConnected}
						onClick={() =>
							tab.sseConnected ? disconnectSse() : connectSse(tab.url)
						}
						connectedLabel="Disconnect"
						idleLabel="Connect"
					/>
				) : isSio ? (
					<SendButton
						connecting={tab.sioConnected}
						onClick={() =>
							tab.sioConnected ? disconnectSio() : connectSio(tab.url)
						}
						connectedLabel="Disconnect"
						idleLabel="Connect"
					/>
				) : isGrpc ? (
					<SendButton
						connecting={tab.grpcConnected}
						onClick={() => (tab.grpcConnected ? disconnectGrpc() : callGrpc())}
						connectedLabel="Cancel"
						idleLabel="Call"
					/>
				) : (
					<Button
						className="h-8 gap-1.5 rounded-md bg-primary px-4 text-[12.5px] font-bold text-primary-foreground hover:bg-[var(--accent-hover)] active:scale-[.97] disabled:pointer-events-none disabled:border disabled:border-[var(--bd-subtle)] disabled:bg-[var(--bg-raised)] disabled:text-muted-foreground disabled:opacity-100"
						onClick={sendRequest}
						disabled={tab.loading}
					>
						{tab.loading ? (
							<>
								<Spinner size={12} /> Sending…
							</>
						) : (
							<>
								<Send size={13} /> Send
							</>
						)}
					</Button>
				)}
			</div>

			{/* ── Request sub-tabs ────────────────────────────────────────────── */}
			<div className="flex shrink-0 items-center overflow-x-auto border-b border-[var(--bd-faint)] bg-[var(--bg-surface)] px-3">
				{[
					{
						key: "info",
						label: "Info",
						badge: tab.description ? "●" : null,
					},
					{
						key: "params",
						label: "Params",
						badge: countEnabled(tab.params) || null,
					},
					{
						key: "headers",
						label: "Headers",
						badge: countEnabled(tab.headers) || null,
					},
					{ key: "body", label: "Body", badge: null },
					{
						key: "auth",
						label: "Auth",
						badge: tab.auth?.type !== "none" ? "●" : null,
					},
					{
						key: "pre",
						label: "Pre-req",
						badge: tab.preScript ? "JS" : null,
					},
					{
						key: "post",
						label: "Post-res",
						badge: tab.postScript ? "JS" : null,
					},
					{
						key: "tests",
						label: "Tests",
						badge: testBadge,
						badgeClass: testBadgeClass,
					},
				].map(({ key, label, badge, badgeClass }) => (
					<button
						type="button"
						key={key}
						className={cn(
							"mb-[-1px] flex items-center gap-1 whitespace-nowrap border-b-2 border-transparent px-2.5 py-2 text-[12px] text-[var(--tx-faint)] transition-colors hover:text-muted-foreground",
							tab.reqTab === key && "border-b-primary text-foreground",
						)}
						onClick={() => ut({ reqTab: key })}
					>
						{label}
						{badge !== null && badge !== undefined && (
							<span
								className={cn(
									"rounded-full bg-[var(--bg-overlay)] px-1.5 py-px font-mono text-[10px] text-[var(--tx-faint)]",
									badgeClass,
								)}
							>
								{badge}
							</span>
						)}
					</button>
				))}
				{pluginTabs.map((pluginTab) => {
					const key = `plugin:${pluginTab.plugin}:${pluginTab.id}`
					return (
						<PluginTabButton
							key={key}
							tab={pluginTab}
							active={tab.reqTab === key}
							onClick={() => ut({ reqTab: key })}
						/>
					)
				})}
				<div className="flex-1" />
				{tab.activeReq && (
					<input
						className="max-w-[160px] bg-transparent pr-1 text-right font-mono text-[11px] text-[var(--tx-faint)] outline-none focus:text-foreground"
						value={tab.reqName || ""}
						onChange={(e) => ut({ reqName: e.target.value })}
						placeholder="Request name…"
					/>
				)}
			</div>

			{/* ── Panel content ───────────────────────────────────────────────── */}
			<div className="flex flex-1 flex-col overflow-hidden">
				{isGrpc && (
					<GrpcPanel tab={tab} ut={ut} loadGrpcProto={loadGrpcProto} />
				)}
				{!isGrpc && tab.reqTab === "info" && <InfoPanel tab={tab} ut={ut} />}
				{!isGrpc && tab.reqTab === "params" && (
					<KVTable
						rows={tab.params}
						onChange={(v) => ut({ params: v })}
						placeholder={["Parameter", "Value"]}
					/>
				)}
				{!isGrpc && tab.reqTab === "headers" && (
					<KVTable
						rows={tab.headers}
						onChange={(v) => ut({ headers: v })}
						placeholder={["Header", "Value"]}
					/>
				)}
				{!isGrpc && tab.reqTab === "body" && (
					<BodyPanel
						body={tab.body}
						onChange={(v) => ut({ body: v })}
						method={tab.method}
						setMethod={(m) => ut({ method: m })}
						url={tab.url}
						headers={tab.headers}
						auth={tab.auth}
						environment={envVars}
					/>
				)}
				{!isGrpc && tab.reqTab === "auth" && (
					<AuthPanel auth={tab.auth} onChange={(v) => ut({ auth: v })} />
				)}
				{!isGrpc && tab.reqTab === "pre" && (
					<ScriptPanel
						code={tab.preScript}
						onChange={(v) => ut({ preScript: v })}
						type="pre"
						logs={tab.preLogs}
					/>
				)}
				{!isGrpc && tab.reqTab === "post" && (
					<ScriptPanel
						code={tab.postScript}
						onChange={(v) => ut({ postScript: v })}
						type="post"
						logs={tab.postLogs}
					/>
				)}
				{!isGrpc && tab.reqTab === "tests" && (
					<TestsPanel
						tests={tab.tests}
						onChange={(v) => ut({ tests: v })}
						results={tab.testResults}
					/>
				)}
				{requestPluginTab && (
					<PluginTabContent
						pane="request"
						tab={requestPluginTab}
						context={{ request: tab }}
					/>
				)}
			</div>
		</div>
	)
}

/* ── Send/connect button (WS/SSE/SIO/gRPC) ───────────────────────────────── */
function SendButton({ connecting, onClick, connectedLabel, idleLabel }) {
	return (
		<Button
			onClick={onClick}
			className={cn(
				"h-8 gap-1.5 rounded-md px-4 text-[12.5px] font-bold",
				connecting
					? "pointer-events-none border border-[var(--bd-subtle)] bg-[var(--bg-raised)] text-muted-foreground"
					: "bg-primary text-primary-foreground hover:bg-[var(--accent-hover)] active:scale-[.97]",
			)}
		>
			{connecting ? (
				<>
					<X size={13} /> {connectedLabel}
				</>
			) : (
				<>
					<Zap size={13} /> {idleLabel}
				</>
			)}
		</Button>
	)
}

/* ── Body panel ───────────────────────────────────────────────────────────── */
function BodyPanel({
	body,
	onChange,
	method,
	setMethod,
	url,
	headers,
	auth,
	environment,
}) {
	const set = (k, v) => onChange({ ...body, [k]: v })
	const TYPES = ["none", "json", "text", "form", "multipart", "raw", "graphql"]
	const LABELS = { multipart: "Form Data", graphql: "GraphQL" }
	const selectType = (t) => {
		onChange({ ...body, type: t })
		if (t === "graphql" && method !== "POST") setMethod("POST")
	}
	return (
		<div className="flex flex-1 flex-col overflow-hidden">
			<div className="flex shrink-0 gap-0.5 border-b border-[var(--bd-faint)] px-3 py-1.5">
				{TYPES.map((t) => (
					<button
						type="button"
						key={t}
						className={cn(
							"rounded-sm px-2.5 py-1 text-[11px] text-[var(--tx-faint)] transition-colors hover:bg-[var(--bg-raised)] hover:text-muted-foreground",
							body.type === t &&
								"bg-[var(--accent-dim)] text-primary! hover:text-primary!",
						)}
						onClick={() => selectType(t)}
					>
						{LABELS[t] || t.charAt(0).toUpperCase() + t.slice(1)}
					</button>
				))}
			</div>
			{body.type === "none" && (
				<Empty icon="📭" text="No body" sub="Select a body type above" />
			)}
			{body.type === "form" && (
				<KVTable
					rows={body.fields || []}
					onChange={(v) => set("fields", v)}
					placeholder={["Field", "Value"]}
				/>
			)}
			{body.type === "multipart" && (
				<MultipartTable
					rows={body.fields || []}
					onChange={(v) => set("fields", v)}
				/>
			)}
			{["json", "text", "raw"].includes(body.type) && (
				<Textarea
					className="flex-1 resize-none rounded-none border-none bg-[var(--bg-raised)] px-3.5 py-3 text-[12px] leading-[1.65] shadow-none focus-visible:ring-0"
					placeholder={
						body.type === "json" ? '{\n  "key": "value"\n}' : "Body content…"
					}
					value={body.content || ""}
					onChange={(e) => set("content", e.target.value)}
				/>
			)}
			{body.type === "graphql" && (
				<GraphQLPanel
					body={body}
					onChange={onChange}
					url={url}
					headers={headers}
					auth={auth}
					environment={environment}
				/>
			)}
		</div>
	)
}

/* ── GraphQL body editor (query + variables + schema introspection) ─────────── */
function GraphQLPanel({ body, onChange, url, headers, auth, environment }) {
	const set = (k, v) => onChange({ ...body, [k]: v })
	const [loading, setLoading] = useState(false)
	const [schema, setSchema] = useState(null)
	const [error, setError] = useState("")

	const fetchSchema = async () => {
		setLoading(true)
		setError("")
		setSchema(null)
		try {
			const res = await apiFetch("/api/execute", {
				method: "POST",
				body: {
					method: "POST",
					url,
					headers,
					auth,
					environment,
					saveToHistory: false,
					body: {
						type: "json",
						content: JSON.stringify({
							query: GRAPHQL_INTROSPECTION_QUERY,
						}),
					},
				},
			})
			if (res.error) throw new Error(res.error)
			const parsed = JSON.parse(res.body)
			if (parsed.errors?.length)
				throw new Error(parsed.errors[0].message || "Introspection failed")
			if (!parsed.data?.__schema)
				throw new Error("Server did not return a schema")
			setSchema(parsed.data.__schema)
		} catch (e) {
			setError(e.message)
		}
		setLoading(false)
	}

	return (
		<div className="flex flex-1 flex-col overflow-hidden">
			<div className="shrink-0 px-3 pt-1.5 pb-1 text-[10.5px] font-semibold tracking-wide text-[var(--tx-faint)] uppercase">
				Query
			</div>
			<Textarea
				className="flex-1 resize-none rounded-none border-none bg-[var(--bg-raised)] px-3.5 py-3 text-[12px] leading-[1.65] shadow-none focus-visible:ring-0"
				placeholder={"query {\n  \n}"}
				value={body.query || ""}
				onChange={(e) => set("query", e.target.value)}
			/>
			<div className="shrink-0 px-3 pt-1.5 pb-1 text-[10.5px] font-semibold tracking-wide text-[var(--tx-faint)] uppercase">
				Variables (JSON)
			</div>
			<Textarea
				className="resize-none rounded-none border-none bg-[var(--bg-raised)] px-3.5 py-3 text-[12px] leading-[1.65] shadow-none focus-visible:ring-0"
				style={{ minHeight: 70 }}
				placeholder="{}"
				value={body.variables || ""}
				onChange={(e) => set("variables", e.target.value)}
			/>
			<div className="flex shrink-0 items-center gap-2 border-t border-[var(--bd-faint)] px-3 py-2">
				<Btn
					variant="ghost"
					size="sm"
					onClick={fetchSchema}
					disabled={loading || !url}
				>
					{loading ? "Loading schema…" : "Fetch Schema"}
				</Btn>
				{error && <span className="text-[11px] text-destructive">{error}</span>}
			</div>
			{schema && (
				<div className="max-h-[240px] shrink-0 overflow-y-auto border-t border-[var(--bd-faint)]">
					<JsonTree value={schema} />
				</div>
			)}
		</div>
	)
}

/* ── gRPC panel: paste a .proto, pick a method, fill the request JSON ────────
   Address goes in the URL bar (host:port). Only unary and server-streaming
   methods are supported — client-streaming/bidi is rejected server-side.    */
function GrpcPanel({ tab, ut, loadGrpcProto }) {
	return (
		<div className="flex flex-1 flex-col overflow-hidden">
			<div className="shrink-0 px-3 pt-1.5 pb-1 text-[10.5px] font-semibold tracking-wide text-[var(--tx-faint)] uppercase">
				.proto file
			</div>
			<Textarea
				className="resize-none rounded-none border-none bg-[var(--bg-raised)] px-3.5 py-3 text-[12px] leading-[1.65] shadow-none focus-visible:ring-0"
				style={{ minHeight: 100 }}
				placeholder={
					'syntax = "proto3";\npackage demo;\n\nservice Greeter {\n  rpc SayHello (HelloRequest) returns (HelloReply) {}\n}\n\nmessage HelloRequest { string name = 1; }\nmessage HelloReply { string message = 1; }'
				}
				value={tab.grpcProtoText}
				onChange={(e) => ut({ grpcProtoText: e.target.value })}
			/>
			<div className="flex shrink-0 items-center gap-2 border-t border-[var(--bd-faint)] px-3 py-2">
				<Btn
					variant="ghost"
					size="sm"
					onClick={loadGrpcProto}
					disabled={!tab.grpcProtoText?.trim()}
				>
					Load Proto
				</Btn>
				{tab.grpcMethods?.length > 0 && (
					<ShSelect
						value={tab.grpcMethodPath}
						onValueChange={(v) => ut({ grpcMethodPath: v })}
					>
						<SelectTrigger className="flex-1 border-[var(--bd-subtle)] bg-[var(--bg-raised)] font-mono">
							<SelectValue placeholder="Select a method…" />
						</SelectTrigger>
						<SelectContent>
							{tab.grpcMethods.map((m) => (
								<SelectItem key={m.path} value={m.path}>
									{m.path}
									{m.responseStream ? " (server-streaming)" : ""}
								</SelectItem>
							))}
						</SelectContent>
					</ShSelect>
				)}
			</div>
			<div className="shrink-0 px-3 pt-1.5 pb-1 text-[10.5px] font-semibold tracking-wide text-[var(--tx-faint)] uppercase">
				Request (JSON)
			</div>
			<Textarea
				className="resize-none rounded-none border-none bg-[var(--bg-raised)] px-3.5 py-3 text-[12px] leading-[1.65] shadow-none focus-visible:ring-0"
				style={{ minHeight: 90 }}
				placeholder={'{\n  "name": "World"\n}'}
				value={tab.grpcRequestJson}
				onChange={(e) => ut({ grpcRequestJson: e.target.value })}
			/>
		</div>
	)
}

/* ── Multipart / form-data table (text fields + file fields) ────────────────── */
function MultipartTable({ rows, onChange }) {
	const update = (i, patch) =>
		onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
	const del = (i) => onChange(rows.filter((_, j) => j !== i))
	const add = () =>
		onChange([
			...rows,
			{ id: uid(), key: "", value: "", type: "text", enabled: true },
		])

	const readFile = (i, file) => {
		if (!file) return
		const reader = new FileReader()
		reader.onload = () => {
			const base64 = String(reader.result).split(",")[1] || ""
			update(i, {
				fileName: file.name,
				fileType: file.type || "application/octet-stream",
				fileSize: file.size,
				fileData: base64,
			})
		}
		reader.readAsDataURL(file)
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex-1 overflow-y-auto">
				{rows.map((r, i) => (
					<div
						key={r.id || i}
						className="flex items-center gap-1.5 border-b border-[var(--bd-faint)] px-2.5 py-1 hover:bg-[var(--bg-raised)]"
					>
						<input
							type="checkbox"
							className="size-3.5 shrink-0 accent-[var(--accent)]"
							checked={r.enabled}
							onChange={(e) => update(i, { enabled: e.target.checked })}
						/>
						<input
							className="flex-1 rounded-sm border border-transparent bg-transparent px-1.5 py-1 font-mono text-[11.5px] text-foreground outline-none focus:border-[var(--bd-base)] focus:bg-[var(--bg-overlay)]"
							placeholder="Field"
							value={r.key || ""}
							onChange={(e) => update(i, { key: e.target.value })}
						/>
						<select
							className="w-16 shrink-0 rounded-sm border border-[var(--bd-faint)] bg-[var(--bg-overlay)] px-1.5 py-1 text-[11px] text-muted-foreground"
							value={r.type || "text"}
							onChange={(e) =>
								update(i, {
									type: e.target.value,
									value: "",
									fileName: undefined,
									fileType: undefined,
									fileData: undefined,
								})
							}
						>
							<option value="text">Text</option>
							<option value="file">File</option>
						</select>
						{r.type === "file" ? (
							<label className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-sm border border-dashed border-[var(--bd-base)] px-2 py-1 text-[11.5px] text-[var(--tx-faint)] transition-colors hover:border-primary hover:text-primary">
								<Upload size={12} />
								<span className="overflow-hidden text-ellipsis whitespace-nowrap">
									{r.fileName || "Choose file…"}
								</span>
								<input
									type="file"
									className="hidden"
									onChange={(e) => readFile(i, e.target.files?.[0])}
								/>
							</label>
						) : (
							<input
								className="flex-1 rounded-sm border border-transparent bg-transparent px-1.5 py-1 font-mono text-[11.5px] text-foreground outline-none focus:border-[var(--bd-base)] focus:bg-[var(--bg-overlay)]"
								placeholder="Value"
								value={r.value || ""}
								onChange={(e) => update(i, { value: e.target.value })}
							/>
						)}
						<button
							type="button"
							className="flex size-5 shrink-0 items-center justify-center rounded-sm text-[var(--tx-faint)] transition-colors hover:bg-[var(--bg-overlay)] hover:text-destructive"
							onClick={() => del(i)}
						>
							<X size={11} />
						</button>
					</div>
				))}
			</div>
			<button
				type="button"
				className="m-1.5 flex items-center gap-1 rounded-sm border border-dashed border-[var(--bd-subtle)] px-2.5 py-1 text-[11px] text-[var(--tx-faint)] transition-colors hover:border-primary hover:text-primary"
				onClick={add}
			>
				<Plus size={11} /> Add Row
			</button>
		</div>
	)
}

/* ── Info panel (description + AI-assisted suggestions) ─────────────────────── */
function InfoPanel({ tab, ut }) {
	const aiConfig = useStore((s) => s.aiConfig)
	const showNotif = useStore((s) => s.showNotif)
	const [suggesting, setSuggesting] = useState(false)
	const [suggestion, setSuggestion] = useState(null) // { description, tests } | null
	const [error, setError] = useState("")

	const isConfigured = Boolean(
		aiConfig.provider === "ollama"
			? aiConfig.model
			: aiConfig.provider === "anthropic"
				? aiConfig.apiKey
				: aiConfig.apiKey || aiConfig.provider === "openai-compatible",
	)
	const canSuggest = Boolean(tab.activeReq && isConfigured)

	const requestSuggestion = async () => {
		setError("")
		setSuggestion(null)
		setSuggesting(true)
		try {
			const res = await apiFetch(
				`/api/collections/${tab.activeReq.colId}/requests/${tab.activeReq.reqId}/ai-suggest`,
				{ method: "POST", body: aiConfig },
			)
			if (res.error) throw new Error(res.error)
			setSuggestion(res)
		} catch (e) {
			setError(e.message || "AI suggestion failed")
		}
		setSuggesting(false)
	}

	const applySuggestion = () => {
		if (!suggestion) return
		ut({
			description: suggestion.description,
			tests: [
				...(tab.tests || []),
				...suggestion.tests.map((t) => ({
					id: uid(),
					type: t.type,
					value: t.value || "",
				})),
			],
		})
		setSuggestion(null)
		showNotif("Suggestion applied — remember to Save", "success")
	}

	return (
		<div className="flex flex-col gap-3 overflow-y-auto p-4">
			<FormGroup label="Description">
				<Textarea
					style={{ minHeight: 70 }}
					placeholder="What does this request do? When should someone use it?"
					value={tab.description || ""}
					onChange={(e) => ut({ description: e.target.value })}
				/>
			</FormGroup>

			<div className="flex flex-wrap items-center gap-2.5">
				<Btn
					variant="ghost"
					size="sm"
					onClick={requestSuggestion}
					disabled={!canSuggest || suggesting}
				>
					{suggesting ? (
						<Spinner size={12} />
					) : (
						<>
							<Sparkles size={12} /> Fix with AI
						</>
					)}
				</Btn>
				{!tab.activeReq && (
					<span className="text-[11px] leading-[1.65] text-[var(--tx-faint)]">
						Save this request to a collection first.
					</span>
				)}
				{tab.activeReq && !isConfigured && (
					<span className="text-[11px] leading-[1.65] text-[var(--tx-faint)]">
						Set up a provider in{" "}
						<button
							type="button"
							className="cursor-pointer border-none bg-none p-0 text-inherit text-primary underline"
							onClick={() => useStore.setState({ modal: "settings" })}
						>
							Settings
						</button>{" "}
						to enable AI suggestions.
					</span>
				)}
			</div>

			{error && <p className="m-0 text-[11.5px] text-destructive">{error}</p>}

			{suggestion && (
				<div className="flex flex-col gap-1.5 rounded-sm border border-[var(--bd-subtle)] bg-[var(--bg-overlay)] p-3.5">
					<p className="m-0 mt-1 text-[10.5px] font-semibold tracking-wide text-[var(--tx-faint)] uppercase">
						Suggested description
					</p>
					<p className="m-0 text-[12.5px] leading-[1.5] text-foreground">
						{suggestion.description}
					</p>
					{suggestion.tests.length > 0 && (
						<>
							<p className="m-0 mt-1 text-[10.5px] font-semibold tracking-wide text-[var(--tx-faint)] uppercase">
								Suggested tests
							</p>
							<ul className="m-0 pl-4.5 font-mono text-[12px] text-muted-foreground">
								{suggestion.tests.map((t, _i) => (
									<li key={`${t.type}-${t.path || ""}-${t.value || ""}`}>
										{t.type}
										{t.value ? `: ${t.value}` : ""}
									</li>
								))}
							</ul>
						</>
					)}
					<div className="mt-1.5 flex justify-end gap-2">
						<Btn variant="ghost" size="sm" onClick={() => setSuggestion(null)}>
							Discard
						</Btn>
						<Btn variant="primary" size="sm" onClick={applySuggestion}>
							Apply
						</Btn>
					</div>
				</div>
			)}
		</div>
	)
}

/* ── Auth panel ───────────────────────────────────────────────────────────── */
function AuthPanel({ auth, onChange }) {
	const set = (k, v) => onChange({ ...auth, [k]: v })
	return (
		<div className="flex flex-col gap-3 overflow-y-auto p-4">
			<FormGroup label="Auth type">
				<ShSelect
					value={auth.type || "none"}
					onValueChange={(v) => set("type", v)}
				>
					<SelectTrigger className="w-full max-w-[220px]">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="none">No Auth</SelectItem>
						<SelectItem value="bearer">Bearer Token</SelectItem>
						<SelectItem value="basic">Basic Auth</SelectItem>
						<SelectItem value="apikey">API Key</SelectItem>
					</SelectContent>
				</ShSelect>
			</FormGroup>
			{auth.type === "bearer" && (
				<FormGroup label="Token">
					<Input
						value={auth.token || ""}
						onChange={(e) => set("token", e.target.value)}
						placeholder="Bearer token…"
					/>
				</FormGroup>
			)}
			{auth.type === "basic" && (
				<>
					<FormGroup label="Username">
						<Input
							value={auth.username || ""}
							onChange={(e) => set("username", e.target.value)}
						/>
					</FormGroup>
					<FormGroup label="Password">
						<Input
							type="password"
							value={auth.password || ""}
							onChange={(e) => set("password", e.target.value)}
						/>
					</FormGroup>
				</>
			)}
			{auth.type === "apikey" && (
				<>
					<FormGroup label="Key name">
						<Input
							value={auth.key || ""}
							onChange={(e) => set("key", e.target.value)}
							placeholder="X-API-Key"
						/>
					</FormGroup>
					<FormGroup label="Value">
						<Input
							value={auth.value || ""}
							onChange={(e) => set("value", e.target.value)}
						/>
					</FormGroup>
					<FormGroup label="Send in">
						<ShSelect
							value={auth.placement || "header"}
							onValueChange={(v) => set("placement", v)}
						>
							<SelectTrigger className="w-full max-w-[220px]">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="header">Header</SelectItem>
								<SelectItem value="query">Query param</SelectItem>
							</SelectContent>
						</ShSelect>
					</FormGroup>
				</>
			)}
		</div>
	)
}

/* ── Script panel ─────────────────────────────────────────────────────────── */
function ScriptPanel({ code, onChange, type, logs }) {
	return (
		<div className="flex flex-1 flex-col overflow-hidden">
			<div className="shrink-0 border-b border-[var(--bd-faint)] bg-[var(--bg-surface)] px-3.5 py-2 text-[11px] leading-[1.65] text-[var(--tx-faint)]">
				{type === "pre"
					? "Runs before the request. "
					: "Runs after the response. Access response.status / .body / .headers. "}
				Available:{" "}
				<code className="rounded-[3px] bg-[var(--bg-overlay)] px-1.5 py-px text-primary">
					consolio.log()
				</code>
				,{" "}
				<code className="rounded-[3px] bg-[var(--bg-overlay)] px-1.5 py-px text-primary">
					consolio.setVariable(key, val)
				</code>
				,{" "}
				<code className="rounded-[3px] bg-[var(--bg-overlay)] px-1.5 py-px text-primary">
					consolio.getVariable(key)
				</code>
			</div>
			<Textarea
				className="flex-1 resize-none rounded-none border-none bg-[var(--bg-raised)] px-3.5 py-3 text-[12px] leading-[1.65] shadow-none focus-visible:ring-0"
				placeholder={`// ${type === "pre" ? "Pre-request" : "Post-response"} script\nconsolio.log('status:', response?.status);\n// consolio.setVariable('token', JSON.parse(response.body).token);`}
				value={code || ""}
				onChange={(e) => onChange(e.target.value)}
			/>
			{logs && logs.length > 0 && (
				<div className="max-h-20 shrink-0 overflow-y-auto border-t border-[var(--bd-faint)] bg-[var(--bg-surface)] px-3.5 py-2">
					{logs.map((l, _i) => (
						<div
							key={`${l.type}-${l.line}`}
							className="mb-0.5 font-mono text-[11px] text-muted-foreground"
						>
							› {l}
						</div>
					))}
				</div>
			)}
		</div>
	)
}

/* ── Tests panel ──────────────────────────────────────────────────────────── */
function TestsPanel({ tests, onChange, results }) {
	const add = () =>
		onChange([
			...(tests || []),
			{ id: uid(), type: "status", value: "200", path: "" },
		])
	const upd = (i, f, v) =>
		onChange(tests.map((t, j) => (j === i ? { ...t, [f]: v } : t)))
	const del = (i) => onChange(tests.filter((_, j) => j !== i))

	const DOT_COLOR = {
		pass: "bg-[var(--ok)]",
		fail: "bg-[var(--err)]",
		pending: "bg-[var(--tx-faint)]",
	}

	return (
		<div className="flex flex-1 flex-col overflow-hidden">
			<div className="flex shrink-0 gap-3 border-b border-[var(--bd-faint)] px-3.5 py-2 text-[12px]">
				{results?.length > 0 ? (
					<>
						<span className="text-[var(--ok)]">
							● {results.filter((r) => r.pass).length} pass
						</span>
						{"  "}
						<span className="text-destructive">
							{results.filter((r) => !r.pass && r.ran).length} fail
						</span>
					</>
				) : (
					<span className="text-[var(--tx-faint)]">
						Assertions — evaluated on Send
					</span>
				)}
			</div>
			<div className="flex-1 overflow-y-auto py-2">
				{(tests || []).map((t, i) => {
					const res = results?.[i]
					const state = res ? (res.pass ? "pass" : "fail") : "pending"
					return (
						<div
							key={t.id || i}
							className="flex items-center gap-1.5 border-b border-[var(--bd-faint)] px-3 py-1 hover:bg-[var(--bg-raised)]"
						>
							<span
								className={cn(
									"size-1.5 shrink-0 rounded-full",
									DOT_COLOR[state],
								)}
							/>
							<select
								className="shrink-0 rounded-sm border border-[var(--bd-subtle)] bg-[var(--bg-raised)] px-1.5 py-1 text-[11px] text-muted-foreground focus:border-primary focus:outline-none"
								value={t.type}
								onChange={(e) => upd(i, "type", e.target.value)}
							>
								<option value="status">Status =</option>
								<option value="status_lt">Status &lt;</option>
								<option value="status_in">Status in list</option>
								<option value="has_header">Has header</option>
								<option value="header_equals">Header =</option>
								<option value="body_contains">Body contains</option>
								<option value="body_not_contains">Body doesn't contain</option>
								<option value="body_json_path">JSON path =</option>
								<option value="response_time">Response ≤ ms</option>
								<option value="response_time_gt">Response &gt; ms</option>
								<option value="body_not_empty">Body not empty</option>
							</select>
							{t.type === "body_json_path" && (
								<input
									className="w-[100px] rounded-sm border border-[var(--bd-subtle)] bg-[var(--bg-raised)] px-1.5 py-1 font-mono text-[11px] text-foreground placeholder:text-[var(--tx-faint)] focus:border-primary focus:outline-none"
									placeholder="e.g. data[0].id"
									value={t.path || ""}
									onChange={(e) => upd(i, "path", e.target.value)}
								/>
							)}
							{t.type !== "body_not_empty" && (
								<input
									className="flex-1 rounded-sm border border-[var(--bd-subtle)] bg-[var(--bg-raised)] px-1.5 py-1 font-mono text-[11px] text-foreground placeholder:text-[var(--tx-faint)] focus:border-primary focus:outline-none"
									placeholder={
										t.type === "status"
											? "200"
											: t.type === "status_in"
												? "200,201,204"
												: t.type === "response_time" ||
														t.type === "response_time_gt"
													? "500"
													: t.type === "header_equals"
														? "content-type=application/json"
														: "value…"
									}
									value={t.value || ""}
									onChange={(e) => upd(i, "value", e.target.value)}
								/>
							)}
							{res && (
								<span className="shrink-0 font-mono text-[10px] text-[var(--tx-faint)]">
									{res.actual}
								</span>
							)}
							<button
								type="button"
								className="flex shrink-0 items-center text-[var(--tx-faint)] transition-colors hover:text-destructive"
								onClick={() => del(i)}
							>
								<X size={10} />
							</button>
						</div>
					)
				})}
			</div>
			<button
				type="button"
				className="m-2 flex items-center gap-1 rounded-sm border border-dashed border-[var(--bd-subtle)] px-2.5 py-1 text-[11px] text-[var(--tx-faint)] transition-colors hover:border-primary hover:text-primary"
				onClick={add}
			>
				<Plus size={11} /> Add assertion
			</button>
		</div>
	)
}
