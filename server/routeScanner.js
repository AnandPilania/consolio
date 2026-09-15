import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const DEFAULT_IGNORE = new Set(['node_modules', '.git', 'dist', 'build', '.consolio', 'coverage', '.next', '.nuxt']);
const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts']);
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

const EXPRESS_FASTIFY_RE = new RegExp(
    `\\b(?:app|router|fastify|server)\\s*\\.\\s*(${HTTP_METHODS.join('|')})\\s*\\(\\s*(['"\`])((?:\\\\.|(?!\\2).)*)\\2`,
    'gi'
);

const FASTIFY_ROUTE_OBJECT_RE = /\.route\s*\(\s*\{([^}]*)\}/gi;
const FASTIFY_OBJ_METHOD_RE = /method\s*:\s*['"`](\w+)['"`]/i;
const FASTIFY_OBJ_URL_RE = /url\s*:\s*['"`]([^'"`]+)['"`]/i;

const NEST_METHOD_DECORATOR_RE = new RegExp(`@(${HTTP_METHODS.map(m => m[0].toUpperCase() + m.slice(1)).join('|')})\\s*\\(\\s*(?:['"\`]([^'"\`]*)['"\`])?\\s*\\)`, 'g');
const NEST_CONTROLLER_RE = /@Controller\s*\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/;

function walk(dir, ignore, files = []) {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return files; }
    for (const entry of entries) {
        if (ignore.has(entry.name)) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(full, ignore, files);
        } else if (SOURCE_EXTENSIONS.has(extname(entry.name))) {
            files.push(full);
        }
    }
    return files;
}

function templatizePath(path) {
    const params = [];
    const templated = path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, name) => {
        params.push(name);
        return `{{${name}}}`;
    });
    return { templated, params };
}

function scanExpressFastify(content, filePath, out) {
    let m;
    EXPRESS_FASTIFY_RE.lastIndex = 0;
    while ((m = EXPRESS_FASTIFY_RE.exec(content))) {
        const [, method, , rawPath] = m;
        if (!rawPath.startsWith('/')) continue; // skip non-path first args (middleware names etc.)
        out.push({ method: method.toUpperCase(), path: rawPath, file: filePath, style: 'express/fastify' });
    }

    FASTIFY_ROUTE_OBJECT_RE.lastIndex = 0;
    while ((m = FASTIFY_ROUTE_OBJECT_RE.exec(content))) {
        const body = m[1];
        const methodMatch = FASTIFY_OBJ_METHOD_RE.exec(body);
        const urlMatch = FASTIFY_OBJ_URL_RE.exec(body);
        if (methodMatch && urlMatch && urlMatch[1].startsWith('/')) {
            out.push({ method: methodMatch[1].toUpperCase(), path: urlMatch[1], file: filePath, style: 'fastify-object' });
        }
    }
}

function scanNest(content, filePath, out) {
    const controllerMatch = NEST_CONTROLLER_RE.exec(content);
    const base = controllerMatch?.[1] ? `/${controllerMatch[1]}`.replace(/\/+/g, '/') : '';
    if (!content.includes('@Controller') && !/@(Get|Post|Put|Patch|Delete|Head|Options)\s*\(/.test(content)) return;

    let m;
    NEST_METHOD_DECORATOR_RE.lastIndex = 0;
    while ((m = NEST_METHOD_DECORATOR_RE.exec(content))) {
        const [, method, subPath] = m;
        const full = `${base}${subPath ? `/${subPath}` : ''}`.replace(/\/+/g, '/') || '/';
        out.push({ method: method.toUpperCase(), path: full, file: filePath, style: 'nestjs' });
    }
}

export function scanProjectRoutes(rootDir, { baseUrl = '', ignore = [] } = {}) {
    const ignoreSet = new Set([...DEFAULT_IGNORE, ...ignore]);
    const files = walk(rootDir, ignoreSet);

    const found = [];
    for (const file of files) {
        let content;
        try { content = readFileSync(file, 'utf8'); } catch { continue; }
        scanExpressFastify(content, file, found);
        scanNest(content, file, found);
    }

    const seen = new Set();
    const deduped = found.filter(r => {
        const key = `${r.method} ${r.path}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    const folderByFile = {};
    const folders = [];
    const folderFor = (filePath) => {
        const rel = relative(rootDir, filePath);
        if (!folderByFile[rel]) {
            const folder = { id: `scan_fld_${folders.length}`, name: rel, parentId: null };
            folderByFile[rel] = folder;
            folders.push(folder);
        }
        return folderByFile[rel].id;
    };

    const requests = deduped
        .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))
        .map((r, i) => {
            const { templated, params } = templatizePath(r.path);
            return {
                id: `scan_req_${i}`,
                name: `${r.method} ${r.path}`,
                description: `Discovered in ${relative(rootDir, r.file)} (${r.style})`,
                method: r.method,
                url: `${baseUrl}${templated}`,
                headers: [], params: [],
                body: ['POST', 'PUT', 'PATCH'].includes(r.method) ? { type: 'json', content: '{}' } : { type: 'none', content: '' },
                auth: { type: 'none' },
                folderId: folderFor(r.file),
                _discoveredParams: params, // informational only — not part of the stored request shape
            };
        });

    return {
        name: 'Discovered Routes',
        description: `Scanned from ${rootDir} — ${requests.length} route(s) found across ${files.length} file(s)`,
        folders,
        requests,
        filesScanned: files.length,
    };
}
