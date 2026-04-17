import { randomUUID } from 'crypto';

export async function proxyRoutes(fastify, { storage }) {
    fastify.post('/api/execute', async (req, reply) => {
        const {
            method = 'GET', url, headers = [], params = [], body,
            auth, timeout = 30000, followRedirects = true,
            saveToHistory = true, environment = {}
        } = req.body;

        if (!url) return reply.status(400).send({ error: 'URL is required' });

        const applyEnv = str => str ? str.replace(/\{\{(\w+)\}\}/g, (_, k) => environment[k] ?? `{{${k}}}`) : str;

        const resolvedUrl     = applyEnv(url);
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
            } else if (body.type === 'raw' && body.content) {
                fetchBody = body.content;
            }
        }

        const startTime = Date.now();
        try {
            const { default: fetch } = await import('node-fetch');
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(finalUrl, {
                method, headers: headerMap, body: fetchBody,
                signal: controller.signal,
                redirect: followRedirects ? 'follow' : 'manual'
            });
            clearTimeout(timer);
            const elapsed = Date.now() - startTime;

            const contentType = response.headers.get('content-type') || '';
            const rawBytes    = await response.arrayBuffer();
            const buffer      = Buffer.from(rawBytes);
            const size        = buffer.byteLength;

            const responseHeaders = {};
            response.headers.forEach((val, key) => { responseHeaders[key] = val; });

            let bodyType = 'text';
            if (contentType.includes('application/json'))        bodyType = 'json';
            else if (contentType.includes('text/html'))          bodyType = 'html';
            else if (contentType.includes('image/'))             bodyType = 'image';
            else if (contentType.includes('application/xml') || contentType.includes('text/xml')) bodyType = 'xml';

            const responseBody = bodyType === 'image' ? buffer.toString('base64') : buffer.toString('utf8');

            const historyEntry = {
                id: `h_${Date.now()}_${randomUUID().slice(0,6)}`,
                timestamp: new Date().toISOString(),
                request:  { method, url: finalUrl, headers: headerMap, body: fetchBody },
                response: { status: response.status, statusText: response.statusText, headers: responseHeaders, body: responseBody, bodyType, size, elapsed }
            };
            if (saveToHistory) storage.addHistory(historyEntry);

            return reply.send({
                status: response.status, statusText: response.statusText,
                headers: responseHeaders, body: responseBody, bodyType, size, elapsed,
                redirected: response.redirected, finalUrl: response.url,
                historyId: historyEntry.id
            });

        } catch (err) {
            const elapsed  = Date.now() - startTime;
            const isTimeout = err.name === 'AbortError';
            return reply.status(502).send({
                error:   isTimeout ? 'Request timed out' : err.message,
                code:    isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
                elapsed
            });
        }
    });
}
