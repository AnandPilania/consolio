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

program
    .command('scan')
    .description('Discover API routes by statically scanning Express/Fastify/NestJS source files (no OpenAPI spec needed)')
    .option('--project <path>', 'Path to the project directory to scan', process.cwd())
    .option('--path <subpath>', 'Subdirectory within the project to scan (defaults to the whole project)')
    .option('--base-url <url>', 'Base URL to prefix onto every discovered route', '')
    .option('-o, --out <file>', 'Write the discovered collection as JSON to this file instead of printing a summary')
    .action(async (options) => {
        const { scanProjectRoutes } = await import('../server/routeScanner.js');
        const { resolve } = await import('path');
        const root = options.path ? resolve(options.project, options.path) : resolve(options.project);
        console.log(BANNER);
        console.log(chalk.dim(`  Scanning ${root} ...`));
        const result = scanProjectRoutes(root, { baseUrl: options.baseUrl });
        if (options.out) {
            const { writeFileSync } = await import('fs');
            writeFileSync(options.out, JSON.stringify(result, null, 2));
            console.log(chalk.green(`✔  Wrote ${result.requests.length} discovered route(s) to ${options.out}`));
        } else {
            console.log(chalk.green(`✔  Found ${result.requests.length} route(s) across ${result.filesScanned} file(s):`));
            for (const r of result.requests) {
                console.log(`   ${chalk.cyan(r.method.padEnd(7))} ${r.url}`);
            }
            console.log(chalk.dim(`\n  Run with --out routes.json to save, or scan from the UI's Import → Scan Codebase tab.`));
        }
    });

program
    .command('mcp')
    .description('MCP server tools — expose a collection\'s requests as Model Context Protocol tools')
    .addCommand(
        program.createCommand('serve')
            .description('Serve a collection as an MCP server over stdio (for Claude Desktop, Cursor, etc.)')
            .argument('<collection>', 'Collection id or name')
            .option('-e, --env <n>', 'Environment id or name to use for {{variables}} and secrets')
            .option('--project <path>', 'Path to project directory', process.cwd())
            .action(async (collection, options) => {
                const { serveMcpCli } = await import('../server/mcp-cli.js');
                const exitCode = await serveMcpCli(collection, options);
                if (exitCode !== 0) process.exit(exitCode);
            })
    )
    .addCommand(
        program.createCommand('generate')
            .description('Preview the MCP tool manifest a collection would expose, without starting a server')
            .argument('<collection>', 'Collection id or name')
            .option('-e, --env <n>', 'Environment id or name (only affects which vars are treated as secret)')
            .option('--project <path>', 'Path to project directory', process.cwd())
            .option('-o, --out <file>', 'Write the manifest as JSON to this file instead of printing it')
            .action(async (collection, options) => {
                const { generateMcpManifest } = await import('../server/mcp-cli.js');
                const exitCode = await generateMcpManifest(collection, options);
                if (exitCode !== 0) process.exit(exitCode);
            })
    );

program.parse();
