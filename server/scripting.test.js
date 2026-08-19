import assert from 'node:assert';
import { runScript, runTests } from './scripting.js';

// setVariable persists into `modified` and is readable within the same script
{
    const r = runScript(`
        consolio.setVariable('token', 'abc123')
        consolio.log('got', consolio.getVariable('token'))
    `, { envVars: { existing: '1' } });
    assert.strictEqual(r.error, null);
    assert.deepStrictEqual(r.modified, { token: 'abc123' });
    assert.strictEqual(r.logs[0], 'got abc123');
}

// sandbox isolation: no require/process/fs reachable
{
    const r = runScript(`consolio.log(typeof require, typeof process)`, {});
    assert.strictEqual(r.error, null);
    assert.strictEqual(r.logs[0], 'undefined undefined');
}

// syntax/runtime errors are captured, not thrown
{
    const r = runScript(`throw new Error('boom')`, {});
    assert.strictEqual(r.error, 'boom');
}

// runTests: new assertion types
{
    const response = { status: 201, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: [{ id: 42 }] }), elapsed: 120 };
    const results = runTests([
        { type: 'status_in', value: '200,201,204' },
        { type: 'header_equals', value: 'content-type=application/json' },
        { type: 'body_not_contains', value: 'nope' },
        { type: 'body_json_path', path: 'data[0].id', value: '42' },
        { type: 'response_time_gt', value: '50' },
    ], response);
    assert.ok(results.every(r => r.pass), JSON.stringify(results));
}

console.log('scripting.test.js: all checks passed');
