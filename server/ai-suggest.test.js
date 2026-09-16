import assert from 'node:assert';
import http from 'node:http';
import { suggestFixes, callProvider, callAnthropic, callOpenAICompatible, callOllama } from './ai-suggest.js';

const sampleRequest = {
    method: 'GET', url: 'https://api.example.com/users/{{id}}',
    headers: [{ key: 'Authorization', value: '{{TOKEN}}', enabled: true }],
    params: [], tests: [],
};

// suggestFixes: requires an explicit callModel function — never calls out on its own
{
    await assert.rejects(() => suggestFixes(sampleRequest, null, undefined), /AI provider call is required/);
}

// suggestFixes: parses a well-formed JSON response from the model into description + tests
{
    const fakeModel = async () => JSON.stringify({
        description: 'Fetches a single user by id.',
        tests: [{ type: 'status', value: '200' }, { type: 'body_not_empty' }],
    });
    const result = await suggestFixes(sampleRequest, { status: 200, body: '{"id":1}' }, fakeModel);
    assert.strictEqual(result.description, 'Fetches a single user by id.');
    assert.strictEqual(result.tests.length, 2);
    assert.strictEqual(result.tests[0].type, 'status');
    assert.strictEqual(result.tests[0].value, '200');
}

// suggestFixes: strips markdown code fences some models wrap JSON in
{
    const fakeModel = async () => '```json\n{"description":"desc","tests":[]}\n```';
    const result = await suggestFixes(sampleRequest, null, fakeModel);
    assert.strictEqual(result.description, 'desc');
    assert.deepStrictEqual(result.tests, []);
}

// suggestFixes: malformed shape (missing fields) throws rather than silently returning junk
{
    const fakeModel = async () => JSON.stringify({ notDescription: 'x' });
    await assert.rejects(() => suggestFixes(sampleRequest, null, fakeModel), /Malformed AI response shape/);
}

// suggestFixes: the prompt passed to the model includes the method/url so callers could assert on it
{
    let capturedPrompt;
    const fakeModel = async (prompt) => { capturedPrompt = prompt; return '{"description":"d","tests":[]}'; };
    await suggestFixes(sampleRequest, null, fakeModel);
    assert.ok(capturedPrompt.includes('GET https://api.example.com/users/{{id}}'));
}

// callProvider: dispatches to the right caller by name, and rejects unknown providers
{
    await assert.rejects(() => callProvider('not-a-real-provider', {}), /Unknown AI provider/);
}

// callAnthropic: sends the Anthropic Messages API shape (x-api-key header, /v1/messages path)
// and parses the {content:[{type:'text',...}]} response shape back into plain text.
{
    let capturedHeaders, capturedBody, capturedPath;
    const server = http.createServer((req, res) => {
        capturedPath = req.url;
        capturedHeaders = req.headers;
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            capturedBody = JSON.parse(body);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ content: [{ type: 'text', text: 'hello from anthropic' }] }));
        });
    });
    await new Promise(r => server.listen(0, r));
    const { port } = server.address();

    const text = await callAnthropic({ apiKey: 'sk-ant-test', model: 'claude-sonnet-4-6', prompt: 'hi', baseUrl: `http://127.0.0.1:${port}` });
    assert.strictEqual(text, 'hello from anthropic');
    assert.strictEqual(capturedPath, '/v1/messages');
    assert.strictEqual(capturedHeaders['x-api-key'], 'sk-ant-test');
    assert.strictEqual(capturedHeaders['anthropic-version'], '2023-06-01');
    assert.strictEqual(capturedBody.model, 'claude-sonnet-4-6');
    server.close();
}

// callAnthropic: requires an apiKey (Anthropic has no keyless local mode)
{
    await assert.rejects(() => callAnthropic({ prompt: 'hi' }), /API key is required/);
}

// callOpenAICompatible: sends Bearer + api-key headers (covers both plain OpenAI-style auth
// and Azure OpenAI's header) and parses the choices[0].message.content response shape.
// Also verifies this same path works for Azure OpenAI (arbitrary baseUrl) and for Ollama's
// OpenAI-compat endpoint (baseUrl ending in /v1, no key needed).
{
    let capturedHeaders, capturedBody, capturedPath;
    const server = http.createServer((req, res) => {
        capturedPath = req.url;
        capturedHeaders = req.headers;
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            capturedBody = JSON.parse(body);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ choices: [{ message: { content: 'hello from openai-compatible' } }] }));
        });
    });
    await new Promise(r => server.listen(0, r));
    const { port } = server.address();

    const text = await callOpenAICompatible({ apiKey: 'sk-test', model: 'gpt-4o-mini', prompt: 'hi', baseUrl: `http://127.0.0.1:${port}/v1` });
    assert.strictEqual(text, 'hello from openai-compatible');
    assert.strictEqual(capturedPath, '/v1/chat/completions');
    assert.strictEqual(capturedHeaders['authorization'], 'Bearer sk-test');
    assert.strictEqual(capturedHeaders['api-key'], 'sk-test'); // Azure OpenAI's header
    assert.strictEqual(capturedBody.model, 'gpt-4o-mini');
    server.close();
}

// callOpenAICompatible: apiKey is optional (many local/self-hosted servers, incl. Ollama's
// /v1 endpoint, don't require one) — no Authorization header sent when omitted.
{
    let capturedHeaders;
    const server = http.createServer((req, res) => {
        capturedHeaders = req.headers;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
    });
    await new Promise(r => server.listen(0, r));
    const { port } = server.address();

    await callOpenAICompatible({ model: 'llama3.1', prompt: 'hi', baseUrl: `http://127.0.0.1:${port}/v1` });
    assert.strictEqual(capturedHeaders['authorization'], undefined);
    server.close();
}

// callOpenAICompatible: requires baseUrl and model (no implicit default endpoint/model)
{
    await assert.rejects(() => callOpenAICompatible({ prompt: 'hi', model: 'x' }), /baseUrl is required/);
    await assert.rejects(() => callOpenAICompatible({ prompt: 'hi', baseUrl: 'http://x' }), /model is required/);
}

// callOllama: sends the native Ollama /api/chat shape and parses message.content
{
    let capturedBody, capturedPath;
    const server = http.createServer((req, res) => {
        capturedPath = req.url;
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            capturedBody = JSON.parse(body);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: { content: 'hello from ollama' } }));
        });
    });
    await new Promise(r => server.listen(0, r));
    const { port } = server.address();

    const text = await callOllama({ model: 'llama3.1', prompt: 'hi', baseUrl: `http://127.0.0.1:${port}` });
    assert.strictEqual(text, 'hello from ollama');
    assert.strictEqual(capturedPath, '/api/chat');
    assert.strictEqual(capturedBody.model, 'llama3.1');
    assert.strictEqual(capturedBody.stream, false);
    server.close();
}

// callOllama: defaults to localhost:11434 but requires an explicit model (no bundled default)
{
    await assert.rejects(() => callOllama({ prompt: 'hi' }), /model is required/);
}

console.log('ai-suggest.test.js passed');
