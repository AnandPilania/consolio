import {
    existsSync, mkdirSync, readdirSync,
    readFileSync, writeFileSync, unlinkSync
} from 'fs';
import { join } from 'path';

export class consolioStorage {
    constructor(projectPath) {
        this.projectPath = projectPath;
        this.consolioDir = join(projectPath, '.consolio');
        this.isProjectMode = existsSync(this.consolioDir);
        if (!this.isProjectMode) {
            const home = process.env.HOME || process.env.USERPROFILE || '';
            this.consolioDir = join(home, '.consolio', 'global');
        }
        this._ensureDirs();
    }

    _ensureDirs() {
        ['collections', 'environments', 'history'].forEach(d => {
            mkdirSync(join(this.consolioDir, d), { recursive: true });
        });
        if (!existsSync(join(this.consolioDir, 'config.json'))) {
            writeFileSync(join(this.consolioDir, 'config.json'), JSON.stringify({
                name: this.isProjectMode ? 'Project' : 'Global Workspace',
                version: '0.1.0',
                created: new Date().toISOString(),
                settings: { defaultEnvironment: null, timeout: 30000, followRedirects: true, sslVerify: true }
            }, null, 2));
        }
    }

    getConfig() { return JSON.parse(readFileSync(join(this.consolioDir, 'config.json'), 'utf8')); }
    saveConfig(c) { writeFileSync(join(this.consolioDir, 'config.json'), JSON.stringify(c, null, 2)); }

    listCollections() {
        const dir = join(this.consolioDir, 'collections');
        return readdirSync(dir).filter(f => f.endsWith('.json'))
            .map(f => { const d = JSON.parse(readFileSync(join(dir, f), 'utf8')); return { ...d, requests: d.requests || [] }; });
    }
    getCollection(id) {
        const file = join(this.consolioDir, 'collections', `${id}.json`);
        if (!existsSync(file)) return null;
        return JSON.parse(readFileSync(file, 'utf8'));
    }
    saveCollection(c) {
        writeFileSync(join(this.consolioDir, 'collections', `${c.id}.json`), JSON.stringify(c, null, 2));
        return c;
    }
    deleteCollection(id) {
        const f = join(this.consolioDir, 'collections', `${id}.json`);
        if (existsSync(f)) unlinkSync(f);
    }

    listEnvironments() {
        const dir = join(this.consolioDir, 'environments');
        return readdirSync(dir).filter(f => f.endsWith('.json'))
            .map(f => JSON.parse(readFileSync(join(dir, f), 'utf8')));
    }
    saveEnvironment(e) {
        writeFileSync(join(this.consolioDir, 'environments', `${e.id}.json`), JSON.stringify(e, null, 2));
        return e;
    }
    deleteEnvironment(id) {
        const f = join(this.consolioDir, 'environments', `${id}.json`);
        if (existsSync(f)) unlinkSync(f);
    }

    addHistory(entry) {
        const histDir = join(this.consolioDir, 'history');
        writeFileSync(join(histDir, `${entry.id}.json`), JSON.stringify(entry, null, 2));
        const files = readdirSync(histDir).sort();
        if (files.length > 200) files.slice(0, files.length - 200).forEach(f => unlinkSync(join(histDir, f)));
        return entry;
    }
    getHistory(limit = 50) {
        const histDir = join(this.consolioDir, 'history');
        return readdirSync(histDir).filter(f => f.endsWith('.json')).sort().reverse()
            .slice(0, limit).map(f => JSON.parse(readFileSync(join(histDir, f), 'utf8')));
    }
    clearHistory() {
        const d = join(this.consolioDir, 'history');
        readdirSync(d).forEach(f => unlinkSync(join(d, f)));
    }
}
