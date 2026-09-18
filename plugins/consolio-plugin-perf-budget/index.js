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
    paneTabs: {
        response: [{
            id: 'budget',
            label: 'Budget',
            render: ({ response }) => ({
                kind: 'table',
                rows: [
                    { label: 'Elapsed', value: `${response.elapsed ?? 0} ms` },
                    { label: 'Budget', value: `${BUDGET_MS} ms` },
                    { label: 'Result', value: response.elapsed > BUDGET_MS ? 'Over budget' : 'Within budget' },
                    { label: 'Why it helps', value: 'Makes latency regressions visible during endpoint testing' },
                ],
            }),
        }],
    },
}
