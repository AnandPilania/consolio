import assert from 'node:assert';
import { suggestFixes } from './ai-suggest.js';

const sampleRequest = {
    method: 'GET', url: 'https://api.example.com/users/{{id}}',
    headers: [{ key: 'Authorization', value: '{{TOKEN}}', enabled: true }],
    params: [], tests: [],
};

// suggestFixes: requires an explicit callModel function — never calls out on its own
{
    await assert.rejects(() => suggestFixes(sampleRequest, null, undefined), /AI provider call is required/);
}

// suggestFixes: parses a well-formed JSON response from the model into description + tests
{
    const fakeModel = async () => JSON.stringify({
        description: 'Fetches a single user by id.',
        tests: [{ type: 'status', value: '200' }, { type: 'body_not_empty' }],
    });
    const result = await suggestFixes(sampleRequest, { status: 200, body: '{"id":1}' }, fakeModel);
    assert.strictEqual(result.description, 'Fetches a single user by id.');
    assert.strictEqual(result.tests.length, 2);
    assert.strictEqual(result.tests[0].type, 'status');
    assert.strictEqual(result.tests[0].value, '200');
}

// suggestFixes: strips markdown code fences some models wrap JSON in
{
    const fakeModel = async () => '```json\n{"description":"desc","tests":[]}\n```';
    const result = await suggestFixes(sampleRequest, null, fakeModel);
    assert.strictEqual(result.description, 'desc');
    assert.deepStrictEqual(result.tests, []);
}

// suggestFixes: malformed shape (missing fields) throws rather than silently returning junk
{
    const fakeModel = async () => JSON.stringify({ notDescription: 'x' });
    await assert.rejects(() => suggestFixes(sampleRequest, null, fakeModel), /Malformed AI response shape/);
}

// suggestFixes: the prompt passed to the model includes the method/url so callers could assert on it
{
    let capturedPrompt;
    const fakeModel = async (prompt) => { capturedPrompt = prompt; return '{"description":"d","tests":[]}'; };
    await suggestFixes(sampleRequest, null, fakeModel);
    assert.ok(capturedPrompt.includes('GET https://api.example.com/users/{{id}}'));
}

console.log('ai-suggest.test.js passed');
