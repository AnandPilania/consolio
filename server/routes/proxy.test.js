import assert from 'node:assert';
import http from 'node:http';
import { executeRequest } from './proxy.js';

const storage = { consolioDir: process.cwd(), getConfig: () => ({ settings: {} }) };

// apikey auth with placement 'query' appends key=value to the request URL
{
    let receivedUrl;
    const server = http.createServer((req, res) => { receivedUrl = req.url; res.end('ok'); });
    await new Promise(r => server.listen(0, r));
    const { port } = server.address();

    const { httpStatus } = await executeRequest({
        method: 'GET',
        url: `http://127.0.0.1:${port}/path`,
        auth: { type: 'apikey', key: 'api_key', value: 'secret123', placement: 'query' },
        saveToHistory: false
    }, { storage });

    assert.strictEqual(httpStatus, 200);
    assert.ok(receivedUrl.includes('api_key=secret123'), `expected query param in ${receivedUrl}`);
    server.close();
}

// apikey auth with placement 'header' still sets the header (no regression)
{
    let receivedHeader;
    const server = http.createServer((req, res) => { receivedHeader = req.headers['api_key']; res.end('ok'); });
    await new Promise(r => server.listen(0, r));
    const { port } = server.address();

    await executeRequest({
        method: 'GET',
        url: `http://127.0.0.1:${port}/path`,
        auth: { type: 'apikey', key: 'api_key', value: 'secret123', placement: 'header' },
        saveToHistory: false
    }, { storage });

    assert.strictEqual(receivedHeader, 'secret123');
    server.close();
}

console.log('proxy.test.js: all checks passed');
