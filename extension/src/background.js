let isEnabled = false;
let consolioPort = 4242;
const requestBuffer = new Map();

chrome.storage.local.get(['enabled', 'port'], (data) => {
    isEnabled = data.enabled ?? false;
    consolioPort = parseInt(data.port ?? 4242);
    updateBadge();
});

chrome.storage.onChanged.addListener((changes) => {
    if (changes.enabled !== undefined) { isEnabled = changes.enabled.newValue; updateBadge(); }
    if (changes.port !== undefined) consolioPort = parseInt(changes.port.newValue);
});

function updateBadge() {
    chrome.action.setBadgeText({ text: isEnabled ? 'ON' : '' });
    chrome.action.setBadgeBackgroundColor({ color: isEnabled ? '#f59e0b' : '#555555' });
}

chrome.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
        if (!isEnabled) return;
        if (!['xmlhttprequest', 'fetch'].includes(details.type)) return;
        if (details.url.startsWith('chrome-extension://')) return;

        const headers = {};
        (details.requestHeaders || []).forEach(h => { headers[h.name.toLowerCase()] = h.value; });

        requestBuffer.set(details.requestId, {
            method: details.method, url: details.url,
            requestHeaders: headers,
            timestamp: new Date().toISOString(),
            tabId: details.tabId
        });
    },
    { urls: ['<all_urls>'] },
    ['requestHeaders', 'extraHeaders']
);

chrome.webRequest.onCompleted.addListener(
    (details) => {
        if (!isEnabled) return;
        const req = requestBuffer.get(details.requestId);
        if (!req) return;
        requestBuffer.delete(details.requestId);

        if (details.url.includes(`localhost:${consolioPort}`) || details.url.includes(`127.0.0.1:${consolioPort}`)) return;

        const responseHeaders = {};
        (details.responseHeaders || []).forEach(h => { responseHeaders[h.name.toLowerCase()] = h.value; });

        sendToConsolio({ ...req, status: details.statusCode, responseHeaders });
    },
    { urls: ['<all_urls>'] },
    ['responseHeaders', 'extraHeaders']
);

chrome.webRequest.onErrorOccurred.addListener(
    (details) => requestBuffer.delete(details.requestId),
    { urls: ['<all_urls>'] }
);

async function sendToConsolio(entry) {
    try {
        await self.fetch(`http://localhost:${consolioPort}/api/interceptor/capture`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entry)
        });
    } catch {
        // consolio not running — silently ignore
    }
}
