import { randomUUID } from 'crypto';
import { scoreCollection } from '../scoring.js';
import { suggestFixes, callAnthropic } from '../ai-suggest.js';

export async function collectionRoutes(fastify, { storage }) {
    fastify.get('/api/collections', async () => storage.listCollections());

    fastify.get('/api/collections/:id/score', async (req, reply) => {
        const col = storage.getCollection(req.params.id);
        if (!col) return reply.status(404).send({ error: 'Collection not found' });
        return scoreCollection(col);
    });

    fastify.post('/api/collections', async (req, reply) => {
        const { name, description = '' } = req.body;
        if (!name) return reply.status(400).send({ error: 'Name is required' });
        const col = { id: `col_${randomUUID().slice(0, 8)}`, name, description, created: new Date().toISOString(), requests: [] };
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

    function buildRequest(body) {
        return {
            id: `req_${randomUUID().slice(0, 8)}`,
            name: body.name || 'New Request',
            description: body.description || '',
            method: body.method || 'GET',
            url: body.url || '',
            headers: body.headers || [],
            params: body.params || [],
            body: body.body || { type: 'none', content: '' },
            auth: body.auth || { type: 'none' },
            preScript: body.preScript || '',
            postScript: body.postScript || '',
            tests: body.tests || [],
            folderId: body.folderId || null,
            created: new Date().toISOString()
        };
    }

    fastify.post('/api/collections/:id/requests', async (req, reply) => {
        const col = storage.getCollection(req.params.id);
        if (!col) return reply.status(404).send({ error: 'Collection not found' });
        const request = buildRequest(req.body);
        col.requests.push(request);
        storage.saveCollection(col);
        return request;
    });

    fastify.post('/api/collections/:id/requests/bulk', async (req, reply) => {
        const col = storage.getCollection(req.params.id);
        if (!col) return reply.status(404).send({ error: 'Collection not found' });
        const created = (req.body.requests || []).map(buildRequest);
        col.requests.push(...created);
        storage.saveCollection(col);
        return created;
    });

    fastify.post('/api/collections/:colId/requests/:reqId/ai-suggest', async (req, reply) => {
        const { apiKey, model } = req.body || {};
        if (!apiKey) return reply.status(400).send({ error: 'apiKey is required — this feature is bring-your-own-key' });

        const col = storage.getCollection(req.params.colId);
        if (!col) return reply.status(404).send({ error: 'Collection not found' });
        const request = (col.requests || []).find(r => r.id === req.params.reqId);
        if (!request) return reply.status(404).send({ error: 'Request not found' });

        const lastEntry = storage.getAllHistory().find(h => h.requestId === request.id);

        try {
            const suggestion = await suggestFixes(
                request,
                lastEntry?.response || null,
                (prompt) => callAnthropic({ apiKey, model, prompt })
            );
            return suggestion;
        } catch (e) {
            return reply.status(502).send({ error: e.message });
        }
    });

    fastify.get('/api/collections/:id/mcp-manifest', async (req, reply) => {
        const col = storage.getCollection(req.params.id);
        if (!col) return reply.status(404).send({ error: 'Collection not found' });
        if (!col.requests?.length) return { tools: [], command: null };

        const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
        const { registerCollectionTools } = await import('../mcpServer.js');
        const previewServer = new McpServer({ name: 'preview', version: '0.0.0' });
        const registered = registerCollectionTools(previewServer, col, { storage });

        const tools = registered.map(r => {
            const request = col.requests.find(req2 => req2.id === r.requestId);
            return { name: r.toolName, method: request?.method, url: request?.url, description: request?.description || '' };
        });

        const configSnippet = {
            mcpServers: {
                [`consolio-${col.name.toLowerCase().replace(/\s+/g, '-')}`]: {
                    command: 'npx',
                    args: ['consolio', 'mcp', 'serve', col.id, '--project', storage.projectPath],
                },
            },
        };

        return { tools, configSnippet };
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
        col.requests = order.map(entry => {
            const id = typeof entry === 'string' ? entry : entry.id;
            const r = col.requests.find(r => r.id === id);
            if (!r) return null;
            if (typeof entry === 'object' && 'folderId' in entry) r.folderId = entry.folderId;
            return r;
        }).filter(Boolean);
        storage.saveCollection(col);
        return col;
    });

    fastify.post('/api/collections/:id/folders', async (req, reply) => {
        const col = storage.getCollection(req.params.id);
        if (!col) return reply.status(404).send({ error: 'Collection not found' });
        if (!req.body.name) return reply.status(400).send({ error: 'Name is required' });
        const folder = { id: `fld_${randomUUID().slice(0, 8)}`, name: req.body.name, parentId: req.body.parentId || null };
        col.folders = [...(col.folders || []), folder];
        storage.saveCollection(col);
        return folder;
    });

    fastify.put('/api/collections/:id/folders/:folderId', async (req, reply) => {
        const col = storage.getCollection(req.params.id);
        if (!col) return reply.status(404).send({ error: 'Collection not found' });
        const idx = (col.folders || []).findIndex(f => f.id === req.params.folderId);
        if (idx === -1) return reply.status(404).send({ error: 'Folder not found' });
        col.folders[idx] = { ...col.folders[idx], ...req.body, id: req.params.folderId };
        storage.saveCollection(col);
        return col.folders[idx];
    });

    fastify.delete('/api/collections/:id/folders/:folderId', async (req, reply) => {
        const col = storage.getCollection(req.params.id);
        if (!col) return reply.status(404).send({ error: 'Collection not found' });
        const { folderId } = req.params;
        col.folders = (col.folders || []).filter(f => f.id !== folderId)
            .map(f => f.parentId === folderId ? { ...f, parentId: null } : f);
        col.requests = col.requests.map(r => r.folderId === folderId ? { ...r, folderId: null } : r);
        storage.saveCollection(col);
        return { deleted: true };
    });
}
