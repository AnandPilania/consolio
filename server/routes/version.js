import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(
    readFileSync(join(__dirname, '../../package.json'), 'utf8')
);

function isVersionGreater(v1, v2) {
    const toNumArray = (v) => v.split('.').map(part => {
        const num = parseInt(part, 10);
        return isNaN(num) ? 0 : num;
    });
    const arr1 = toNumArray(v1);
    const arr2 = toNumArray(v2);
    const maxLen = Math.max(arr1.length, arr2.length);
    for (let i = 0; i < maxLen; i++) {
        const n1 = arr1[i] ?? 0;
        const n2 = arr2[i] ?? 0;
        if (n1 !== n2) return n1 > n2;
    }
    return false;
}

let cachedLatest = null;
let lastFetch = 0;
const DEFAULT_TTL = 600_000;      // 10 minutes
const DEFAULT_TIMEOUT = 4000;     // 4 seconds

export async function getLatestVersion({ ttl = DEFAULT_TTL, timeout = DEFAULT_TIMEOUT } = {}) {
    const now = Date.now();

    if (cachedLatest && now - lastFetch < ttl) {
        return buildResponse(cachedLatest);
    }

    try {
        const res = await fetch(`https://registry.npmjs.org/${pkg.name}/latest`, {
            signal: AbortSignal.timeout(timeout),
            headers: { 'User-Agent': `consolio/${pkg.version}` }
        });

        if (res.ok) {
            const data = await res.json();
            cachedLatest = data.version;
            lastFetch = now;
        } else {
            cachedLatest = cachedLatest ?? null;
        }
    } catch {
        cachedLatest = cachedLatest ?? null;
    }

    return buildResponse(cachedLatest);
}

function buildResponse(latestVersion) {
    const updateAvailable = !!latestVersion && isVersionGreater(latestVersion, pkg.version);
    return {
        current: pkg.version,
        latest: latestVersion,
        updateAvailable,
        packageName: pkg.name,
        installCmd: `npm install -g ${pkg.name}@latest`
    };
}

export async function versionRoutes(fastify) {
    fastify.get('/api/version', async () => {
        return getLatestVersion();
    });
}
