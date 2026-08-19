import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sendToType } from './wsRelay.js';

// One in-flight call per UI tab, same one-per-tab model as the other protocol proxies.
const activeCalls = new Map();

const sendToUi = (wss, tabId, payload) => sendToType(wss, `grpc-proxy:${tabId}`, payload);

function getByPath(obj, path) {
    return path.split('.').reduce((o, k) => o?.[k], obj);
}

function splitMethodPath(methodPath) {
    const idx = methodPath.lastIndexOf('/');
    return [methodPath.slice(0, idx), methodPath.slice(idx + 1)];
}

// proto-loader only reads from a file path, so the pasted .proto text is written to a
// throwaway temp file for the duration of this one parse call, then cleaned up immediately —
// loadSync fully parses the descriptor into memory, nothing else needs the file afterward.
export function loadProtoServices(protoText) {
    const dir = mkdtempSync(join(tmpdir(), 'consolio-grpc-'));
    const file = join(dir, 'service.proto');
    try {
        writeFileSync(file, protoText);
        const pkgDef = protoLoader.loadSync(file, { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true });
        const grpcObj = grpc.loadPackageDefinition(pkgDef);
        const methods = [];
        Object.entries(pkgDef).forEach(([fqName, svc]) => {
            if (!svc || typeof svc !== 'object') return;
            Object.entries(svc).forEach(([methodName, def]) => {
                if (def && typeof def === 'object' && 'path' in def) {
                    methods.push({ path: `${fqName}/${methodName}`, serviceName: fqName, methodName, requestStream: !!def.requestStream, responseStream: !!def.responseStream });
                }
            });
        });
        return { grpcObj, methods };
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

export function handleGrpcProxyConnection(ws, wss, tabId) {
    ws.on('close', () => {
        const call = activeCalls.get(tabId);
        if (call) { try { call.cancel(); } catch { } activeCalls.delete(tabId); }
    });
}

export function handleGrpcProxyMessage(ws, wss, tabId, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.action === 'loadProto') {
        try {
            const { methods } = loadProtoServices(msg.protoText);
            sendToUi(wss, tabId, { action: 'schema', methods: methods.map(({ path, requestStream, responseStream }) => ({ path, requestStream, responseStream })) });
        } catch (e) {
            sendToUi(wss, tabId, { action: 'schema', methods: [], error: e.message });
        }
        return;
    }

    if (msg.action === 'call') {
        const existing = activeCalls.get(tabId);
        if (existing) { try { existing.cancel(); } catch { } activeCalls.delete(tabId); }

        let loaded;
        try { loaded = loadProtoServices(msg.protoText); }
        catch (e) { sendToUi(wss, tabId, { action: 'status', connected: false, error: 'Proto error: ' + e.message }); return; }

        const methodDef = loaded.methods.find(m => m.path === msg.methodPath);
        if (!methodDef) { sendToUi(wss, tabId, { action: 'status', connected: false, error: `Method not found in proto: ${msg.methodPath}` }); return; }

        if (methodDef.requestStream) {
            sendToUi(wss, tabId, { action: 'status', connected: false, error: 'Client-streaming and bidirectional methods are not supported yet — use a unary or server-streaming method.' });
            return;
        }

        const [svcPath] = splitMethodPath(msg.methodPath);
        const ServiceCtor = getByPath(loaded.grpcObj, svcPath);
        if (!ServiceCtor) { sendToUi(wss, tabId, { action: 'status', connected: false, error: `Service not found: ${svcPath}` }); return; }

        let requestObj = {};
        try { requestObj = msg.requestJson?.trim() ? JSON.parse(msg.requestJson) : {}; }
        catch (e) { sendToUi(wss, tabId, { action: 'status', connected: false, error: 'Request JSON parse error: ' + e.message }); return; }

        let client;
        try { client = new ServiceCtor(msg.address, grpc.credentials.createInsecure()); }
        catch (e) { sendToUi(wss, tabId, { action: 'status', connected: false, error: e.message }); return; }

        sendToUi(wss, tabId, { action: 'status', connected: true });

        if (methodDef.responseStream) {
            const call = client[methodDef.methodName](requestObj);
            activeCalls.set(tabId, call);
            call.on('data', chunk => sendToUi(wss, tabId, { action: 'message', timestamp: Date.now(), data: chunk }));
            call.on('end', () => { sendToUi(wss, tabId, { action: 'status', connected: false }); activeCalls.delete(tabId); });
            call.on('error', err => { sendToUi(wss, tabId, { action: 'status', connected: false, error: err.message }); activeCalls.delete(tabId); });
        } else {
            const call = client[methodDef.methodName](requestObj, (err, response) => {
                if (err) sendToUi(wss, tabId, { action: 'status', connected: false, error: err.message });
                else {
                    sendToUi(wss, tabId, { action: 'message', timestamp: Date.now(), data: response });
                    sendToUi(wss, tabId, { action: 'status', connected: false });
                }
                activeCalls.delete(tabId);
            });
            activeCalls.set(tabId, call);
        }
        return;
    }

    if (msg.action === 'cancel' || msg.action === 'disconnect') {
        const call = activeCalls.get(tabId);
        if (call) { try { call.cancel(); } catch { } activeCalls.delete(tabId); }
    }
}
