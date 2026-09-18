module.exports = {
	paneTabs: {
		request: [
			{
				id: "overview",
				label: "Overview",
				render: ({ request }) => ({
					kind: "table",
					rows: [
						{ label: "Method", value: request.method },
						{ label: "URL", value: request.url || "(empty)" },
						{
							label: "Parameters",
							value:
								(request.params || [])
									.filter((p) => p.enabled && p.key)
									.map((p) => p.key)
									.join(", ") || "None",
						},
						{
							label: "Headers",
							value: (request.headers || []).filter((h) => h.enabled && h.key)
								.length,
						},
						{
							label: "Body type",
							value: request.body?.type || "none",
						},
					],
				}),
			},
		],
	},
}
