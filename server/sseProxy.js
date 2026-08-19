import { sendToType } from './wsRelay.js';

// One in-flight streaming fetch per UI tab, same one-per-tab model as wsProxy.js.
const controllers = new Map();

const sendToUi = (wss, tabId, payload) => sendToType(wss, `sse-proxy:${tabId}`, payload);

// SSE framing: events are separated by a blank line; `data:` lines (possibly multiple)
// join with \n, `event:`/`id:` are single-value. Returns parsed events plus whatever
// incomplete trailing text should be carried over into the next chunk.
export function extractEvents(buffer) {
    const normalized = buffer.replace(/\r\n/g, '\n');
    const parts = normalized.split('\n\n');
    const remainder = parts.pop();
    const events = parts
        .map(block => {
            let event = 'message', id, data = [];
            block.split('\n').forEach(line => {
                if (line.startsWith('event:')) event = line.slice(6).trim();
                else if (line.startsWith('data:')) data.push(line.slice(5).trim());
                else if (line.startsWith('id:')) id = line.slice(3).trim();
            });
            return { event, id, data: data.join('\n') };
        })
        .filter(e => e.data !== '');
    return { events, remainder };
}

export function handleSseProxyConnection(ws, wss, tabId) {
    ws.on('close', () => {
        const controller = controllers.get(tabId);
        if (controller) { controller.abort(); controllers.delete(tabId); }
    });
}

export async function handleSseProxyMessage(ws, wss, tabId, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.action === 'connect') {
        const existing = controllers.get(tabId);
        if (existing) existing.abort();
        const controller = new AbortController();
        controllers.set(tabId, controller);

        try {
            const { default: fetch } = await import('node-fetch');
            const res = await fetch(msg.url, {
                headers: { Accept: 'text/event-stream', ...(msg.headers || {}) },
                signal: controller.signal,
            });
            if (!res.ok || !res.body) {
                sendToUi(wss, tabId, { action: 'status', connected: false, error: `HTTP ${res.status} ${res.statusText}` });
                controllers.delete(tabId);
                return;
            }
            sendToUi(wss, tabId, { action: 'status', connected: true });

            let buffer = '';
            res.body.on('data', chunk => {
                buffer += chunk.toString('utf8');
                const { events, remainder } = extractEvents(buffer);
                buffer = remainder;
                events.forEach(ev => sendToUi(wss, tabId, {
                    action: 'message', direction: 'in', timestamp: Date.now(),
                    data: ev.event !== 'message' ? `[${ev.event}] ${ev.data}` : ev.data,
                }));
            });
            res.body.on('end', () => {
                sendToUi(wss, tabId, { action: 'status', connected: false });
                controllers.delete(tabId);
            });
            res.body.on('error', err => {
                if (err.name !== 'AbortError') sendToUi(wss, tabId, { action: 'status', connected: false, error: err.message });
                controllers.delete(tabId);
            });
        } catch (e) {
            if (e.name !== 'AbortError') sendToUi(wss, tabId, { action: 'status', connected: false, error: e.message });
            controllers.delete(tabId);
        }

    } else if (msg.action === 'disconnect') {
        const controller = controllers.get(tabId);
        if (controller) { controller.abort(); controllers.delete(tabId); }
    }
}
