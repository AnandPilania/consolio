import { randomUUID } from 'crypto';

export async function collectionRoutes(fastify, { storage }) {
  // List all collections
  fastify.get('/api/collections', async () => storage.listCollections());

  // Create collection
  fastify.post('/api/collections', async (req, reply) => {
    const { name, description = '' } = req.body;
    if (!name) return reply.status(400).send({ error: 'Name is required' });
    const col = {
      id: `col_${randomUUID().slice(0, 8)}`,
      name, description,
      created: new Date().toISOString(),
      requests: []
    };
    return storage.saveCollection(col);
  });

  // Update collection
  fastify.put('/api/collections/:id', async (req, reply) => {
    const col = storage.getCollection(req.params.id);
    if (!col) return reply.status(404).send({ error: 'Collection not found' });
    const updated = { ...col, ...req.body, id: col.id, requests: col.requests };
    return storage.saveCollection(updated);
  });

  // Delete collection
  fastify.delete('/api/collections/:id', async (req, reply) => {
    storage.deleteCollection(req.params.id);
    return { deleted: true };
  });

  // Add request to collection
  fastify.post('/api/collections/:id/requests', async (req, reply) => {
    const col = storage.getCollection(req.params.id);
    if (!col) return reply.status(404).send({ error: 'Collection not found' });
    const request = {
      id: `req_${randomUUID().slice(0, 8)}`,
      name: req.body.name || 'New Request',
      method: req.body.method || 'GET',
      url: req.body.url || '',
      headers: req.body.headers || [],
      params: req.body.params || [],
      body: req.body.body || { type: 'none', content: '' },
      auth: req.body.auth || { type: 'none' },
      created: new Date().toISOString()
    };
    col.requests.push(request);
    storage.saveCollection(col);
    return request;
  });

  // Update request in collection
  fastify.put('/api/collections/:colId/requests/:reqId', async (req, reply) => {
    const col = storage.getCollection(req.params.colId);
    if (!col) return reply.status(404).send({ error: 'Collection not found' });
    const idx = col.requests.findIndex(r => r.id === req.params.reqId);
    if (idx === -1) return reply.status(404).send({ error: 'Request not found' });
    col.requests[idx] = { ...col.requests[idx], ...req.body, id: req.params.reqId };
    storage.saveCollection(col);
    return col.requests[idx];
  });

  // Delete request from collection
  fastify.delete('/api/collections/:colId/requests/:reqId', async (req, reply) => {
    const col = storage.getCollection(req.params.colId);
    if (!col) return reply.status(404).send({ error: 'Collection not found' });
    col.requests = col.requests.filter(r => r.id !== req.params.reqId);
    storage.saveCollection(col);
    return { deleted: true };
  });

  // Reorder requests
  fastify.patch('/api/collections/:id/reorder', async (req, reply) => {
    const col = storage.getCollection(req.params.id);
    if (!col) return reply.status(404).send({ error: 'Collection not found' });
    const { order } = req.body; // array of request IDs
    col.requests = order.map(id => col.requests.find(r => r.id === id)).filter(Boolean);
    storage.saveCollection(col);
    return col;
  });
}
