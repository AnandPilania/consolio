const { randomUUID } = require('crypto')

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

module.exports = {
    requestHooks: [
        (request) => {
            if (!MUTATING_METHODS.has((request.method || '').toUpperCase())) return request
            const headers = request.headers ? [...request.headers] : []
            const hasOne = headers.some(h => h.enabled !== false && h.key?.toLowerCase() === 'idempotency-key')
            if (!hasOne) headers.push({ key: 'Idempotency-Key', value: randomUUID(), enabled: true })
            return { ...request, headers }
        },
    ],
}
