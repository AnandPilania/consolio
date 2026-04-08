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
    .description('Start the consolio server and open the UI')
    .option('-p, --port <port>', 'Port to run on', '4242')
    .option('--no-open', 'Do not auto-open browser')
    .option('--project <path>', 'Path to project directory', process.cwd())
    .action(async (options) => {
        console.log(BANNER);
        await startServer({
            port: parseInt(options.port),
            autoOpen: options.open,
            projectPath: options.project
        });
    });

program
    .command('init')
    .description('Initialize consolio in the current project (creates .consolio/ directory)')
    .option('--name <name>', 'Project name', 'My Project')
    .action(async (options) => {
        console.log(BANNER);
        await initProject({ name: options.name });
    });

program.parse();
