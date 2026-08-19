import Fastify from 'fastify';
import cors from '@fastify/cors';
import staticFiles from '@fastify/static';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import chalk from 'chalk';

import { consolioStorage } from './storage.js';
import { proxyRoutes } from './routes/proxy.js';
import { collectionRoutes } from './routes/collections.js';
import { environmentRoutes, historyRoutes, configRoutes } from './routes/environments.js';
import { versionRoutes, getLatestVersion } from './routes/version.js';
import { mockRoutes } from './routes/mocks.js';
import { pluginRoutes } from './routes/plugins.js';
import { handleWsProxyConnection, handleWsProxyMessage } from './wsProxy.js';
import { handleSseProxyConnection, handleSseProxyMessage } from './sseProxy.js';
import { handleSocketIoProxyConnection, handleSocketIoProxyMessage } from './socketioProxy.js';
import { handleGrpcProxyConnection, handleGrpcProxyMessage } from './grpcProxy.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));

export async function startServer({ port = 4242, autoOpen = true, projectPath = process.cwd() } = {}) {
    const storage = new consolioStorage(projectPath);

    const isDev = process.env.CONSOLIO_DEV === 'true';

    const fastify = Fastify({
        logger: false,
        // Raise Fastify's default 1MB JSON body limit so multipart file uploads
        // (sent as base64 inside the /api/execute JSON payload) aren't rejected.
        // Base64 inflates size ~33%, so 50MB here comfortably covers ~35MB source files.
        bodyLimit: 50 * 1024 * 1024 // 50MB
    });

    // The UI's apiFetch() helper always sends Content-Type: application/json, even for
    // body-less calls (e.g. POST /api/mocks/:id/start) — Fastify's default JSON parser
    // rejects an empty body under that content-type, so treat empty as {} instead of 400ing.
    fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
        if (!body) return done(null, undefined);
        try { done(null, JSON.parse(body)); } catch (err) { done(err); }
    });

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

        if (type?.startsWith('ws-proxy:')) {
            const tabId = type.slice('ws-proxy:'.length);
            handleWsProxyConnection(ws, wss, tabId);
            ws.on('message', (data) => handleWsProxyMessage(ws, wss, tabId, data.toString()));
            return;
        }

        if (type?.startsWith('sse-proxy:')) {
            const tabId = type.slice('sse-proxy:'.length);
            handleSseProxyConnection(ws, wss, tabId);
            ws.on('message', (data) => handleSseProxyMessage(ws, wss, tabId, data.toString()));
            return;
        }

        if (type?.startsWith('sio-proxy:')) {
            const tabId = type.slice('sio-proxy:'.length);
            handleSocketIoProxyConnection(ws, wss, tabId);
            ws.on('message', (data) => handleSocketIoProxyMessage(ws, wss, tabId, data.toString()));
            return;
        }

        if (type?.startsWith('grpc-proxy:')) {
            const tabId = type.slice('grpc-proxy:'.length);
            handleGrpcProxyConnection(ws, wss, tabId);
            ws.on('message', (data) => handleGrpcProxyMessage(ws, wss, tabId, data.toString()));
            return;
        }

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

    async function gracefulShutdown(signal) {
        console.log(chalk.dim(`\n  Received ${signal}, shutting down gracefully...`));

        wss.close(() => {
            console.log(chalk.dim('  WebSocket server closed'));
        });

        const timeout = setTimeout(() => {
            console.error(chalk.red('  Forced shutdown due to timeout'));
            process.exit(1);
        }, 10000);

        try {
            await fastify.close();
            console.log(chalk.dim('  Fastify server closed'));
            clearTimeout(timeout);
            process.exit(0);
        } catch (err) {
            console.error(chalk.red('  Error during shutdown:'), err);
            process.exit(1);
        }
    }

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

    await fastify.register(proxyRoutes, { storage });
    await fastify.register(collectionRoutes, { storage });
    await fastify.register(environmentRoutes, { storage });
    await fastify.register(historyRoutes, { storage });
    await fastify.register(configRoutes, { storage });
    await fastify.register(versionRoutes);
    await fastify.register(mockRoutes, { storage });
    await fastify.register(pluginRoutes, { storage });

    fastify.post('/api/interceptor/capture', async (req) => {
        const entry = req.body;
        wss.clients.forEach(client => {
            if (client.readyState === 1) client.send(JSON.stringify({ type: 'intercepted', data: entry }));
        });
        return { received: true };
    });

    if (isDev) {
        fastify.get('/', async (req, reply) => reply.redirect('http://localhost:5173'));
        fastify.setNotFoundHandler((req, reply) => {
            if (req.url.startsWith('/api/')) return reply.status(404).send({ error: 'API route not found' });
            reply.redirect(`http://localhost:5173${req.url}`);
        });
    } else {
        await fastify.register(staticFiles, {
            root: join(__dirname, '../dist'),
            prefix: '/',
            wildcard: false,
        });
        fastify.setNotFoundHandler((req, reply) => {
            if (req.url.startsWith('/api/')) return reply.status(404).send({ error: 'API route not found' });
            reply.sendFile('index.html');
        });
    }

    await fastify.listen({ port, host: '127.0.0.1' });

    fastify.server.on('upgrade', (req, socket, head) => {
        if (req.url?.startsWith('/ws')) wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
        else socket.destroy();
    });

    const mode = storage.isProjectMode ? chalk.cyan('Project Mode') : chalk.yellow('Global Mode');
    console.log(`${chalk.green('✔')} consolio API  →  ${chalk.underline.cyan(`http://localhost:${port}`)}`);
    if (isDev) {
        console.log(`${chalk.green('✔')} UI dev server →  ${chalk.underline.cyan('http://localhost:5173')}  ${chalk.dim('(npm run dev:ui)')}`);
    } else {
        console.log(`${chalk.green('✔')} UI            →  ${chalk.underline.cyan(`http://localhost:${port}`)}`);
    }
    console.log(`${chalk.green('✔')} Workspace     →  ${chalk.dim(storage.consolioDir)} ${mode}`);
    console.log('');
    console.log(chalk.dim('  Press Ctrl+C to stop'));
    console.log('');

    if (autoOpen && !isDev) {
        try { const { default: open } = await import('open'); await open(`http://localhost:${port}`); }
        catch { console.log(chalk.dim(`  Open http://localhost:${port} in your browser`)); }
    }


    const info = await getLatestVersion({ timeout: 6000 });
    if (info.updateAvailable) {
        console.log(`Update available: ${info.current} → ${info.latest}`);
    }

    return fastify;
}
