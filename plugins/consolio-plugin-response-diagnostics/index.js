module.exports = {
	paneTabs: {
		response: [
			{
				id: "diagnostics",
				label: "Diagnostics",
				render: ({ response }) => ({
					kind: "table",
					rows: [
						{
							label: "Status",
							value: `${response.status} ${response.statusText || ""}`.trim(),
						},
						{
							label: "Elapsed",
							value: `${response.elapsed ?? 0} ms`,
						},
						{
							label: "Body type",
							value: response.bodyType || "unknown",
						},
						{
							label: "Payload size",
							value: `${response.body?.length || 0} characters`,
						},
						{
							label: "Content type",
							value: response.headers?.["content-type"] || "not provided",
						},
					],
				}),
			},
		],
	},
}
