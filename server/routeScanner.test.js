import assert from 'node:assert';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanProjectRoutes } from './routeScanner.js';

const dir = mkdtempSync(join(tmpdir(), 'consolio-scan-'));

try {
    // Express-style routes in one file
    writeFileSync(join(dir, 'users.js'), `
        const express = require('express');
        const router = express.Router();
        router.get('/users', (req, res) => res.json([]));
        router.get('/users/:id', (req, res) => res.json({}));
        router.post('/users', (req, res) => res.status(201).send());
        router.delete("/users/:id", (req, res) => res.status(204).send());
        module.exports = router;
    `);

    // Fastify object-style route in another file
    writeFileSync(join(dir, 'health.js'), `
        fastify.route({
            method: 'GET',
            url: '/health',
            handler: async () => ({ ok: true }),
        });
    `);

    // NestJS controller in a nested dir
    mkdirSync(join(dir, 'orders'));
    writeFileSync(join(dir, 'orders', 'orders.controller.ts'), `
        @Controller('orders')
        export class OrdersController {
            @Get()
            findAll() {}

            @Get(':id')
            findOne() {}

            @Post()
            create() {}
        }
    `);

    // Should be ignored
    mkdirSync(join(dir, 'node_modules'));
    writeFileSync(join(dir, 'node_modules', 'noise.js'), `router.get('/should-not-appear', () => {})`);

    // Non-source file, should be skipped
    writeFileSync(join(dir, 'README.md'), `router.get('/also-not-appear', () => {})`);

    const result = scanProjectRoutes(dir);

    // Basic shape
    assert.ok(Array.isArray(result.requests));
    assert.ok(Array.isArray(result.folders));
    assert.strictEqual(result.name, 'Discovered Routes');

    const paths = result.requests.map(r => `${r.method} ${r.url}`);

    // Express routes found, :id templated to {{id}}
    assert.ok(paths.includes('GET /users'));
    assert.ok(paths.includes('GET /users/{{id}}'));
    assert.ok(paths.includes('POST /users'));
    assert.ok(paths.includes('DELETE /users/{{id}}'));

    // Fastify object-style route found
    assert.ok(paths.includes('GET /health'));

    // NestJS routes found with controller base path applied
    assert.ok(paths.includes('GET /orders'));
    assert.ok(paths.includes('GET /orders/{{id}}'));
    assert.ok(paths.includes('POST /orders'));

    // node_modules and non-source files excluded
    assert.ok(!paths.some(p => p.includes('should-not-appear')));
    assert.ok(!paths.some(p => p.includes('also-not-appear')));

    // POST/PUT/PATCH default to a JSON body stub; GET/DELETE default to none
    const postUsers = result.requests.find(r => r.method === 'POST' && r.url === 'POST /users' || (r.method === 'POST' && r.url.endsWith('/users')));
    assert.strictEqual(postUsers.body.type, 'json');
    const getUsers = result.requests.find(r => r.method === 'GET' && r.url.endsWith('/users'));
    assert.strictEqual(getUsers.body.type, 'none');

    // Descriptions mention the source file and discovery style
    assert.ok(result.requests[0].description.includes('users.js') || result.requests.some(r => r.description.includes('users.js')));

    // baseUrl option prefixes every discovered path
    const withBase = scanProjectRoutes(dir, { baseUrl: 'http://localhost:3000' });
    assert.ok(withBase.requests.every(r => r.url.startsWith('http://localhost:3000')));

    // De-duplicates identical method+path pairs
    const methodPathPairs = result.requests.map(r => `${r.method} ${r.url}`);
    assert.strictEqual(new Set(methodPathPairs).size, methodPathPairs.length);

    console.log('routeScanner.test.js passed');
} finally {
    rmSync(dir, { recursive: true, force: true });
}
