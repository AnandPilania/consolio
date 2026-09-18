function percentile(sortedNums, p) {
	if (sortedNums.length === 0) return 0
	const idx = Math.min(
		sortedNums.length - 1,
		Math.ceil((p / 100) * sortedNums.length) - 1,
	)
	return sortedNums[Math.max(0, idx)]
}

function summarize(entries) {
	const total = entries.length
	if (total === 0) {
		return {
			totalRequests: 0,
			avgLatencyMs: 0,
			p95LatencyMs: 0,
			errorRate: 0,
			errorCount: 0,
		}
	}
	const latencies = entries
		.map((e) => e.response?.elapsed ?? 0)
		.sort((a, b) => a - b)
	const errorCount = entries.filter(
		(e) => (e.response?.status ?? 0) >= 400,
	).length
	const avg = Math.round(latencies.reduce((s, v) => s + v, 0) / total)
	return {
		totalRequests: total,
		avgLatencyMs: avg,
		p95LatencyMs: percentile(latencies, 95),
		errorRate: Math.round((errorCount / total) * 1000) / 10, // one decimal place, e.g. 3.2
		errorCount,
	}
}

export function buildAnalytics(entries, { collectionId = null } = {}) {
	const scoped = collectionId
		? entries.filter((e) => e.collectionId === collectionId)
		: entries

	const overall = summarize(scoped)

	const byRequest = {}
	for (const e of scoped) {
		if (!e.requestId) continue
		const key = e.requestId
		byRequest[key] = byRequest[key] || {
			requestId: key,
			requestName: e.requestName || e.request?.url || key,
			entries: [],
		}
		byRequest[key].entries.push(e)
	}
	const requestBreakdown = Object.values(byRequest)
		.map(({ requestId, requestName, entries }) => ({
			requestId,
			requestName,
			...summarize(entries),
		}))
		.sort((a, b) => b.totalRequests - a.totalRequests)

	const recentErrors = scoped
		.filter((e) => (e.response?.status ?? 0) >= 400)
		.slice(0, 20)
		.map((e) => ({
			id: e.id,
			timestamp: e.timestamp,
			requestName: e.requestName || e.request?.url,
			method: e.request?.method,
			url: e.request?.url,
			status: e.response?.status,
			statusText: e.response?.statusText,
		}))

	return { ...overall, requestBreakdown, recentErrors }
}
