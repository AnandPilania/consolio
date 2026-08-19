import { randomUUID } from 'crypto';
import https from 'https';
import { runScript, runTests } from '../scripting.js';
import { loadEnabledPlugins, runRequestHooks, runResponseHooks, applyTemplateTags } from '../plugins/loader.js';

// Cache one agent per verify mode so we're not constructing a new TLS agent per request.
const agents = {
    verify: new https.Agent({ rejectUnauthorized: true }),
    noVerify: new https.Agent({ rejectUnauthorized: false })
};

function persistEnvVars(storage, environmentId, updates) {
    const env = storage.listEnvironments().find(e => e.id === environmentId);
    if (!env) return;
    const variables = env.variables ? [...env.variables] : [];
    for (const [key, value] of Object.entries(updates)) {
        const existing = variables.find(v => v.key === key);
        if (existing) existing.value = value;
        else variables.push({ key, value, enabled: true });
    }
    storage.saveEnvironment({ ...env, variables });
}

// Core request-execution pipeline: pre-script → send → tests → post-script → persist env vars.
// Returns { httpStatus, payload } so both the /api/execute route and the in-process CLI runner
// (bin/consolio.js) can call this directly without going through HTTP.
export async function executeRequest(reqBody, { storage }) {
    let {
        method = 'GET', url, headers = [], params = [], body,
        auth, timeout = 30000, followRedirects = true,
        saveToHistory = true, environment: envInput = {}, sslVerify,
        preScript = '', postScript = '', tests = [], environmentId
    } = reqBody;

    if (!url) return { httpStatus: 400, payload: { error: 'URL is required' } };

    const hooks = await loadEnabledPlugins(storage);
    ({ method, url, headers, params, body, auth } = await runRequestHooks(hooks, { method, url, headers, params, body, auth }));

    let environment = { ...envInput };
    const scriptModified = {};

    const preResult = runScript(preScript, { envVars: environment, request: { method, url } });
    Object.assign(scriptModified, preResult.modified);
    environment = { ...environment, ...preResult.modified };

    const applyEnv = str => {
        if (!str) return str;
        const resolved = str.replace(/\{\{(\w+)\}\}/g, (_, k) => environment[k] ?? `{{${k}}}`);
        return applyTemplateTags(resolved, hooks.templateTags);
    };

    const resolvedUrl = applyEnv(url);
    const resolvedHeaders = headers.map(h => ({ ...h, value: applyEnv(h.value) }));

    let finalUrl = resolvedUrl;
    const enabledParams = params.filter(p => p.enabled && p.key);
    if (enabledParams.length > 0) {
        const urlObj = new URL(finalUrl.startsWith('http') ? finalUrl : `https://${finalUrl}`);
        enabledParams.forEach(p => urlObj.searchParams.set(p.key, applyEnv(p.value || '')));
        finalUrl = urlObj.toString();
    } else if (!finalUrl.startsWith('http')) {
        finalUrl = `https://${finalUrl}`;
    }

    const headerMap = {};
    resolvedHeaders.filter(h => h.enabled && h.key).forEach(h => { headerMap[h.key] = h.value; });

    if (auth) {
        if (auth.type === 'bearer' && auth.token)
            headerMap['Authorization'] = `Bearer ${applyEnv(auth.token)}`;
        else if (auth.type === 'basic' && auth.username)
            headerMap['Authorization'] = 'Basic ' + Buffer.from(`${applyEnv(auth.username)}:${applyEnv(auth.password || '')}`).toString('base64');
        else if (auth.type === 'apikey' && auth.key && auth.placement === 'header')
            headerMap[auth.key] = applyEnv(auth.value);
        else if (auth.type === 'apikey' && auth.key && auth.placement === 'query') {
            const urlObj = new URL(finalUrl);
            urlObj.searchParams.set(auth.key, applyEnv(auth.value || ''));
            finalUrl = urlObj.toString();
        }
    }

    let fetchBody = undefined;
    if (body && method !== 'GET' && method !== 'HEAD') {
        if ((body.type === 'json' || body.type === 'text') && body.content) {
            fetchBody = body.content;
            if (!headerMap['Content-Type']) headerMap['Content-Type'] = body.type === 'json' ? 'application/json' : 'text/plain';
        } else if (body.type === 'form' && body.fields) {
            const form = new URLSearchParams();
            body.fields.filter(f => f.enabled && f.key).forEach(f => form.append(f.key, applyEnv(f.value || '')));
            fetchBody = form.toString();
            if (!headerMap['Content-Type']) headerMap['Content-Type'] = 'application/x-www-form-urlencoded';
        } else if (body.type === 'multipart' && body.fields) {
            // multipart/form-data — supports text fields and file fields.
            // File fields arrive as { key, type: 'file', enabled, fileName, fileType, fileData }
            // where fileData is a base64 string (no data: prefix) sent by the UI.
            const { FormData: NodeFormData, Blob: NodeBlob } = await import('node-fetch');
            const form = new NodeFormData();
            body.fields.filter(f => f.enabled && f.key).forEach(f => {
                if (f.type === 'file' && f.fileData) {
                    const buf = Buffer.from(f.fileData, 'base64');
                    const blob = new NodeBlob([buf], { type: f.fileType || 'application/octet-stream' });
                    form.append(f.key, blob, f.fileName || 'file');
                } else {
                    form.append(f.key, applyEnv(f.value || ''));
                }
            });
            fetchBody = form;
            // Do NOT set Content-Type manually — node-fetch sets the multipart boundary itself.
            delete headerMap['Content-Type'];
        } else if (body.type === 'raw' && body.content) {
            fetchBody = body.content;
        } else if (body.type === 'graphql') {
            let variables = {};
            if (body.variables?.trim()) {
                try { variables = JSON.parse(applyEnv(body.variables)); }
                catch { /* malformed variables JSON — send the query with no variables rather than failing the request */ }
            }
            fetchBody = JSON.stringify({ query: applyEnv(body.query || ''), variables });
            if (!headerMap['Content-Type']) headerMap['Content-Type'] = 'application/json';
        }
    }

    const startTime = Date.now();
    try {
        const { default: fetch } = await import('node-fetch');
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        // sslVerify: per-request override; falls back to the workspace config default (true unless changed in Settings).
        const shouldVerify = sslVerify !== undefined ? sslVerify : (storage.getConfig().settings?.sslVerify ?? true);
        const agent = finalUrl.startsWith('https:') ? (shouldVerify ? agents.verify : agents.noVerify) : undefined;

        const response = await fetch(finalUrl, {
            method, headers: headerMap, body: fetchBody,
            signal: controller.signal,
            redirect: followRedirects ? 'follow' : 'manual',
            agent
        });
        clearTimeout(timer);
        const elapsed = Date.now() - startTime;

        const contentType = response.headers.get('content-type') || '';
        const rawBytes = await response.arrayBuffer();
        const buffer = Buffer.from(rawBytes);
        const size = buffer.byteLength;

        let responseHeaders = {};
        response.headers.forEach((val, key) => { responseHeaders[key] = val; });

        let bodyType = 'text';
        if (contentType.includes('application/json')) bodyType = 'json';
        else if (contentType.includes('text/html')) bodyType = 'html';
        else if (contentType.includes('image/')) bodyType = 'image';
        else if (contentType.includes('application/xml') || contentType.includes('text/xml')) bodyType = 'xml';

        let responseBody = bodyType === 'image' ? buffer.toString('base64') : buffer.toString('utf8');

        // responseHooks may transform body/headers/bodyType (e.g. decrypt a payload) before
        // tests run and before the UI ever sees it — status/statusText/size aren't hookable,
        // keeping "what actually came back over the wire" honest.
        ({ headers: responseHeaders, body: responseBody, bodyType } = await runResponseHooks(hooks, {
            status: response.status, statusText: response.statusText,
            headers: responseHeaders, body: responseBody, bodyType, elapsed,
        }));

        // FormData instances aren't JSON-serialisable — store a lightweight summary in history instead.
        const historyBody = (body?.type === 'multipart')
            ? {
                type: 'multipart', fields: body.fields.map(f => f.type === 'file'
                    ? { key: f.key, type: 'file', fileName: f.fileName, fileType: f.fileType }
                    : f)
            }
            : fetchBody;

        const historyEntry = {
            id: `h_${Date.now()}_${randomUUID().slice(0, 6)}`,
            timestamp: new Date().toISOString(),
            request: { method, url: finalUrl, headers: headerMap, body: historyBody },
            response: { status: response.status, statusText: response.statusText, headers: responseHeaders, body: responseBody, bodyType, size, elapsed }
        };
        if (saveToHistory) storage.addHistory(historyEntry);

        const responseForScripts = { status: response.status, headers: responseHeaders, body: responseBody, elapsed };
        const testResults = runTests(tests, responseForScripts);
        const postResult = runScript(postScript, { envVars: environment, request: { method, url }, response: responseForScripts });
        Object.assign(scriptModified, postResult.modified);
        environment = { ...environment, ...postResult.modified };

        if (environmentId && Object.keys(scriptModified).length) {
            persistEnvVars(storage, environmentId, scriptModified);
        }

        return {
            httpStatus: 200,
            payload: {
                status: response.status, statusText: response.statusText,
                headers: responseHeaders, body: responseBody, bodyType, size, elapsed,
                redirected: response.redirected, finalUrl: response.url,
                historyId: historyEntry.id,
                preLogs: preResult.logs, preScriptError: preResult.error,
                postLogs: postResult.logs, postScriptError: postResult.error,
                testResults, environment
            }
        };

    } catch (err) {
        const elapsed = Date.now() - startTime;
        const isTimeout = err.name === 'AbortError';
        return {
            httpStatus: 502,
            payload: {
                error: isTimeout ? 'Request timed out' : err.message,
                code: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
                preLogs: preResult.logs, preScriptError: preResult.error,
                elapsed
            }
        };
    }
}

export async function proxyRoutes(fastify, { storage }) {
    fastify.post('/api/execute', async (req, reply) => {
        const { httpStatus, payload } = await executeRequest(req.body, { storage });
        return reply.status(httpStatus).send(payload);
    });
}
