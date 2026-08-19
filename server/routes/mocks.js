import { randomUUID } from 'crypto';
import Fastify from 'fastify';

// mockId -> { fastify, port } — one lightweight Fastify instance per started mock set.
const runningMocks = new Map();

function applyTemplate(str, vars) {
    if (typeof str !== 'string') return str;
    return str.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

function applyTemplateDeep(value, vars) {
    if (typeof value === 'string') return applyTemplate(value, vars);
    if (Array.isArray(value)) return value.map(v => applyTemplateDeep(v, vars));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, applyTemplateDeep(v, vars)]));
    return value;
}

async function startMock(mock) {
    const app = Fastify({ logger: false });
    (mock.routes || []).forEach(route => {
        app.route({
            method: (route.method || 'GET').toUpperCase(),
            url: route.path,
            handler: async (req, reply) => {
                if (route.delayMs) await new Promise(r => setTimeout(r, route.delayMs));
                // {{name}} in headers/body resolves against path params first, then query string.
                const vars = { ...req.query, ...req.params };

                reply.status(route.statusCode || 200);
                (route.headers || []).filter(h => h.enabled !== false && h.key).forEach(h => {
                    reply.header(h.key, applyTemplate(h.value, vars));
                });

                const raw = route.body || '';
                try {
                    // Templating a parsed JSON body preserves types (numbers/booleans stay
                    // non-strings); only falls back to raw string templating for non-JSON bodies.
                    const parsed = JSON.parse(raw);
                    if (!reply.getHeader('content-type')) reply.header('Content-Type', 'application/json');
                    return reply.send(JSON.stringify(applyTemplateDeep(parsed, vars)));
                } catch {
                    return reply.send(applyTemplate(raw, vars));
                }
            },
        });
    });
    await app.listen({ port: mock.port, host: '127.0.0.1' });
    runningMocks.set(mock.id, { fastify: app, port: mock.port });
}

async function stopMock(mockId) {
    const running = runningMocks.get(mockId);
    if (running) {
        await running.fastify.close();
        runningMocks.delete(mockId);
    }
}

export async function mockRoutes(fastify, { storage }) {
    fastify.get('/api/mocks', async () =>
        storage.listMocks().map(m => ({ ...m, running: runningMocks.has(m.id) }))
    );

    fastify.post('/api/mocks', async (req, reply) => {
        const { name, port } = req.body;
        if (!name || !port) return reply.status(400).send({ error: 'Name and port are required' });
        const mock = {
            id: `mock_${randomUUID().slice(0, 8)}`, name, port: parseInt(port),
            routes: req.body.routes || [], created: new Date().toISOString(),
        };
        return storage.saveMock(mock);
    });

    fastify.put('/api/mocks/:id', async (req, reply) => {
        const mock = storage.getMock(req.params.id);
        if (!mock) return reply.status(404).send({ error: 'Mock not found' });
        const updated = { ...mock, ...req.body, id: mock.id };
        storage.saveMock(updated);
        if (runningMocks.has(mock.id)) {
            await stopMock(mock.id);
            await startMock(updated);
        }
        return updated;
    });

    fastify.delete('/api/mocks/:id', async (req) => {
        await stopMock(req.params.id);
        storage.deleteMock(req.params.id);
        return { deleted: true };
    });

    fastify.post('/api/mocks/:id/start', async (req, reply) => {
        const mock = storage.getMock(req.params.id);
        if (!mock) return reply.status(404).send({ error: 'Mock not found' });
        if (runningMocks.has(mock.id)) return { running: true, port: mock.port };
        try {
            await startMock(mock);
            return { running: true, port: mock.port };
        } catch (e) {
            return reply.status(500).send({ error: e.message });
        }
    });

    fastify.post('/api/mocks/:id/stop', async (req) => {
        await stopMock(req.params.id);
        return { running: false };
    });
}
