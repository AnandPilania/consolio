const { randomUUID } = require('crypto')

module.exports = {
    requestHooks: [
        (request) => {
            const headers = request.headers ? [...request.headers] : []
            const hasOne = headers.some(h => h.enabled !== false && h.key?.toLowerCase() === 'x-request-id')
            if (!hasOne) headers.push({ key: 'X-Request-Id', value: randomUUID(), enabled: true })
            return { ...request, headers }
        },
    ],
    paneTabs: {
        request: [{
            id: 'trace',
            label: 'Trace',
            render: ({ request }) => {
                const traceHeader = (request.headers || []).find(h => h.enabled !== false && h.key?.toLowerCase() === 'x-request-id')
                return {
                    kind: 'table',
                    rows: [
                        { label: 'Trace policy', value: traceHeader ? 'Keeps your existing X-Request-Id' : 'Generates X-Request-Id before send' },
                        { label: 'Header value', value: traceHeader?.value || 'Generated at send time' },
                        { label: 'Why it helps', value: 'Search this ID across gateway, service, and worker logs' },
                    ],
                }
            },
        }],
    },
}
