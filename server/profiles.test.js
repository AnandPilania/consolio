import assert from 'node:assert';
import { createProfile, applyProfile, describeProfileImpact } from './profiles.js';

function sampleCollection() {
    return {
        id: 'col_1', name: 'Widget API', description: 'All the widgets',
        folders: [
            { id: 'fld_pub', name: 'Public', parentId: null },
            { id: 'fld_admin', name: 'Admin', parentId: null },
        ],
        requests: [
            { id: 'r1', name: 'List widgets', method: 'GET', url: 'https://api.example.com/widgets', folderId: 'fld_pub', headers: [{ key: 'Accept', value: 'application/json', enabled: true }], params: [{ key: 'limit', value: '10', enabled: true }] },
            { id: 'r2', name: 'Get widget', method: 'GET', url: 'https://api.example.com/widgets/{{id}}', folderId: 'fld_pub', headers: [], params: [] },
            { id: 'r3', name: 'Delete widget', method: 'DELETE', url: 'https://api.example.com/widgets/{{id}}', folderId: 'fld_admin', headers: [{ key: 'X-Admin-Token', value: '{{ADMIN_TOKEN}}', enabled: true }], params: [] },
        ],
    };
}

// createProfile: requires a name, validates mode, de-dupes and lowercases redacted headers
{
    assert.throws(() => createProfile({ name: '' }), /name is required/);
    assert.throws(() => createProfile({ name: 'x', mode: 'nonsense' }), /mode must be/);
    const p = createProfile({ name: 'Public', requestIds: ['r1', 'r1'], redactHeaders: ['X-Admin-Token', 'x-admin-token'] });
    assert.strictEqual(p.requestIds.length, 1);
    assert.deepStrictEqual(p.redactHeaders, ['x-admin-token']);
    assert.ok(p.id.startsWith('prof_'));
}

// applyProfile: allowlist mode keeps only listed requests, drops unused folders
{
    const col = sampleCollection();
    const profile = createProfile({ name: 'Public', mode: 'allowlist', requestIds: ['r1', 'r2'] });
    const filtered = applyProfile(col, profile);
    assert.strictEqual(filtered.requests.length, 2);
    assert.ok(filtered.requests.every(r => ['r1', 'r2'].includes(r.id)));
    // Admin folder is unused by any remaining request -> dropped
    assert.strictEqual(filtered.folders.length, 1);
    assert.strictEqual(filtered.folders[0].id, 'fld_pub');
    assert.ok(filtered.name.includes('Public'));
}

// applyProfile: blocklist mode excludes listed requests, keeps everything else
{
    const col = sampleCollection();
    const profile = createProfile({ name: 'No Admin', mode: 'blocklist', requestIds: ['r3'] });
    const filtered = applyProfile(col, profile);
    assert.strictEqual(filtered.requests.length, 2);
    assert.ok(!filtered.requests.some(r => r.id === 'r3'));
}

// applyProfile: redactHeaders/redactParams strip matching entries from every visible request
{
    const col = sampleCollection();
    const profile = createProfile({ name: 'External', mode: 'allowlist', requestIds: ['r1', 'r3'], redactHeaders: ['X-Admin-Token'], redactParams: ['limit'] });
    const filtered = applyProfile(col, profile);
    const r1 = filtered.requests.find(r => r.id === 'r1');
    const r3 = filtered.requests.find(r => r.id === 'r3');
    assert.strictEqual(r1.params.length, 0); // limit redacted
    assert.strictEqual(r3.headers.length, 0); // X-Admin-Token redacted
}

// applyProfile: original collection object is never mutated
{
    const col = sampleCollection();
    const originalReqCount = col.requests.length;
    const profile = createProfile({ name: 'Public', mode: 'allowlist', requestIds: ['r1'] });
    applyProfile(col, profile);
    assert.strictEqual(col.requests.length, originalReqCount);
    assert.strictEqual(col.requests[0].headers.length, 1); // untouched
}

// describeProfileImpact: reports included/excluded counts and redaction lists
{
    const col = sampleCollection();
    const profile = createProfile({ name: 'Public', mode: 'allowlist', requestIds: ['r1', 'r2'], redactHeaders: ['Accept'] });
    const impact = describeProfileImpact(col, profile);
    assert.strictEqual(impact.totalRequests, 3);
    assert.strictEqual(impact.includedRequests, 2);
    assert.strictEqual(impact.excludedRequests, 1);
    assert.deepStrictEqual(impact.redactedHeaders, ['accept']);
}

console.log('profiles.test.js passed');
