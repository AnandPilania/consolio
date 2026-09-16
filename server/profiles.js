export function createProfile({ name, description = '', mode = 'allowlist', requestIds = [], redactHeaders = [], redactParams = [] }) {
    if (!name || !name.trim()) throw new Error('Profile name is required');
    if (!['allowlist', 'blocklist'].includes(mode)) throw new Error('mode must be "allowlist" or "blocklist"');
    return {
        id: `prof_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        name: name.trim(), description, mode,
        requestIds: [...new Set(requestIds)],
        redactHeaders: [...new Set(redactHeaders.map(h => h.toLowerCase()))],
        redactParams: [...new Set(redactParams)],
    };
}

function redactRequest(request, profile) {
    const stripHeaderSet = new Set(profile.redactHeaders);
    const stripParamSet = new Set(profile.redactParams);
    return {
        ...request,
        headers: (request.headers || []).filter(h => !stripHeaderSet.has((h.key || '').toLowerCase())),
        params: (request.params || []).filter(p => !stripParamSet.has(p.key)),
    };
}

export function applyProfile(collection, profile) {
    const idSet = new Set(profile.requestIds);
    const included = (collection.requests || []).filter(r =>
        profile.mode === 'allowlist' ? idSet.has(r.id) : !idSet.has(r.id)
    );
    const redacted = included.map(r => redactRequest(r, profile));

    const usedFolderIds = new Set(redacted.map(r => r.folderId).filter(Boolean));
    const folders = (collection.folders || []).filter(f => usedFolderIds.has(f.id));

    return {
        ...collection,
        name: `${collection.name} (${profile.name})`,
        description: profile.description || collection.description,
        requests: redacted,
        folders,
    };
}

export function describeProfileImpact(collection, profile) {
    const total = (collection.requests || []).length;
    const idSet = new Set(profile.requestIds);
    const includedCount = (collection.requests || []).filter(r =>
        profile.mode === 'allowlist' ? idSet.has(r.id) : !idSet.has(r.id)
    ).length;
    return {
        totalRequests: total,
        includedRequests: includedCount,
        excludedRequests: total - includedCount,
        redactedHeaders: profile.redactHeaders,
        redactedParams: profile.redactParams,
    };
}
