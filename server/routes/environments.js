import { randomUUID } from 'crypto';

export async function environmentRoutes(fastify, { storage }) {
  fastify.get('/api/environments', async () => storage.listEnvironments());

  fastify.post('/api/environments', async (req, reply) => {
    const { name, color = '#6366f1' } = req.body;
    if (!name) return reply.status(400).send({ error: 'Name is required' });
    const env = {
      id: `env_${randomUUID().slice(0, 8)}`,
      name, color,
      variables: req.body.variables || [],
      created: new Date().toISOString()
    };
    return storage.saveEnvironment(env);
  });

  fastify.put('/api/environments/:id', async (req, reply) => {
    const envs = storage.listEnvironments();
    const env = envs.find(e => e.id === req.params.id);
    if (!env) return reply.status(404).send({ error: 'Environment not found' });
    const updated = { ...env, ...req.body, id: env.id };
    return storage.saveEnvironment(updated);
  });

  fastify.delete('/api/environments/:id', async (req, reply) => {
    storage.deleteEnvironment(req.params.id);
    return { deleted: true };
  });
}

export async function historyRoutes(fastify, { storage }) {
  fastify.get('/api/history', async (req) => {
    const limit = parseInt(req.query.limit || '50');
    return storage.getHistory(limit);
  });

  fastify.delete('/api/history', async () => {
    storage.clearHistory();
    return { cleared: true };
  });
}

export async function configRoutes(fastify, { storage }) {
  fastify.get('/api/config', async () => {
    const config = storage.getConfig();
    return {
      ...config,
      isProjectMode: storage.isProjectMode,
      projectPath: storage.consolioDir
    };
  });

  fastify.put('/api/config', async (req) => {
    const current = storage.getConfig();
    const updated = { ...current, ...req.body };
    storage.saveConfig(updated);
    return updated;
  });
}
