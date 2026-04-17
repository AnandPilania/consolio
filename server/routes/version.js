import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8'));

let _cached = null;
let _ts = 0;

export async function versionRoutes(fastify) {
    fastify.get('/api/version', async () => {
        const now = Date.now();
        if (!_cached || now - _ts > 600_000) {
            try {
                const r = await fetch(`https://registry.npmjs.org/${pkg.name}/latest`, {
                    signal: AbortSignal.timeout(4000),
                    headers: { 'User-Agent': `consolio/${pkg.version}` }
                });
                if (r.ok) {
                    _cached = (await r.json()).version;
                    _ts = now;
                }
            } catch { /* offline or registry unavailable */ }
        }
        return {
            current: pkg.version,
            latest: _cached ?? null,
            updateAvailable: !!_cached && _cached !== pkg.version,
            packageName: pkg.name,
            installCmd: `npm install -g ${pkg.name}@latest`
        };
    });
}
