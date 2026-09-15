import assert from 'node:assert';
import { buildAnalytics } from './analytics.js';

function entry({ collectionId = 'col_1', requestId = 'req_1', requestName = 'Get user', status = 200, elapsed = 100 }) {
    return {
        id: `h_${Math.random()}`, timestamp: new Date().toISOString(),
        collectionId, requestId, requestName,
        request: { method: 'GET', url: 'https://api.example.com/users/1' },
        response: { status, elapsed },
    };
}

// buildAnalytics: empty history returns zeroed-out stats, not NaN/crash
{
    const result = buildAnalytics([]);
    assert.strictEqual(result.totalRequests, 0);
    assert.strictEqual(result.avgLatencyMs, 0);
    assert.strictEqual(result.errorRate, 0);
    assert.deepStrictEqual(result.requestBreakdown, []);
}

// buildAnalytics: computes avg latency, p95, and error rate correctly
{
    const entries = [
        entry({ status: 200, elapsed: 100 }),
        entry({ status: 200, elapsed: 200 }),
        entry({ status: 200, elapsed: 300 }),
        entry({ status: 500, elapsed: 900 }),
    ];
    const result = buildAnalytics(entries);
    assert.strictEqual(result.totalRequests, 4);
    assert.strictEqual(result.avgLatencyMs, 375); // (100+200+300+900)/4
    assert.strictEqual(result.errorCount, 1);
    assert.strictEqual(result.errorRate, 25);
    assert.ok(result.p95LatencyMs >= 300);
}

// buildAnalytics: scopes to a single collection when collectionId is passed
{
    const entries = [
        entry({ collectionId: 'col_1' }),
        entry({ collectionId: 'col_1' }),
        entry({ collectionId: 'col_2' }),
    ];
    const scoped = buildAnalytics(entries, { collectionId: 'col_1' });
    assert.strictEqual(scoped.totalRequests, 2);
    const all = buildAnalytics(entries);
    assert.strictEqual(all.totalRequests, 3);
}

// buildAnalytics: per-request breakdown groups by requestId, sorted by volume desc
{
    const entries = [
        entry({ requestId: 'a', requestName: 'A' }),
        entry({ requestId: 'a', requestName: 'A' }),
        entry({ requestId: 'b', requestName: 'B' }),
        entry({ requestId: null }), // ad-hoc scratch request — excluded from breakdown
    ];
    const result = buildAnalytics(entries);
    assert.strictEqual(result.requestBreakdown.length, 2);
    assert.strictEqual(result.requestBreakdown[0].requestId, 'a');
    assert.strictEqual(result.requestBreakdown[0].totalRequests, 2);
    assert.strictEqual(result.requestBreakdown[1].totalRequests, 1);
}

// buildAnalytics: recentErrors captures failed calls with method/url/status
{
    const entries = [entry({ status: 200 }), entry({ status: 404 })];
    const result = buildAnalytics(entries);
    assert.strictEqual(result.recentErrors.length, 1);
    assert.strictEqual(result.recentErrors[0].status, 404);
}

console.log('analytics.test.js passed');
