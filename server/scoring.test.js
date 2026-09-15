import assert from 'node:assert';
import { scoreRequest, scoreCollection } from './scoring.js';

// scoreRequest: a fully-empty default request fails most checks
{
    const req = { id: 'req_1', name: 'New Request', headers: [], params: [], tests: [], auth: { type: 'none' } };
    const result = scoreRequest(req);
    assert.strictEqual(result.grade, 'F');
    assert.ok(result.score < 60);
    const failing = result.checks.filter(c => !c.passed).map(c => c.id);
    assert.ok(failing.includes('has_description'));
    assert.ok(failing.includes('has_auth'));
    assert.ok(failing.includes('has_tests'));
    assert.ok(failing.includes('named_request'));
}

// scoreRequest: a well-documented request with auth + status test scores high
{
    const req = {
        id: 'req_2',
        name: 'Get user by id',
        description: 'Fetches a single user by their numeric id.',
        auth: { type: 'bearer', token: '{{TOKEN}}' },
        headers: [{ key: 'X-Trace', value: '1', description: 'trace id', enabled: true }],
        params: [{ key: 'verbose', value: 'true', description: 'include extra fields', enabled: true }],
        tests: [{ type: 'status', value: '200' }, { type: 'body_not_empty' }],
    };
    const result = scoreRequest(req);
    assert.strictEqual(result.grade, 'A');
    assert.strictEqual(result.score, 100);
}

// scoreRequest: hardcoded-looking secret in a header is flagged unless templated
{
    const bad = { id: 'req_3', name: 'x', headers: [{ key: 'Authorization', value: 'api_key=sk_live_abcdef1234567890', enabled: true }], tests: [], auth: { type: 'none' } };
    const good = { id: 'req_4', name: 'x', headers: [{ key: 'Authorization', value: 'api_key={{SK}}', enabled: true }], tests: [], auth: { type: 'none' } };
    assert.strictEqual(scoreRequest(bad).checks.find(c => c.id === 'no_hardcoded_secrets').passed, false);
    assert.strictEqual(scoreRequest(good).checks.find(c => c.id === 'no_hardcoded_secrets').passed, true);
}

// scoreCollection: empty collection scores 0 with a clear reason, not NaN
{
    const result = scoreCollection({ id: 'col_1', name: 'Empty', requests: [] });
    assert.strictEqual(result.score, 0);
    assert.strictEqual(result.requestCount, 0);
    assert.ok(result.summary);
}

// scoreCollection: averages request scores and rolls up top issues by frequency
{
    const col = {
        id: 'col_2', name: 'Mixed',
        requests: [
            { id: 'r1', name: 'New Request', headers: [], params: [], tests: [], auth: { type: 'none' } },
            { id: 'r2', name: 'New Request', headers: [], params: [], tests: [], auth: { type: 'none' } },
            { id: 'r3', name: 'Good one', description: 'desc', auth: { type: 'bearer', token: 'x' }, headers: [], params: [], tests: [{ type: 'status' }] },
        ]
    };
    const result = scoreCollection(col);
    assert.strictEqual(result.requestCount, 3);
    assert.strictEqual(result.requests.length, 3);
    // named_request and has_description fail on 2 of 3 requests — should be the top issue(s)
    assert.strictEqual(result.topIssues[0].count, 2);
    assert.ok(result.topIssues.every((issue, i) => i === 0 || issue.count <= result.topIssues[i - 1].count));
}

console.log('scoring.test.js passed');
