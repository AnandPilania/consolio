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

export async function callAnthropic({ apiKey, model = 'claude-sonnet-4-6', prompt, baseUrl = 'https://api.anthropic.com' }) {
    if (!apiKey) throw new Error('An API key is required for the Anthropic provider');
    const { default: fetch } = await import('node-fetch');
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/messages`, {
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

export async function callOpenAICompatible({ apiKey, model, prompt, baseUrl }) {
    if (!baseUrl) throw new Error('baseUrl is required for an OpenAI-compatible provider (e.g. https://api.openai.com/v1, an Azure OpenAI deployment URL, or http://localhost:11434/v1 for Ollama)');
    if (!model) throw new Error('model is required for an OpenAI-compatible provider');
    const { default: fetch } = await import('node-fetch');
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
        headers['api-key'] = apiKey; // Azure OpenAI reads this header instead of Authorization
    }
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers,
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
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('AI provider returned no message content');
    return text;
}

export async function callOllama({ model, prompt, baseUrl = 'http://localhost:11434' }) {
    if (!model) throw new Error('model is required for the Ollama provider (e.g. "llama3.1", "qwen2.5")');
    const { default: fetch } = await import('node-fetch');
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model, stream: false,
            messages: [{ role: 'user', content: prompt }],
        }),
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`AI provider request failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    const text = data.message?.content;
    if (!text) throw new Error('AI provider returned no message content');
    return text;
}

const PROVIDER_CALLERS = {
    anthropic: callAnthropic,
    openai: callOpenAICompatible,       // OpenAI itself
    'azure-openai': callOpenAICompatible, // Azure OpenAI — same wire shape, different baseUrl/key handling
    ollama: callOllama,                 // native Ollama /api/chat
    'openai-compatible': callOpenAICompatible, // any other OpenAI-shaped endpoint (vLLM, LM Studio, OpenRouter, Ollama's /v1, etc.)
};

export async function callProvider(provider, options) {
    const caller = PROVIDER_CALLERS[provider];
    if (!caller) {
        throw new Error(`Unknown AI provider "${provider}". Supported: ${Object.keys(PROVIDER_CALLERS).join(', ')}`);
    }
    return caller(options);
}
