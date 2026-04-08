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

        // Fallback: global user dir (~/.consolio)
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
                version: '0.0.1',
                created: new Date().toISOString(),
                settings: { defaultEnvironment: null, timeout: 30000, followRedirects: true, sslVerify: true }
            }, null, 2));
        }
    }

    getConfig() {
        return JSON.parse(readFileSync(join(this.consolioDir, 'config.json'), 'utf8'));
    }

    saveConfig(config) {
        writeFileSync(join(this.consolioDir, 'config.json'), JSON.stringify(config, null, 2));
    }

    // Collections
    listCollections() {
        const dir = join(this.consolioDir, 'collections');
        return readdirSync(dir)
            .filter(f => f.endsWith('.json'))
            .map(f => {
                const data = JSON.parse(readFileSync(join(dir, f), 'utf8'));
                return { ...data, requests: data.requests || [] };
            });
    }

    getCollection(id) {
        const file = join(this.consolioDir, 'collections', `${id}.json`);
        if (!existsSync(file)) return null;
        return JSON.parse(readFileSync(file, 'utf8'));
    }

    saveCollection(collection) {
        const file = join(this.consolioDir, 'collections', `${collection.id}.json`);
        writeFileSync(file, JSON.stringify(collection, null, 2));
        return collection;
    }

    deleteCollection(id) {
        const file = join(this.consolioDir, 'collections', `${id}.json`);
        if (existsSync(file)) unlinkSync(file);
    }

    // Environments
    listEnvironments() {
        const dir = join(this.consolioDir, 'environments');
        return readdirSync(dir)
            .filter(f => f.endsWith('.json'))
            .map(f => JSON.parse(readFileSync(join(dir, f), 'utf8')));
    }

    saveEnvironment(env) {
        const file = join(this.consolioDir, 'environments', `${env.id}.json`);
        writeFileSync(file, JSON.stringify(env, null, 2));
        return env;
    }

    deleteEnvironment(id) {
        const file = join(this.consolioDir, 'environments', `${id}.json`);
        if (existsSync(file)) unlinkSync(file);
    }

    // History
    addHistory(entry) {
        const histDir = join(this.consolioDir, 'history');
        const file = join(histDir, `${entry.id}.json`);
        writeFileSync(file, JSON.stringify(entry, null, 2));

        // Keep last 200 entries
        const files = readdirSync(histDir).sort();
        if (files.length > 200) {
            files.slice(0, files.length - 200).forEach(f => {
                unlinkSync(join(histDir, f));
            });
        }
        return entry;
    }

    getHistory(limit = 50) {
        const histDir = join(this.consolioDir, 'history');
        return readdirSync(histDir)
            .filter(f => f.endsWith('.json'))
            .sort().reverse()
            .slice(0, limit)
            .map(f => JSON.parse(readFileSync(join(histDir, f), 'utf8')));
    }

    clearHistory() {
        const histDir = join(this.consolioDir, 'history');
        readdirSync(histDir).forEach(f => unlinkSync(join(histDir, f)));
    }
}
