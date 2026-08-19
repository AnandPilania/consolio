import chalk from 'chalk';
import { consolioStorage } from './storage.js';
import { executeRequest } from './routes/proxy.js';
import { buildJUnitXml } from '../ui/utils/index.js';

function findCollection(storage, arg) {
    const cols = storage.listCollections();
    return cols.find(c => c.id === arg) || cols.find(c => (c.name || '').toLowerCase() === arg.toLowerCase());
}

function findEnvironment(storage, name) {
    if (!name) return null;
    const envs = storage.listEnvironments();
    return envs.find(e => e.id === name) || envs.find(e => (e.name || '').toLowerCase() === name.toLowerCase()) || null;
}

// Runs a collection in-process — no HTTP server involved — reusing the exact same
// executeRequest pipeline (pre-script → send → tests → post-script) as the UI runner and /api/execute.
export async function runCollectionCli(collectionArg, options) {
    const storage = new consolioStorage(options.project || process.cwd());
    const col = findCollection(storage, collectionArg);
    if (!col) {
        console.error(chalk.red(`Collection not found: "${collectionArg}"`));
        return 2;
    }
    const env = findEnvironment(storage, options.env);
    if (options.env && !env) {
        console.error(chalk.red(`Environment not found: "${options.env}"`));
        return 2;
    }
    const envVars = Object.fromEntries((env?.variables || []).filter(v => v.enabled).map(v => [v.key, v.value]));

    const concurrency = Math.max(1, parseInt(options.concurrency) || 1);
    const delay = parseInt(options.delay) || 0;
    const reqs = col.requests || [];
    const results = new Array(reqs.length);
    let bailed = false;

    const runOne = async (req) => {
        const { payload } = await executeRequest({
            method: req.method, url: req.url,
            headers: req.headers || [], params: req.params || [],
            body: req.body || { type: 'none' }, auth: req.auth || { type: 'none' },
            preScript: req.preScript || '', postScript: req.postScript || '',
            tests: req.tests || [], environmentId: env?.id || null,
            environment: envVars, saveToHistory: false,
        }, { storage });
        const hasTests = (req.tests || []).length > 0;
        const pass = !payload.error && (hasTests ? payload.testResults.every(t => t.pass) : payload.status < 400);
        return {
            name: req.name || req.url || 'Unnamed', pass,
            status: payload.status, elapsed: payload.elapsed || 0,
            error: payload.error || (payload.testResults || []).filter(t => !t.pass).map(t => `${t.type}: expected ${t.value}, got ${t.actual}`).join('; '),
        };
    };

    for (let i = 0; i < reqs.length; i += concurrency) {
        if (bailed) break;
        const chunk = reqs.slice(i, i + concurrency);
        const chunkResults = await Promise.all(chunk.map(runOne));
        chunkResults.forEach((r, k) => { results[i + k] = r; });
        if (options.bail && chunkResults.some(r => !r.pass)) bailed = true;
        if (!bailed && delay > 0 && i + concurrency < reqs.length) await new Promise(r => setTimeout(r, delay));
    }
    const ran = results.filter(Boolean);
    const skipped = reqs.length - ran.length;

    const reporter = options.reporter || 'cli';
    if (reporter === 'json') {
        console.log(JSON.stringify(ran, null, 2));
    } else if (reporter === 'junit') {
        console.log(buildJUnitXml(col.name, ran));
    } else {
        ran.forEach(r => {
            const icon = r.pass ? chalk.green('✓') : chalk.red('✕');
            console.log(`${icon} ${r.name} ${chalk.dim(`(${r.status ?? '—'}, ${r.elapsed}ms)`)}`);
            if (!r.pass && r.error) console.log(chalk.dim(`  ${r.error}`));
        });
        const passCount = ran.filter(r => r.pass).length;
        const failCount = ran.length - passCount;
        console.log('');
        console.log(`${chalk.bold(ran.length)} run, ${chalk.green(passCount + ' passed')}, ${chalk.red(failCount + ' failed')}${skipped ? `, ${skipped} skipped` : ''}`);
    }

    return ran.some(r => !r.pass) ? 1 : 0;
}
