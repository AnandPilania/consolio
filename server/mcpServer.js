import { z } from "zod"
import { executeRequest } from "./routes/proxy.js"

function findTemplateVars(request) {
	const names = new Set()
	const scan = (str) => {
		if (typeof str !== "string") return
		for (const m of str.matchAll(/\{\{(\w+)\}\}/g)) names.add(m[1])
	}
	scan(request.url)
	;(request.headers || []).forEach((h) => {
		scan(h.key)
		scan(h.value)
	})
	;(request.params || []).forEach((p) => {
		scan(p.key)
		scan(p.value)
	})
	if (request.body) {
		scan(request.body.content)
		;(request.body.fields || []).forEach((f) => {
			scan(f.value)
		})
	}
	if (request.auth) {
		scan(request.auth.token)
		scan(request.auth.username)
		scan(request.auth.value)
	}
	return [...names]
}

function findOverridableParams(request) {
	return (request.params || [])
		.filter((p) => p.key && p.enabled !== false)
		.map((p) => p.key)
}

function buildInputSchema(request, secretVarNames) {
	const varNames = new Set([
		...findTemplateVars(request),
		...findOverridableParams(request),
	])
	const shape = {}
	for (const name of varNames) {
		if (secretVarNames.has(name)) continue
		shape[name] = z.string().optional().describe(`Value for {{${name}}}`)
	}
	return shape
}

function toolNameFor(request, usedNames) {
	const base =
		(request.name || `${request.method}_${request.url}`)
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "_")
			.replace(/^_+|_+$/g, "")
			.slice(0, 60) || "request"
	let name = base,
		i = 2
	while (usedNames.has(name)) {
		name = `${base}_${i++}`
	}
	usedNames.add(name)
	return name
}

export function registerCollectionTools(
	mcpServer,
	collection,
	{ storage, baseEnvironment = {}, secretVarNames = new Set() },
) {
	const usedNames = new Set()
	const registered = []

	for (const request of collection.requests || []) {
		const toolName = toolNameFor(request, usedNames)
		const inputShape = buildInputSchema(request, secretVarNames)

		mcpServer.registerTool(
			toolName,
			{
				title: request.name || toolName,
				description: request.description || `${request.method} ${request.url}`,
				inputSchema: inputShape,
			},
			async (args) => {
				const environment = {
					...baseEnvironment,
					...Object.fromEntries(
						Object.entries(args || {}).filter(([, v]) => v !== undefined),
					),
				}

				const params = (request.params || []).map((p) =>
					p.key && args && args[p.key] !== undefined
						? { ...p, value: args[p.key] }
						: p,
				)

				try {
					const { httpStatus, payload } = await executeRequest(
						{
							...request,
							params,
							environment,
							saveToHistory: true,
							requestName: request.name,
							requestId: request.id,
							collectionId: collection.id,
						},
						{ storage },
					)
					if (httpStatus >= 500 && payload.error) {
						return {
							content: [
								{
									type: "text",
									text: `Request failed: ${payload.error}`,
								},
							],
							isError: true,
						}
					}
					const summary =
						`${request.method} ${request.url} → ${payload.status} ${payload.statusText || ""}`.trim()
					const bodyText =
						typeof payload.body === "string"
							? payload.body
							: JSON.stringify(payload.body, null, 2)
					return {
						content: [{ type: "text", text: `${summary}\n\n${bodyText}` }],
						isError: payload.status >= 400,
					}
				} catch (e) {
					return {
						content: [
							{
								type: "text",
								text: `Request failed: ${e.message}`,
							},
						],
						isError: true,
					}
				}
			},
		)

		registered.push({
			toolName,
			requestId: request.id,
			requestName: request.name,
		})
	}

	return registered
}
