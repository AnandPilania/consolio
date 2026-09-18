function inspect(response) {
	const body = response.body || ""
	let parsed = null
	try {
		parsed = JSON.parse(body)
	} catch {}
	const source = parsed && typeof parsed === "object" ? parsed : {}
	const message =
		source.message ||
		source.error_description ||
		source.error ||
		(response.status >= 400 ? body.slice(0, 240) : "No error reported")
	const details =
		source.details || source.detail || source.errors || source.issues
	const detailText =
		typeof details === "string"
			? details
			: details
				? JSON.stringify(details)
				: "None provided"
	return {
		message: String(message || "No error reported"),
		detailText,
		format: parsed ? "JSON" : "Plain text",
	}
}

module.exports = {
	responseHooks: [
		(response) => {
			if (response.status < 400) return response
			const result = inspect(response)
			return {
				...response,
				headers: {
					...response.headers,
					"x-consolio-error-summary": result.message.slice(0, 240),
				},
			}
		},
	],
	paneTabs: {
		response: [
			{
				id: "errors",
				label: "Errors",
				render: ({ response }) => {
					const result = inspect(response)
					return {
						kind: "table",
						rows: [
							{ label: "Status", value: response.status },
							{ label: "Format", value: result.format },
							{ label: "Summary", value: result.message },
							{ label: "Details", value: result.detailText },
							{
								label: "Why it helps",
								value:
									"Surface the actionable API error before scanning the complete response",
							},
						],
					}
				},
			},
		],
	},
}
