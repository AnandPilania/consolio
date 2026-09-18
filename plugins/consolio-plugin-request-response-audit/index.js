module.exports = {
    paneTabs: {
        request: [
            {
                id: 'audit-request',
                label: 'Audit',
                render: ({ request }) => ({
                    kind: 'table',
                    rows: [
                        { label: 'Endpoint', value: `${request.method} ${request.url || '(empty)'}` },
                        { label: 'Auth', value: request.auth?.type || 'none' },
                        { label: 'Enabled headers', value: (request.headers || []).filter(h => h.enabled && h.key).length },
                        { label: 'Enabled params', value: (request.params || []).filter(p => p.enabled && p.key).length },
                    ],
                }),
            },
        ],
        response: [
            {
                id: 'audit-response',
                label: 'Audit',
                render: ({ response }) => ({
                    kind: 'table',
                    rows: [
                        { label: 'Result', value: response.status >= 200 && response.status < 400 ? 'Passed' : 'Needs attention' },
                        { label: 'Status', value: response.status },
                        { label: 'Elapsed', value: `${response.elapsed ?? 0} ms` },
                        { label: 'Redirected', value: response.redirected ? 'Yes' : 'No' },
                    ],
                }),
            },
        ],
    },
};
