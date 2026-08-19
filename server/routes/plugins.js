import { listInstalledPlugins, installPlugin, installBundledPlugin, listBundledPlugins, uninstallPlugin, setPluginEnabled, isValidPackageName } from '../plugins/loader.js';

export async function pluginRoutes(fastify, { storage }) {
    fastify.get('/api/plugins', async () => listInstalledPlugins(storage));

    // Bundled plugins ship in examples/ and can be installed with one click — the request
    // only ever supplies a `dir` name, checked against the server's own enumeration of what
    // actually exists there (see installBundledPlugin), so this doesn't reopen the arbitrary-
    // path installs that /api/plugins (below) deliberately blocks.
    fastify.get('/api/plugins/bundled', async () => listBundledPlugins());

    fastify.post('/api/plugins/bundled', async (req, reply) => {
        try {
            return await installBundledPlugin(storage, req.body?.dir);
        } catch (e) {
            return reply.status(400).send({ error: e.message });
        }
    });

    fastify.post('/api/plugins', async (req, reply) => {
        const name = req.body?.name?.trim();
        // Rejects anything outside npm's own package-name charset — this name reaches a
        // shell (see loader.js), and this route is reachable from any origin (open CORS).
        if (!isValidPackageName(name)) return reply.status(400).send({ error: 'Invalid package name' });
        try {
            return await installPlugin(storage, name);
        } catch (e) {
            return reply.status(500).send({ error: `npm install failed: ${e.message}` });
        }
    });

    // Wildcard (not :name) so scoped package names like @scope/pkg — which contain a
    // literal "/" — survive as a single route param instead of being split in two.
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
