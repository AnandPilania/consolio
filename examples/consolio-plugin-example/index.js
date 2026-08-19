// Reference consolio plugin. Install with the Plugin Manager (Topbar → code icon) using
// this folder's path, or publish it to npm and install by package name.
//
// Hook contract: export requestHooks / responseHooks (arrays of async functions) and/or
// templateTags (an object of zero-arg functions). Each hook receives the request or
// response object and may either mutate it in place or return a new object to replace it.

module.exports = {
    requestHooks: [
        (request) => {
            console.log(`[consolio-plugin-example] ${request.method} ${request.url}`);
            request.headers = [...(request.headers || []), { key: 'X-Consolio-Plugin', value: 'example', enabled: true }];
            return request;
        },
    ],

    responseHooks: [
        (response) => {
            response.headers = { ...response.headers, 'x-plugin-processed': 'true' };
            return response;
        },
    ],

    templateTags: {
        // Use as {{% timestamp %}} in a URL, header, or body — resolves at send time.
        timestamp: () => new Date().toISOString(),
    },
};
