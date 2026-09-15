const CHECKS = [
    {
        id: 'has_description',
        label: 'Has a description',
        weight: 20,
        test: (r) => Boolean(r.description && r.description.trim().length > 0),
        fix: 'Add a description explaining what this request does and when to use it.'
    },
    {
        id: 'has_auth',
        label: 'Declares an auth type',
        weight: 15,
        test: (r) => Boolean(r.auth && r.auth.type && r.auth.type !== 'none'),
        fix: 'Set an auth type (Bearer/Basic/API Key) instead of "None", or explicitly mark it public.'
    },
    {
        id: 'has_tests',
        label: 'Has at least one test assertion',
        weight: 25,
        test: (r) => Array.isArray(r.tests) && r.tests.length > 0,
        fix: 'Add a test assertion (e.g. status equals 200) under the Tests tab.'
    },
    {
        id: 'status_test',
        label: 'Tests include a status check',
        weight: 15,
        test: (r) => Array.isArray(r.tests) && r.tests.some(t => ['status', 'status_lt', 'status_in'].includes(t.type)),
        fix: 'Add a status/status_lt/status_in assertion so failures are caught automatically.'
    },
    {
        id: 'named_request',
        label: 'Has a real (non-default) name',
        weight: 10,
        test: (r) => Boolean(r.name && r.name.trim() && r.name.trim() !== 'New Request'),
        fix: 'Rename the request to something descriptive instead of the default.'
    },
    {
        id: 'params_documented',
        label: 'Query/header params have descriptions',
        weight: 10,
        test: (r) => {
            const entries = [...(r.params || []), ...(r.headers || [])].filter(p => p.key);
            if (entries.length === 0) return true; // nothing to document
            return entries.every(p => p.description && p.description.trim());
        },
        fix: 'Add short descriptions to each header/query param so consumers know what to send.'
    },
    {
        id: 'no_hardcoded_secrets',
        label: 'No obvious hardcoded secrets in URL/headers',
        weight: 5,
        test: (r) => {
            const suspicious = /(api[_-]?key|token|secret|password)\s*[:=]\s*[A-Za-z0-9_\-]{8,}/i;
            const haystack = [r.url, ...(r.headers || []).map(h => h.value)].filter(Boolean).join(' ');
            // {{VAR}} references are fine — this only flags literal-looking values.
            return !suspicious.test(haystack) || /\{\{.*\}\}/.test(haystack);
        },
        fix: 'Move hardcoded credentials into an environment variable ({{VAR}}) instead of the raw request.'
    }
];

function gradeFor(score) {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
}

export function scoreRequest(request) {
    const results = CHECKS.map(check => ({
        id: check.id,
        label: check.label,
        weight: check.weight,
        passed: Boolean(check.test(request)),
        fix: check.fix
    }));
    const total = CHECKS.reduce((sum, c) => sum + c.weight, 0);
    const earned = results.filter(r => r.passed).reduce((sum, r) => sum + r.weight, 0);
    const score = Math.round((earned / total) * 100);
    return { score, grade: gradeFor(score), checks: results };
}

export function scoreCollection(collection) {
    const requests = collection.requests || [];
    if (requests.length === 0) {
        return {
            score: 0, grade: 'F', requestCount: 0,
            summary: 'No requests yet — nothing to score.',
            requests: [], topIssues: []
        };
    }

    const scored = requests.map(r => ({ id: r.id, name: r.name, ...scoreRequest(r) }));
    const avg = Math.round(scored.reduce((sum, r) => sum + r.score, 0) / scored.length);

    const failuresByCheck = {};
    for (const r of scored) {
        for (const c of r.checks) {
            if (!c.passed) {
                failuresByCheck[c.id] = failuresByCheck[c.id] || { id: c.id, label: c.label, fix: c.fix, count: 0 };
                failuresByCheck[c.id].count++;
            }
        }
    }
    const topIssues = Object.values(failuresByCheck).sort((a, b) => b.count - a.count);

    return {
        score: avg,
        grade: gradeFor(avg),
        requestCount: requests.length,
        requests: scored,
        topIssues
    };
}
