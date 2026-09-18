import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const NPM_CMD = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const BUNDLED_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'plugins');

function pluginMetadata(pkg, fallbackName = 'Unknown plugin') {
    const author = typeof pkg.author === 'string' ? pkg.author : pkg.author?.name;
    return {
        name: pkg.name || fallbackName,
        author: author || 'Not specified',
        version: pkg.version || 'Not specified',
        release: pkg.release || pkg.releaseDate || 'Not specified',
        description: pkg.description || 'No description provided.',
        useCase: pkg.useCase || 'Use this plugin to extend consolio for a recurring API development workflow.',
        homepage: pkg.homepage || pkg.repository?.url || null,
    };
}

export function listBundledPlugins() {
    if (!existsSync(BUNDLED_DIR)) return [];
    return readdirSync(BUNDLED_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => {
            const pkgPath = join(BUNDLED_DIR, d.name, 'package.json');
            if (!existsSync(pkgPath)) return null;
            const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
            return { dir: d.name, ...pluginMetadata(pkg) };
        })
        .filter(Boolean);
}

export function getPluginsDir(storage) {
    return join(storage.consolioDir, 'plugins');
}

function ensurePluginsProject(dir) {
    mkdirSync(dir, { recursive: true });
    const pkgPath = join(dir, 'package.json');
    if (!existsSync(pkgPath)) {
        writeFileSync(pkgPath, JSON.stringify({ name: 'consolio-plugins', private: true, dependencies: {} }, null, 2));
    }
}

function readManifest(dir) {
    const file = join(dir, 'manifest.json');
    if (!existsSync(file)) return { enabled: {} };
    try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return { enabled: {} }; }
}

function writeManifest(dir, manifest) {
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

export function listInstalledPlugins(storage) {
    const dir = getPluginsDir(storage);
    ensurePluginsProject(dir);
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const manifest = readManifest(dir);
    return Object.entries(pkg.dependencies || {}).map(([name, version]) => {
        const installedPkgPath = join(dir, 'node_modules', name, 'package.json');
        const bundledPlugin = listBundledPlugins().find(plugin => plugin.name === name);
        let installedPkg = { name, version };
        try { installedPkg = JSON.parse(readFileSync(installedPkgPath, 'utf8')); } catch { }
        return { ...pluginMetadata({ ...bundledPlugin, ...installedPkg }, name), name, version: installedPkg.version || version, enabled: manifest.enabled[name] !== false };
    });
}

const VALID_PACKAGE_NAME = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
export function isValidPackageName(name) {
    return typeof name === 'string' && VALID_PACKAGE_NAME.test(name);
}

function readDependencyNames(dir) {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    return new Set(Object.keys(pkg.dependencies || {}));
}

export async function installPlugin(storage, name) {
    const dir = getPluginsDir(storage);
    ensurePluginsProject(dir);
    const before = readDependencyNames(dir);
    await execFileAsync(NPM_CMD, ['install', '--prefix', dir, '--no-audit', '--no-fund', name], { timeout: 120000, shell: process.platform === 'win32' });
    const after = readDependencyNames(dir);
    const installedName = [...after].find(n => !before.has(n)) ?? name;
    const manifest = readManifest(dir);
    manifest.enabled[installedName] = true;
    writeManifest(dir, manifest);
    return listInstalledPlugins(storage).find(p => p.name === installedName);
}

export async function installBundledPlugin(storage, dirName) {
    const bundled = listBundledPlugins().find(p => p.dir === dirName);
    if (!bundled) throw new Error('Unknown bundled plugin');
    return installPlugin(storage, join(BUNDLED_DIR, bundled.dir));
}

export async function uninstallPlugin(storage, name) {
    const dir = getPluginsDir(storage);
    ensurePluginsProject(dir);
    await execFileAsync(NPM_CMD, ['uninstall', '--prefix', dir, '--no-audit', '--no-fund', name], { timeout: 60000, shell: process.platform === 'win32' });
    const manifest = readManifest(dir);
    delete manifest.enabled[name];
    writeManifest(dir, manifest);
}

export function setPluginEnabled(storage, name, enabled) {
    const dir = getPluginsDir(storage);
    ensurePluginsProject(dir);
    const manifest = readManifest(dir);
    manifest.enabled[name] = !!enabled;
    writeManifest(dir, manifest);
}

export async function loadEnabledPlugins(storage) {
    const dir = getPluginsDir(storage);
    const installed = listInstalledPlugins(storage).filter(p => p.enabled);
    const hooks = { requestHooks: [], responseHooks: [], templateTags: {}, paneTabs: { request: [], response: [] }, pluginMeta: {} };

    for (const installedPlugin of installed) {
        const { name } = installedPlugin;
        try {
            const pkgPath = join(dir, 'node_modules', name, 'package.json');
            const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
            const entry = join(dir, 'node_modules', name, pkg.main || 'index.js');
            const mod = await import(pathToFileURL(entry).href);
            const plugin = mod.default || mod;
            hooks.pluginMeta[name] = pluginMetadata({ ...installedPlugin, ...pkg }, name);
            if (Array.isArray(plugin.requestHooks)) hooks.requestHooks.push(...plugin.requestHooks);
            if (Array.isArray(plugin.responseHooks)) hooks.responseHooks.push(...plugin.responseHooks);
            if (plugin.templateTags && typeof plugin.templateTags === 'object') Object.assign(hooks.templateTags, plugin.templateTags);
            for (const pane of ['request', 'response']) {
                const tabs = plugin.paneTabs?.[pane];
                if (!Array.isArray(tabs)) continue;
                for (const tab of tabs) {
                    if (typeof tab?.id !== 'string' || typeof tab?.label !== 'string' || typeof tab?.render !== 'function') continue;
                    hooks.paneTabs[pane].push({ plugin: name, ...tab });
                }
            }
        } catch (e) {
            console.error(`[plugins] Failed to load "${name}": ${e.message}`);
        }
    }
    return hooks;
}

export function listPaneTabs(hooks) {
    return {
        request: (hooks.paneTabs?.request || []).map(({ plugin, id, label }) => ({ plugin, id, label, pluginInfo: hooks.pluginMeta?.[plugin] })),
        response: (hooks.paneTabs?.response || []).map(({ plugin, id, label }) => ({ plugin, id, label, pluginInfo: hooks.pluginMeta?.[plugin] })),
        plugins: hooks.pluginMeta || {},
    };
}

export async function renderPaneTab(hooks, { pane, plugin, id, context }) {
    const tab = hooks.paneTabs?.[pane]?.find(item => item.plugin === plugin && item.id === id);
    if (!tab) throw new Error('Unknown plugin pane tab');
    return tab.render(context);
}

export async function runRequestHooks(hooks, request) {
    let current = request;
    for (const hook of hooks.requestHooks) {
        const result = await hook(current);
        if (result) current = result;
    }
    return current;
}

export async function runResponseHooks(hooks, response) {
    let current = response;
    for (const hook of hooks.responseHooks) {
        const result = await hook(current);
        if (result) current = result;
    }
    return current;
}

export function applyTemplateTags(str, templateTags) {
    if (typeof str !== 'string' || !str.includes('{{%')) return str;
    return str.replace(/\{\{%\s*(\w+)\s*%\}\}/g, (match, tagName) => {
        const fn = templateTags[tagName];
        if (typeof fn !== 'function') return match;
        try { return String(fn()); } catch { return match; }
    });
}
