function inspect(response) {
	const headers = response.headers || {}
	const origin = headers["access-control-allow-origin"]
	const credentials = headers["access-control-allow-credentials"]
	const methods = headers["access-control-allow-methods"]
	const issues = []

	if (origin === "*") {
		if (credentials?.toLowerCase() === "true")
			issues.push("Wildcard origin cannot be used with credentials")
	} else if (
		origin &&
		!origin.startsWith("http://") &&
		!origin.startsWith("https://")
	) {
		issues.push("Allow-Origin is not a valid origin")
	}
	if (credentials?.toLowerCase() === "true" && !origin)
		issues.push("Credentials enabled without Allow-Origin")
	if (methods && !methods.includes("OPTIONS"))
		issues.push("Allow-Methods omits OPTIONS for preflight requests")

	return {
		origin: origin || "Not provided",
		credentials: credentials || "Not provided",
		methods: methods || "Not provided",
		issues,
	}
}

module.exports = {
	responseHooks: [
		(response) => {
			const result = inspect(response)
			if (!result.issues.length) return response
			return {
				...response,
				headers: {
					...response.headers,
					"x-consolio-cors-warning": result.issues.join("; "),
				},
			}
		},
	],
	paneTabs: {
		response: [
			{
				id: "cors",
				label: "CORS",
				render: ({ response }) => {
					const result = inspect(response)
					return {
						kind: "table",
						rows: [
							{ label: "Allow-Origin", value: result.origin },
							{ label: "Allow-Credentials", value: result.credentials },
							{ label: "Allow-Methods", value: result.methods },
							{
								label: "Result",
								value: result.issues.length
									? `${result.issues.length} issue(s)`
									: "No obvious CORS issues",
							},
							{
								label: "Why it helps",
								value:
									"Compare browser CORS requirements with the actual response headers",
							},
							{
								label: "Details",
								value:
									result.issues.join("; ") ||
									"A missing CORS policy is fine for server-to-server clients",
							},
						],
					}
				},
			},
		],
	},
}
