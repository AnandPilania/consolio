import { io } from 'socket.io-client';
import { sendToType } from './wsRelay.js';

// One real socket.io-client connection per UI tab, same one-per-tab model as wsProxy.js.
const targets = new Map();

const sendToUi = (wss, tabId, payload) => sendToType(wss, `sio-proxy:${tabId}`, payload);

export function handleSocketIoProxyConnection(ws, wss, tabId) {
    ws.on('close', () => {
        const target = targets.get(tabId);
        if (target) { try { target.disconnect(); } catch { } targets.delete(tabId); }
    });
}

export function handleSocketIoProxyMessage(ws, wss, tabId, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.action === 'connect') {
        const existing = targets.get(tabId);
        if (existing) { try { existing.disconnect(); } catch { } }

        let target;
        try {
            target = io(msg.url, {
                transports: ['websocket', 'polling'],
                extraHeaders: msg.headers || {},
                forceNew: true,
                reconnection: false,
            });
        } catch (e) {
            sendToUi(wss, tabId, { action: 'status', connected: false, error: e.message });
            return;
        }
        targets.set(tabId, target);

        target.on('connect', () => sendToUi(wss, tabId, { action: 'status', connected: true }));
        target.onAny((event, ...args) => {
            sendToUi(wss, tabId, {
                action: 'message', direction: 'in', timestamp: Date.now(),
                event, data: args.length <= 1 ? args[0] : args,
            });
        });
        target.on('disconnect', (reason) => {
            sendToUi(wss, tabId, { action: 'status', connected: false, error: reason === 'io client disconnect' ? undefined : reason });
            targets.delete(tabId);
        });
        target.on('connect_error', (err) => {
            sendToUi(wss, tabId, { action: 'status', connected: false, error: err.message });
        });

    } else if (msg.action === 'emit') {
        const target = targets.get(tabId);
        if (target && target.connected) {
            target.emit(msg.event, msg.data);
            sendToUi(wss, tabId, { action: 'message', direction: 'out', timestamp: Date.now(), event: msg.event, data: msg.data });
        }

    } else if (msg.action === 'disconnect') {
        const target = targets.get(tabId);
        if (target) { try { target.disconnect(); } catch { } targets.delete(tabId); }
    }
}
