const MAX_BODY_PREVIEW = 2000; // chars

function buildPrompt(request, lastResponse) {
    const { method, url, headers = [], params = [], tests = [] } = request;
    const headerList = headers.filter(h => h.enabled && h.key).map(h => h.key).join(', ') || 'none';
    const paramList = params.filter(p => p.enabled && p.key).map(p => p.key).join(', ') || 'none';
    const existingTests = tests.map(t => t.type).join(', ') || 'none';

    let responsePreview = 'No prior response available.';
    if (lastResponse) {
        const bodyStr = typeof lastResponse.body === 'string' ? lastResponse.body : JSON.stringify(lastResponse.body);
        const truncated = (bodyStr || '').slice(0, MAX_BODY_PREVIEW);
        responsePreview = `Status: ${lastResponse.status}\nBody preview (truncated to ${MAX_BODY_PREVIEW} chars):\n${truncated}`;
    }

    return `You are helping document and test an API request in an API-testing tool. Given the request below, suggest:
1. A one-sentence description of what this request does.
2. 1-3 test assertions from this fixed set of types: status, status_lt, status_in, has_header, header_equals, body_contains, body_not_contains, body_json_path, body_not_empty, response_time, response_time_gt.

Request:
${method} ${url}
Headers present: ${headerList}
Query params present: ${paramList}
Existing tests: ${existingTests}

Last response:
${responsePreview}

Respond ONLY with JSON in this exact shape, nothing else:
{"description": "...", "tests": [{"type": "status", "value": "200"}]}`;
}

function parseSuggestion(text) {
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (typeof parsed.description !== 'string' || !Array.isArray(parsed.tests)) {
        throw new Error('Malformed AI response shape');
    }
    return {
        description: parsed.description.trim(),
        tests: parsed.tests
            .filter(t => t && typeof t.type === 'string')
            .map(t => ({ type: t.type, value: t.value !== undefined ? String(t.value) : undefined })),
    };
}

export async function suggestFixes(request, lastResponse, callModel) {
    if (typeof callModel !== 'function') {
        throw new Error('An AI provider call is required — suggestFixes never calls out on its own');
    }
    const prompt = buildPrompt(request, lastResponse);
    const raw = await callModel(prompt);
    return parseSuggestion(raw);
}

export async function callAnthropic({ apiKey, model = 'claude-sonnet-4-6', prompt }) {
    const { default: fetch } = await import('node-fetch');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model, max_tokens: 500,
            messages: [{ role: 'user', content: prompt }],
        }),
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`AI provider request failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    const textBlock = (data.content || []).find(b => b.type === 'text');
    if (!textBlock) throw new Error('AI provider returned no text content');
    return textBlock.text;
}
