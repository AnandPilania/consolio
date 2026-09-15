import chalk from 'chalk';
import { consolioStorage } from './storage.js';
import { registerCollectionTools } from './mcpServer.js';

function findCollection(storage, arg) {
    const cols = storage.listCollections();
    return cols.find(c => c.id === arg) || cols.find(c => (c.name || '').toLowerCase() === arg.toLowerCase());
}

function findEnvironment(storage, name) {
    if (!name) return null;
    const envs = storage.listEnvironments();
    return envs.find(e => e.id === name) || envs.find(e => (e.name || '').toLowerCase() === name.toLowerCase()) || null;
}

export async function serveMcpCli(collectionArg, options) {
    const storage = new consolioStorage(options.project || process.cwd());
    const col = findCollection(storage, collectionArg);
    if (!col) {
        console.error(chalk.red(`Collection not found: "${collectionArg}"`));
        return 2;
    }
    const env = findEnvironment(storage, options.env);
    if (options.env && !env) {
        console.error(chalk.red(`Environment not found: "${options.env}"`));
        return 2;
    }
    if (!col.requests?.length) {
        console.error(chalk.red(`Collection "${col.name}" has no requests — nothing to expose as MCP tools.`));
        return 2;
    }

    const baseEnvironment = Object.fromEntries((env?.variables || []).filter(v => v.enabled).map(v => [v.key, v.value]));
    const secretVarNames = new Set((env?.variables || []).filter(v => v.secret).map(v => v.key));

    const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
    const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');

    const mcpServer = new McpServer({ name: `consolio-${col.name}`, version: '1.0.0' });
    const registered = registerCollectionTools(mcpServer, col, { storage, baseEnvironment, secretVarNames });

    console.error(chalk.dim(`  consolio mcp serve — "${col.name}"`));
    console.error(chalk.dim(`  ${registered.length} tool(s) registered${env ? ` (environment: ${env.name})` : ''}`));
    for (const r of registered) console.error(chalk.dim(`    - ${r.toolName}`));

    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);

    await new Promise((resolve) => { transport.onclose = resolve; });
    return 0;
}

export async function generateMcpManifest(collectionArg, options) {
    const storage = new consolioStorage(options.project || process.cwd());
    const col = findCollection(storage, collectionArg);
    if (!col) {
        console.error(chalk.red(`Collection not found: "${collectionArg}"`));
        return 2;
    }
    const env = findEnvironment(storage, options.env);
    const secretVarNames = new Set((env?.variables || []).filter(v => v.secret).map(v => v.key));

    const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
    const previewServer = new McpServer({ name: 'preview', version: '0.0.0' });
    const registered = registerCollectionTools(previewServer, col, { storage, secretVarNames });

    const manifest = registered.map(r => ({
        name: r.toolName,
        request: `${col.requests.find(req => req.id === r.requestId)?.method} ${col.requests.find(req => req.id === r.requestId)?.url}`,
    }));

    if (options.out) {
        const { writeFileSync } = await import('fs');
        writeFileSync(options.out, JSON.stringify({ server: `consolio-${col.name}`, tools: manifest }, null, 2));
        console.log(chalk.green(`✔  Wrote ${manifest.length} tool manifest entries to ${options.out}`));
    } else {
        console.log(chalk.green(`✔  "${col.name}" would expose ${manifest.length} MCP tool(s):`));
        for (const m of manifest) console.log(`   ${chalk.cyan(m.name.padEnd(30))} ${m.request}`);
        console.log(chalk.dim(`\n  Run "consolio mcp serve ${collectionArg}" to actually start the server (stdio transport).`));
    }
    return 0;
}
