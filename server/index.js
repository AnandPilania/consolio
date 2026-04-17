import Fastify from 'fastify';
import cors from '@fastify/cors';
import staticFiles from '@fastify/static';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import chalk from 'chalk';

import { consolioStorage } from './storage.js';
import { proxyRoutes } from './routes/proxy.js';
import { collectionRoutes } from './routes/collections.js';
import { environmentRoutes, historyRoutes, configRoutes } from './routes/environments.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function startServer({ port = 4242, autoOpen = true, projectPath = process.cwd() } = {}) {
    const storage = new consolioStorage(projectPath);
    const fastify = Fastify({ logger: false });

    await fastify.register(cors, {
        origin: (origin, cb) => cb(null, true),
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
        credentials: true,
    });

    const wss = new WebSocketServer({ noServer: true });
    wss.on('connection', (ws, req) => {
        const type = new URL(req.url, 'http://localhost').searchParams.get('type');
        ws.consolioType = type;
        ws.on('message', (data) => {
            if (type === 'interceptor') {
                wss.clients.forEach(client => {
                    if (client.consolioType === 'ui' && client.readyState === 1) {
                        client.send(data.toString());
                    }
                });
            }
        });
    });

    await fastify.register(proxyRoutes, { storage });
    await fastify.register(collectionRoutes, { storage });
    await fastify.register(environmentRoutes, { storage });
    await fastify.register(historyRoutes, { storage });
    await fastify.register(configRoutes, { storage });

    fastify.post('/api/interceptor/capture', async (req) => {
        const entry = req.body;
        wss.clients.forEach(client => {
            if (client.readyState === 1) {
                client.send(JSON.stringify({ type: 'intercepted', data: entry }));
            }
        });
        return { received: true };
    });

    await fastify.register(staticFiles, {
        root: join(__dirname, '../ui'),
        prefix: '/',
        wildcard: false
    });

    fastify.setNotFoundHandler((req, reply) => {
        if (req.url.startsWith('/api/')) {
            return reply.status(404).send({ error: 'API route not found' });
        }
        reply.sendFile('index.html');
    });

    await fastify.listen({ port, host: '127.0.0.1' });

    fastify.server.on('upgrade', (req, socket, head) => {
        if (req.url?.startsWith('/ws')) {
            wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
        } else {
            socket.destroy();
        }
    });

    const url = `http://localhost:${port}`;
    const mode = storage.isProjectMode ? chalk.cyan('Project Mode') : chalk.yellow('Global Mode');
    console.log(`${chalk.green('✔')} consolio running at ${chalk.underline.cyan(url)}`);
    console.log(`${chalk.green('✔')} Workspace: ${chalk.dim(storage.consolioDir)} ${mode}`);
    console.log('');
    console.log(chalk.dim('  Press Ctrl+C to stop'));
    console.log('');

    if (autoOpen) {
        try {
            const { default: open } = await import('open');
            await open(url);
        } catch {
            console.log(chalk.dim(`  Open ${url} in your browser`));
        }
    }

    process.on('SIGINT', async () => {
        console.log(chalk.dim('\n  Shutting down consolio...'));
        await fastify.close();
        process.exit(0);
    });

    return fastify;
}
