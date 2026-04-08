const enabledEl = document.getElementById('enabled');
const portEl = document.getElementById('port');
const statusEl = document.getElementById('status');
const openBtn = document.getElementById('openBtn');

// Load settings
chrome.storage.local.get(['enabled', 'port'], (data) => {
    enabledEl.checked = data.enabled ?? false;
    portEl.value = data.port ?? 4242;
    checkConnection();
});

enabledEl.addEventListener('change', () => {
    chrome.storage.local.set({ enabled: enabledEl.checked });
});

portEl.addEventListener('change', () => {
    const port = parseInt(portEl.value);
    chrome.storage.local.set({ port });
    checkConnection();
});

openBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: `http://localhost:${portEl.value}` });
});

async function checkConnection() {
    const port = portEl.value;
    try {
        const res = await fetch(`http://localhost:${port}/api/config`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
            const cfg = await res.json();
            statusEl.textContent = `✓ Connected to ${cfg.name || 'consolio'}`;
            statusEl.className = 'status connected';
            return;
        }
    } catch { }
    statusEl.textContent = '✕ consolio not running on port ' + port;
    statusEl.className = 'status disconnected';
}

checkConnection();
setInterval(checkConnection, 5000);
