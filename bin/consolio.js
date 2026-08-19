#!/usr/bin/env node
import { program } from 'commander';
import chalk from 'chalk';
import { startServer } from '../server/index.js';
import { initProject } from '../server/init.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));

const BANNER = `
${chalk.cyan('╔═════════════════════════════════════════╗')}
${chalk.cyan('║')}  ${chalk.bold.white('⚡ consolio')} ${chalk.dim('— API Testing, Ultralight')}  ${chalk.cyan('║')}
${chalk.cyan('╚═════════════════════════════════════════╝')}
`;

program
    .name('consolio')
    .description('Lightweight project-isolated API testing tool')
    .version(pkg.version);

program
    .command('start', { isDefault: true })
    .description('Start the consolio server')
    .option('-p, --port <port>', 'Port to run on', '4242')
    .option('--no-open', 'Do not auto-open browser')
    .option('--dev', 'API-only mode — use alongside `npm run dev:ui` for hot-reload')
    .option('--project <path>', 'Path to project directory', process.cwd())
    .action(async (options) => {
        if (options.dev) process.env.CONSOLIO_DEV = 'true';
        console.log(BANNER);
        await startServer({
            port:        parseInt(options.port),
            autoOpen:    options.open,
            projectPath: options.project,
        });
    });

program
    .command('init')
    .description('Initialize consolio in the current project')
    .option('--name <n>', 'Project name', 'My Project')
    .action(async (options) => {
        console.log(BANNER);
        await initProject({ name: options.name });
    });

program
    .command('run <collection>')
    .description('Run a collection headlessly (id or name) — like Newman, no browser needed')
    .option('-e, --env <name>', 'Environment id or name to use')
    .option('-r, --reporter <type>', 'Reporter: cli | json | junit', 'cli')
    .option('-c, --concurrency <n>', 'Requests to run in parallel', '1')
    .option('-d, --delay <ms>', 'Delay between batches, in ms', '0')
    .option('--bail', 'Stop on the first failing request')
    .option('--project <path>', 'Path to project directory', process.cwd())
    .action(async (collection, options) => {
        const { runCollectionCli } = await import('../server/runner-cli.js');
        const exitCode = await runCollectionCli(collection, options);
        process.exit(exitCode);
    });

program.parse();
