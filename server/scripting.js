import vm from 'node:vm';

const SCRIPT_TIMEOUT_MS = 3000;

// Sandboxed pre/post-request script execution. Mirrors the API documented in
// README.md: consolio.log/setVariable/getVariable, with request/response/environment
// as context. Runs in a fresh vm context so scripts can't reach require/process/fs.
export function runScript(code, context = {}) {
    if (!code?.trim()) return { logs: [], error: null, modified: {} };
    const logs = [];
    const modified = {};
    const environment = { ...(context.envVars || {}) };
    const consolio = {
        log: (...a) => logs.push(a.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' ')),
        setVariable: (k, v) => { environment[k] = v; modified[k] = v; },
        getVariable: (k) => environment[k],
    };
    const sandbox = {
        consolio,
        request: context.request || {},
        response: context.response || {},
        environment,
    };
    try {
        const ctx = vm.createContext(sandbox);
        const script = new vm.Script(code, { filename: 'consolio-script.js' });
        script.runInContext(ctx, { timeout: SCRIPT_TIMEOUT_MS });
        return { logs, error: null, modified };
    } catch (e) {
        return { logs, error: e.message, modified };
    }
}

function getJsonPath(obj, path) {
    if (!path) return undefined;
    const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
    let cur = obj;
    for (const p of parts) cur = cur?.[p];
    return cur;
}

function fmtTime(ms) {
    if (!ms && ms !== 0) return '—';
    if (ms < 1000) return ms + ' ms';
    return (ms / 1000).toFixed(2) + ' s';
}

export function runTests(tests, response) {
    return (tests || []).map(t => {
        try {
            let pass = false, actual = '';
            switch (t.type) {
                case 'status': pass = response.status === parseInt(t.value); actual = String(response.status); break
                case 'status_lt': pass = response.status < parseInt(t.value); actual = String(response.status); break
                case 'status_in': {
                    const codes = String(t.value).split(',').map(v => parseInt(v.trim()))
                    pass = codes.includes(response.status); actual = String(response.status); break
                }
                case 'has_header': { const k = t.value.toLowerCase(); pass = !!response.headers?.[k]; actual = response.headers?.[k] || '(missing)'; break }
                case 'header_equals': {
                    const [key, ...vp] = String(t.value).split('=')
                    const expected = vp.join('=')
                    const actualVal = response.headers?.[key?.trim().toLowerCase()]
                    pass = actualVal === expected; actual = actualVal ?? '(missing)'; break
                }
                case 'body_contains': pass = (response.body || '').includes(t.value); actual = pass ? '✓' : '✗'; break
                case 'body_not_contains': pass = !(response.body || '').includes(t.value); actual = pass ? '✓' : '✗'; break
                case 'body_json_path': {
                    try {
                        const parsed = JSON.parse(response.body)
                        const cur = getJsonPath(parsed, t.path)
                        actual = JSON.stringify(cur); pass = actual === t.value || cur == t.value
                    } catch { actual = 'parse error'; pass = false }
                    break
                }
                case 'response_time': pass = response.elapsed <= parseInt(t.value); actual = fmtTime(response.elapsed); break
                case 'response_time_gt': pass = response.elapsed > parseInt(t.value); actual = fmtTime(response.elapsed); break
                case 'body_not_empty': pass = !!(response.body?.trim()); actual = pass ? 'has body' : 'empty'; break
                default: pass = false; actual = 'unknown type'
            }
            return { ...t, pass, actual, ran: true }
        } catch (e) { return { ...t, pass: false, actual: e.message, ran: true } }
    })
}
