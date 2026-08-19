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
}
