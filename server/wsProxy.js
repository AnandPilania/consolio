import WebSocket from 'ws';
import { sendToType } from './wsRelay.js';

// One real target connection per UI tab. The UI's own `ws-proxy:<tabId>` socket is
// purely a control/relay channel to the consolio server — the actual WebSocket to the
// target lives here, server-side, so the browser never has to deal with the target's
// CORS/TLS/auth-header requirements directly.
const targets = new Map();

const sendToUi = (wss, tabId, payload) => sendToType(wss, `ws-proxy:${tabId}`, payload);

export function handleWsProxyConnection(ws, wss, tabId) {
    ws.on('close', () => {
        const target = targets.get(tabId);
        if (target) { try { target.close(); } catch { } targets.delete(tabId); }
    });
}

export function handleWsProxyMessage(ws, wss, tabId, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.action === 'connect') {
        const existing = targets.get(tabId);
        if (existing) { try { existing.close(); } catch { } }

        let target;
        try {
            target = new WebSocket(msg.url, { headers: msg.headers || {} });
        } catch (e) {
            sendToUi(wss, tabId, { action: 'status', connected: false, error: e.message });
            return;
        }
        targets.set(tabId, target);

        target.on('open', () => sendToUi(wss, tabId, { action: 'status', connected: true }));
        target.on('message', (data, isBinary) => {
            sendToUi(wss, tabId, {
                action: 'message', direction: 'in', timestamp: Date.now(),
                data: isBinary ? data.toString('base64') : data.toString(),
            });
        });
        target.on('close', () => {
            sendToUi(wss, tabId, { action: 'status', connected: false });
            targets.delete(tabId);
        });
        target.on('error', (err) => {
            sendToUi(wss, tabId, { action: 'status', connected: false, error: err.message });
        });

    } else if (msg.action === 'send') {
        const target = targets.get(tabId);
        if (target && target.readyState === WebSocket.OPEN) {
            target.send(msg.data);
            sendToUi(wss, tabId, { action: 'message', direction: 'out', timestamp: Date.now(), data: msg.data });
        }

    } else if (msg.action === 'disconnect') {
        const target = targets.get(tabId);
        if (target) { try { target.close(); } catch { } targets.delete(tabId); }
    }
}
