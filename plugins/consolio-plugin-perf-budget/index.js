const BUDGET_MS = 1000

module.exports = {
    responseHooks: [
        (response) => {
            if (response.elapsed <= BUDGET_MS) return response
            return {
                ...response,
                headers: { ...response.headers, 'x-consolio-perf-warning': `slow response: ${response.elapsed}ms exceeds ${BUDGET_MS}ms budget` },
            }
        },
    ],
}
