import { listInstalledPlugins, installPlugin, installBundledPlugin, listBundledPlugins, uninstallPlugin, setPluginEnabled, isValidPackageName, loadEnabledPlugins, listPaneTabs, renderPaneTab } from '../plugins/loader.js';

export async function pluginRoutes(fastify, { storage }) {
    fastify.get('/api/plugins', async () => listInstalledPlugins(storage));

    fastify.get('/api/plugins/bundled', async () => listBundledPlugins());

    fastify.get('/api/plugins/ui', async () => listPaneTabs(await loadEnabledPlugins(storage)));

    fastify.post('/api/plugins/ui/render', async (req, reply) => {
        const { pane, plugin, id, context } = req.body || {};
        if (!['request', 'response'].includes(pane) || typeof plugin !== 'string' || typeof id !== 'string') {
            return reply.status(400).send({ error: 'Invalid plugin tab' });
        }
        try {
            return await renderPaneTab(await loadEnabledPlugins(storage), { pane, plugin, id, context });
        } catch (e) {
            return reply.status(404).send({ error: e.message });
        }
    });

    fastify.post('/api/plugins/bundled', async (req, reply) => {
        try {
            return await installBundledPlugin(storage, req.body?.dir);
        } catch (e) {
            return reply.status(400).send({ error: e.message });
        }
    });

    fastify.post('/api/plugins', async (req, reply) => {
        const name = req.body?.name?.trim();
        if (!isValidPackageName(name)) return reply.status(400).send({ error: 'Invalid package name' });
        try {
            return await installPlugin(storage, name);
        } catch (e) {
            return reply.status(500).send({ error: `npm install failed: ${e.message}` });
        }
    });

    fastify.delete('/api/plugins/*', async (req, reply) => {
        const name = req.params['*'];
        if (!isValidPackageName(name)) return reply.status(400).send({ error: 'Invalid package name' });
        try {
            await uninstallPlugin(storage, name);
            return { uninstalled: true };
        } catch (e) {
            return reply.status(500).send({ error: `npm uninstall failed: ${e.message}` });
        }
    });

    fastify.put('/api/plugins/*', async (req, reply) => {
        const name = req.params['*'];
        if (!isValidPackageName(name)) return reply.status(400).send({ error: 'Invalid package name' });
        setPluginEnabled(storage, name, req.body?.enabled !== false);
        return { name, enabled: req.body?.enabled !== false };
    });
}
