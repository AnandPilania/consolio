import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
// On Windows, npm is a .cmd shim — plain execFile('npm', ...) can't resolve it without
// either the extension or a shell (unlike POSIX, where the bare name works via PATH).
const NPM_CMD = process.platform === 'win32' ? 'npm.cmd' : 'npm';

// consolio ships a handful of genuinely useful plugins in its own top-level plugins/ folder
// (see package.json's "files" list — it's included when the package is published). This is
// the package's own source directory, unrelated to the *runtime* <consolioDir>/plugins/
// workspace that getPluginsDir() resolves per-project/global above — same name, different
// thing: one is shipped source, the other is where installs actually land. Bundled-plugin
// installs resolve a name against this fixed, server-enumerated list of real directories
// rather than accepting an arbitrary path from the request, so the one-click "install" button
// can't be turned into a path-traversal/arbitrary-install primitive by a hostile origin.
const BUNDLED_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'plugins');

export function listBundledPlugins() {
    if (!existsSync(BUNDLED_DIR)) return [];
    return readdirSync(BUNDLED_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => {
            const pkgPath = join(BUNDLED_DIR, d.name, 'package.json');
            if (!existsSync(pkgPath)) return null;
            const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
            return { dir: d.name, name: pkg.name, description: pkg.description || '' };
        })
        .filter(Boolean);
}

// Plugins live in <consolioDir>/plugins/ as a real npm project (its own package.json +
// node_modules), so `npm install <name>` there is just... npm install. Enabled/disabled
// state isn't something npm tracks, so that lives in a small sidecar manifest.json.
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
    return Object.entries(pkg.dependencies || {}).map(([name, version]) => ({
        name, version, enabled: manifest.enabled[name] !== false, // default enabled once installed
    }));
}

// Windows can't spawn npm's .cmd shim without shell:true (Node refuses EINVAL otherwise),
// and shell:true does NOT escape array args — it concatenates them into a shell command
// line. Since this server's CORS is wide open, any page the user visits could POST here,
// so `name` MUST be constrained to npm's own package-name character set before it ever
// reaches a shell. A local filesystem path (used in tests/dev) is exempt from this check —
// only the HTTP route needs to enforce it, since that's the actual attack surface.
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
    // `name` may be a local path (used by tests) rather than the installed package's own
    // name — npm records the package's declared name as the dependency key regardless, so
    // diff the dependency list to find what was actually added instead of trusting `name`.
    const after = readDependencyNames(dir);
    const installedName = [...after].find(n => !before.has(n)) ?? name;
    const manifest = readManifest(dir);
    manifest.enabled[installedName] = true;
    writeManifest(dir, manifest);
    return listInstalledPlugins(storage).find(p => p.name === installedName);
}

// `dirName` must match one of listBundledPlugins()'s own `dir` values — it's checked against
// that server-enumerated list, never used as a raw path, so a route can expose this safely.
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

// Dynamically imports every enabled plugin's entry point and collects its hooks.
// Node caches ES module imports by resolved URL, so re-calling this per request is cheap
// after the first load — no separate cache layer needed.
export async function loadEnabledPlugins(storage) {
    const dir = getPluginsDir(storage);
    const installed = listInstalledPlugins(storage).filter(p => p.enabled);
    const hooks = { requestHooks: [], responseHooks: [], templateTags: {} };

    for (const { name } of installed) {
        try {
            const pkgPath = join(dir, 'node_modules', name, 'package.json');
            const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
            const entry = join(dir, 'node_modules', name, pkg.main || 'index.js');
            const mod = await import(pathToFileURL(entry).href);
            const plugin = mod.default || mod;
            if (Array.isArray(plugin.requestHooks)) hooks.requestHooks.push(...plugin.requestHooks);
            if (Array.isArray(plugin.responseHooks)) hooks.responseHooks.push(...plugin.responseHooks);
            if (plugin.templateTags && typeof plugin.templateTags === 'object') Object.assign(hooks.templateTags, plugin.templateTags);
        } catch (e) {
            console.error(`[plugins] Failed to load "${name}": ${e.message}`);
        }
    }
    return hooks;
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

// Resolves {{% tagName %}} using plugin-provided template tag functions — a second,
// separate syntax from the existing {{VAR}} environment-variable substitution.
export function applyTemplateTags(str, templateTags) {
    if (typeof str !== 'string' || !str.includes('{{%')) return str;
    return str.replace(/\{\{%\s*(\w+)\s*%\}\}/g, (match, tagName) => {
        const fn = templateTags[tagName];
        if (typeof fn !== 'function') return match;
        try { return String(fn()); } catch { return match; }
    });
}
