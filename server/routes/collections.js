import { randomUUID } from 'crypto';

export async function collectionRoutes(fastify, { storage }) {
    fastify.get('/api/collections', async () => storage.listCollections());

    fastify.post('/api/collections', async (req, reply) => {
        const { name, description = '' } = req.body;
        if (!name) return reply.status(400).send({ error: 'Name is required' });
        const col = { id: `col_${randomUUID().slice(0,8)}`, name, description, created: new Date().toISOString(), requests: [] };
        return storage.saveCollection(col);
    });

    fastify.put('/api/collections/:id', async (req, reply) => {
        const col = storage.getCollection(req.params.id);
        if (!col) return reply.status(404).send({ error: 'Collection not found' });
        return storage.saveCollection({ ...col, ...req.body, id: col.id, requests: col.requests });
    });

    fastify.delete('/api/collections/:id', async (req) => {
        storage.deleteCollection(req.params.id);
        return { deleted: true };
    });

    fastify.post('/api/collections/:id/requests', async (req, reply) => {
        const col = storage.getCollection(req.params.id);
        if (!col) return reply.status(404).send({ error: 'Collection not found' });
        const request = {
            id: `req_${randomUUID().slice(0,8)}`,
            name:       req.body.name       || 'New Request',
            method:     req.body.method     || 'GET',
            url:        req.body.url        || '',
            headers:    req.body.headers    || [],
            params:     req.body.params     || [],
            body:       req.body.body       || { type: 'none', content: '' },
            auth:       req.body.auth       || { type: 'none' },
            preScript:  req.body.preScript  || '',
            postScript: req.body.postScript || '',
            tests:      req.body.tests      || [],
            created:    new Date().toISOString()
        };
        col.requests.push(request);
        storage.saveCollection(col);
        return request;
    });

    fastify.put('/api/collections/:colId/requests/:reqId', async (req, reply) => {
        const col = storage.getCollection(req.params.colId);
        if (!col) return reply.status(404).send({ error: 'Collection not found' });
        const idx = col.requests.findIndex(r => r.id === req.params.reqId);
        if (idx === -1) return reply.status(404).send({ error: 'Request not found' });
        col.requests[idx] = { ...col.requests[idx], ...req.body, id: req.params.reqId };
        storage.saveCollection(col);
        return col.requests[idx];
    });

    fastify.delete('/api/collections/:colId/requests/:reqId', async (req, reply) => {
        const col = storage.getCollection(req.params.colId);
        if (!col) return reply.status(404).send({ error: 'Collection not found' });
        col.requests = col.requests.filter(r => r.id !== req.params.reqId);
        storage.saveCollection(col);
        return { deleted: true };
    });

    fastify.patch('/api/collections/:id/reorder', async (req, reply) => {
        const col = storage.getCollection(req.params.id);
        if (!col) return reply.status(404).send({ error: 'Collection not found' });
        const { order } = req.body;
        col.requests = order.map(id => col.requests.find(r => r.id === id)).filter(Boolean);
        storage.saveCollection(col);
        return col;
    });
}
