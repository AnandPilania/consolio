import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';

export async function initProject({ name = 'My Project' } = {}) {
    const consolioDir = join(process.cwd(), '.consolio');

    if (existsSync(consolioDir)) {
        console.log(chalk.yellow('⚠  .consolio/ already exists in this directory.'));
        return;
    }

    mkdirSync(consolioDir, { recursive: true });
    mkdirSync(join(consolioDir, 'collections'), { recursive: true });
    mkdirSync(join(consolioDir, 'environments'), { recursive: true });
    mkdirSync(join(consolioDir, 'history'), { recursive: true });

    // Project config
    const config = {
        name,
        version: '0.0.1',
        created: new Date().toISOString(),
        settings: {
            defaultEnvironment: null,
            timeout: 30000,
            followRedirects: true,
            sslVerify: true
        }
    };
    writeFileSync(join(consolioDir, 'config.json'), JSON.stringify(config, null, 2));

    // Default "Example" collection
    const exampleCollection = {
        id: 'example',
        name: 'Example Collection',
        description: 'Getting started with consolio',
        created: new Date().toISOString(),
        requests: [
            {
                id: 'req_001',
                name: 'Health Check',
                method: 'GET',
                url: 'https://httpbin.org/get',
                headers: [{ key: 'Accept', value: 'application/json', enabled: true }],
                params: [{ key: 'source', value: 'consolio', enabled: true }],
                body: { type: 'none', content: '' },
                auth: { type: 'none' }
            },
            {
                id: 'req_002',
                name: 'Post JSON',
                method: 'POST',
                url: 'https://httpbin.org/post',
                headers: [
                    { key: 'Content-Type', value: 'application/json', enabled: true },
                    { key: 'Accept', value: 'application/json', enabled: true }
                ],
                params: [],
                body: {
                    type: 'json',
                    content: JSON.stringify({ hello: 'world', from: 'consolio' }, null, 2)
                },
                auth: { type: 'none' }
            }
        ]
    };
    writeFileSync(
        join(consolioDir, 'collections', 'example.json'),
        JSON.stringify(exampleCollection, null, 2)
    );

    // Default environment
    const devEnv = {
        id: 'development',
        name: 'Development',
        color: '#22c55e',
        variables: [
            { key: 'BASE_URL', value: 'http://localhost:3000', enabled: true, secret: false },
            { key: 'API_KEY', value: '', enabled: true, secret: true }
        ]
    };
    writeFileSync(
        join(consolioDir, 'environments', 'development.json'),
        JSON.stringify(devEnv, null, 2)
    );

    // .gitignore hint
    const gitignoreHint = `# consolio - keep collections & environments, ignore sensitive data\n.consolio/history/\n`;
    writeFileSync(join(consolioDir, '.gitignore'), gitignoreHint);

    console.log(chalk.green(`✔  consolio initialized for project "${name}"`));
    console.log(chalk.dim(`   Created: .consolio/`));
    console.log(chalk.dim(`   - collections/example.json`));
    console.log(chalk.dim(`   - environments/development.json`));
    console.log(chalk.dim(`   - config.json`));
    console.log('');
    console.log(chalk.cyan(`   Run ${chalk.white('npx consolio')} to start testing!`));
}
