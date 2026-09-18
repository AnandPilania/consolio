const REQUIRED_HEADERS = [
    ['content-security-policy', 'Content-Security-Policy'],
    ['x-content-type-options', 'X-Content-Type-Options'],
    ['x-frame-options', 'X-Frame-Options'],
    ['referrer-policy', 'Referrer-Policy'],
    ['permissions-policy', 'Permissions-Policy'],
]

function audit(response) {
    const headers = response.headers || {}
    const missing = REQUIRED_HEADERS.filter(([key]) => !headers[key]).map(([, label]) => label)
    return { missing, checked: REQUIRED_HEADERS.length }
}

module.exports = {
    responseHooks: [
        (response) => {
            const { missing } = audit(response)
            if (!missing.length) return response
            return {
                ...response,
                headers: {
                    ...response.headers,
                    'x-consolio-security-warning': `missing: ${missing.join(', ')}`,
                },
            }
        },
    ],
    paneTabs: {
        response: [{
            id: 'security',
            label: 'Security',
            render: ({ response }) => {
                const { missing, checked } = audit(response)
                return {
                    kind: 'table',
                    rows: [
                        { label: 'Headers checked', value: checked },
                        { label: 'Result', value: missing.length ? `${missing.length} missing` : 'All checks passed' },
                        { label: 'Missing', value: missing.length ? missing.join(', ') : 'None' },
                        { label: 'Why it helps', value: 'Find browser-facing security gaps before they reach production' },
                    ],
                }
            },
        }],
    },
}
