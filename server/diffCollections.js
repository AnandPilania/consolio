function requestKey(r) {
    return `${(r.method || 'GET').toUpperCase()} ${normalizeUrl(r.url || '')}`;
}

function normalizeUrl(url) {
    return url.replace(/^[a-zA-Z]+:\/\/[^/]+/, '').split('?')[0].replace(/\/+$/, '') || '/';
}

function paramKeys(request) {
    return new Set((request.params || []).filter(p => p.key).map(p => p.key));
}
function headerKeys(request) {
    return new Set((request.headers || []).filter(h => h.key).map(h => h.key.toLowerCase()));
}

export function diffCollections(before, after) {
    const beforeByKey = new Map((before.requests || []).map(r => [requestKey(r), r]));
    const afterByKey = new Map((after.requests || []).map(r => [requestKey(r), r]));

    const removedEndpoints = [];
    const addedEndpoints = [];
    const changedEndpoints = [];

    for (const [key, req] of beforeByKey) {
        if (!afterByKey.has(key)) {
            removedEndpoints.push({ key, name: req.name, method: req.method, url: req.url });
        }
    }
    for (const [key, req] of afterByKey) {
        if (!beforeByKey.has(key)) {
            addedEndpoints.push({ key, name: req.name, method: req.method, url: req.url });
        }
    }

    for (const [key, oldReq] of beforeByKey) {
        const newReq = afterByKey.get(key);
        if (!newReq) continue;

        const changes = [];

        // Removed query params a consumer may have relied on.
        const oldParams = paramKeys(oldReq), newParams = paramKeys(newReq);
        const removedParams = [...oldParams].filter(p => !newParams.has(p));
        if (removedParams.length) changes.push({ type: 'params_removed', detail: removedParams });

        // Removed headers (excluding Content-Type, which routinely varies without being breaking).
        const oldHeaders = headerKeys(oldReq), newHeaders = headerKeys(newReq);
        const removedHeaders = [...oldHeaders].filter(h => h !== 'content-type' && !newHeaders.has(h));
        if (removedHeaders.length) changes.push({ type: 'headers_removed', detail: removedHeaders });

        // Auth type changed (e.g. bearer -> none) is breaking for any client relying on it.
        const oldAuthType = oldReq.auth?.type || 'none';
        const newAuthType = newReq.auth?.type || 'none';
        if (oldAuthType !== newAuthType) changes.push({ type: 'auth_changed', detail: { from: oldAuthType, to: newAuthType } });

        // Body type changed (e.g. json -> form) changes what a client must send.
        const oldBodyType = oldReq.body?.type || 'none';
        const newBodyType = newReq.body?.type || 'none';
        if (oldBodyType !== newBodyType) changes.push({ type: 'body_type_changed', detail: { from: oldBodyType, to: newBodyType } });

        if (changes.length) {
            changedEndpoints.push({ key, name: newReq.name || oldReq.name, method: newReq.method, url: newReq.url, changes });
        }
    }

    const breaking = removedEndpoints.length > 0 || changedEndpoints.some(c => c.changes.some(ch => ch.type !== 'headers_removed'));

    return {
        breaking,
        summary: {
            removedEndpoints: removedEndpoints.length,
            addedEndpoints: addedEndpoints.length,
            changedEndpoints: changedEndpoints.length,
        },
        removedEndpoints, addedEndpoints, changedEndpoints,
    };
}
