// Shared by wsProxy.js and sseProxy.js — pushes a JSON payload to every UI socket
// subscribed under a given `?type=` tag (see server/index.js's wss 'connection' handler).
export function sendToType(wss, type, payload) {
    wss.clients.forEach(client => {
        if (client.consolioType === type && client.readyState === 1) client.send(JSON.stringify(payload));
    });
}
