import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
    listInstalledPlugins, installPlugin, uninstallPlugin, setPluginEnabled,
    loadEnabledPlugins, runRequestHooks, runResponseHooks, applyTemplateTags,
} from './loader.js';

// applyTemplateTags: resolves a known tag, leaves unknown tags untouched
{
    const tags = { shout: () => 'LOUD' };
    assert.strictEqual(applyTemplateTags('say {{% shout %}} now', tags), 'say LOUD now');
    assert.strictEqual(applyTemplateTags('say {{% nope %}} now', tags), 'say {{% nope %}} now');
    assert.strictEqual(applyTemplateTags('plain string', tags), 'plain string');
}

// runRequestHooks / runResponseHooks: chain multiple hooks, each seeing the prior mutation
{
    const hooks = {
        requestHooks: [
            r => ({ ...r, headers: [...r.headers, 'a'] }),
            r => ({ ...r, headers: [...r.headers, 'b'] }),
        ],
        responseHooks: [r => ({ ...r, body: r.body + '!' })],
    };
    const req = await runRequestHooks(hooks, { headers: [] });
    assert.deepStrictEqual(req.headers, ['a', 'b']);
    const res = await runResponseHooks(hooks, { body: 'hi' });
    assert.strictEqual(res.body, 'hi!');
}

// Full install → load → disable → uninstall cycle against a real npm project on disk,
// installing the repo's own reference plugin by local path (no network access needed —
// npm treats a filesystem path argument as a local install, same code path as a real
// registry package name).
{
    const scratchRoot = mkdtempSync(join(tmpdir(), 'consolio-plugin-test-'));
    const storage = { consolioDir: scratchRoot };
    const pluginPath = resolve(import.meta.dirname, '../../examples/consolio-plugin-example');

    try {
        const installed = await installPlugin(storage, pluginPath);
        assert.strictEqual(installed.name, 'consolio-plugin-example');
        assert.strictEqual(installed.enabled, true);
        assert.strictEqual(listInstalledPlugins(storage).length, 1);

        const hooks = await loadEnabledPlugins(storage);
        assert.strictEqual(hooks.requestHooks.length, 1);
        assert.strictEqual(hooks.responseHooks.length, 1);
        assert.strictEqual(typeof hooks.templateTags.timestamp, 'function');

        const req = await runRequestHooks(hooks, { method: 'GET', url: 'http://x', headers: [] });
        assert.ok(req.headers.some(h => h.key === 'X-Consolio-Plugin' && h.value === 'example'));

        const res = await runResponseHooks(hooks, { headers: {}, body: '{}' });
        assert.strictEqual(res.headers['x-plugin-processed'], 'true');

        assert.ok(applyTemplateTags('{{% timestamp %}}', hooks.templateTags).endsWith('Z'));

        // disabling excludes it from loadEnabledPlugins without uninstalling
        setPluginEnabled(storage, 'consolio-plugin-example', false);
        const hooksDisabled = await loadEnabledPlugins(storage);
        assert.strictEqual(hooksDisabled.requestHooks.length, 0);
        assert.strictEqual(listInstalledPlugins(storage)[0].enabled, false);

        await uninstallPlugin(storage, 'consolio-plugin-example');
        assert.strictEqual(listInstalledPlugins(storage).length, 0);
    } finally {
        rmSync(scratchRoot, { recursive: true, force: true });
    }
}

console.log('loader.test.js: all checks passed');
