const { randomUUID } = require("node:crypto")

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])

module.exports = {
	requestHooks: [
		(request) => {
			if (!MUTATING_METHODS.has((request.method || "").toUpperCase()))
				return request
			const headers = request.headers ? [...request.headers] : []
			const hasOne = headers.some(
				(h) =>
					h.enabled !== false && h.key?.toLowerCase() === "idempotency-key",
			)
			if (!hasOne)
				headers.push({
					key: "Idempotency-Key",
					value: randomUUID(),
					enabled: true,
				})
			return { ...request, headers }
		},
	],
	paneTabs: {
		request: [
			{
				id: "safety",
				label: "Safety",
				render: ({ request }) => {
					const method = (request.method || "").toUpperCase()
					const applies = MUTATING_METHODS.has(method)
					const header = (request.headers || []).find(
						(h) =>
							h.enabled !== false && h.key?.toLowerCase() === "idempotency-key",
					)
					return {
						kind: "table",
						rows: [
							{ label: "Method", value: method || "GET" },
							{
								label: "Protection",
								value: applies
									? "Enabled for this mutation"
									: "Not needed for this method",
							},
							{
								label: "Key",
								value: header?.value || "Generated at send time",
							},
							{
								label: "Why it helps",
								value:
									"Retries will not double-submit when the API honors Idempotency-Key",
							},
						],
					}
				},
			},
		],
	},
}
