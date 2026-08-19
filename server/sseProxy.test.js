import assert from 'node:assert';
import { extractEvents } from './sseProxy.js';

// Multiple complete events, plus a trailing incomplete one carried over
{
    const { events, remainder } = extractEvents('data: hello\n\nevent: ping\ndata: pong\nid: 1\n\ndata: incompl');
    assert.deepStrictEqual(events.map(e => e.data), ['hello', 'pong']);
    assert.strictEqual(events[1].event, 'ping');
    assert.strictEqual(events[1].id, '1');
    assert.strictEqual(remainder, 'data: incompl');
}

// Multi-line data joins with \n; comment-only blocks produce no event
{
    const { events } = extractEvents('data: line1\ndata: line2\n\n: this is a comment\n\n');
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].data, 'line1\nline2');
}

// CRLF line endings are normalized the same way
{
    const { events } = extractEvents('data: crlf\r\n\r\n');
    assert.strictEqual(events[0].data, 'crlf');
}

console.log('sseProxy.test.js: all checks passed');
