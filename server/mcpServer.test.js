import assert from "node:assert"
import http from "node:http"
import test from "node:test"
import { registerCollectionTools } from "./mcpServer.js"

function fakeMcpServer() {
	const tools = {}
	return {
		registerTool(name, config, cb) {
			tools[name] = { config, cb }
		},
		tools,
	}
}

function fakeStorage() {
	const history = []
	return {
		addHistory: (e) => history.push(e),
		history,
		consolioDir: process.cwd(),
		getConfig: () => ({ settings: {} }),
	}
}

test("registerCollectionTools: one tool per request, named from a slugified request name", async () => {
	const server = fakeMcpServer()
	const collection = {
		id: "col_1",
		requests: [
			{
				id: "r1",
				name: "Get User",
				method: "GET",
				url: "https://api.example.com/users/{{id}}",
				headers: [],
				params: [],
				body: { type: "none" },
				auth: { type: "none" },
			},
			{
				id: "r2",
				name: "List Users",
				method: "GET",
				url: "https://api.example.com/users",
				headers: [],
				params: [{ key: "limit", value: "10", enabled: true }],
				body: { type: "none" },
				auth: { type: "none" },
			},
		],
	}
	const registered = registerCollectionTools(server, collection, {
		storage: fakeStorage(),
	})

	assert.strictEqual(registered.length, 2)
	assert.ok(server.tools.get_user)
	assert.ok(server.tools.list_users)
	assert.strictEqual(server.tools.get_user.config.title, "Get User")
})

test("registerCollectionTools: input schema includes {{id}} as a var, and the declared 'limit' param", async () => {
	const server = fakeMcpServer()
	const collection = {
		id: "col_1",
		requests: [
			{
				id: "r1",
				name: "Get User",
				method: "GET",
				url: "https://api.example.com/users/{{id}}",
				headers: [],
				params: [{ key: "verbose", value: "true", enabled: true }],
				body: { type: "none" },
				auth: { type: "none" },
			},
		],
	}
	registerCollectionTools(server, collection, { storage: fakeStorage() })
	const shape = server.tools.get_user.config.inputSchema
	assert.ok("id" in shape)
	assert.ok("verbose" in shape)
})

test("registerCollectionTools: name collisions get de-duplicated with a numeric suffix", async () => {
	const server = fakeMcpServer()
	const collection = {
		id: "col_1",
		requests: [
			{
				id: "r1",
				name: "Get Thing",
				method: "GET",
				url: "https://api.example.com/a",
				headers: [],
				params: [],
				body: { type: "none" },
				auth: { type: "none" },
			},
			{
				id: "r2",
				name: "Get Thing",
				method: "GET",
				url: "https://api.example.com/b",
				headers: [],
				params: [],
				body: { type: "none" },
				auth: { type: "none" },
			},
		],
	}
	const registered = registerCollectionTools(server, collection, {
		storage: fakeStorage(),
	})
	const names = registered.map((r) => r.toolName)
	assert.strictEqual(new Set(names).size, 2)
	assert.ok(names.includes("get_thing"))
	assert.ok(names.includes("get_thing_2"))
})

test("registerCollectionTools: secret env vars are excluded from the input schema (never asked of the agent)", async () => {
	const server = fakeMcpServer()
	const collection = {
		id: "col_1",
		requests: [
			{
				id: "r1",
				name: "Auth Call",
				method: "GET",
				url: "https://api.example.com/data",
				headers: [
					{
						key: "Authorization",
						value: "Bearer {{API_KEY}}",
						enabled: true,
					},
				],
				params: [],
				body: { type: "none" },
				auth: { type: "none" },
			},
		],
	}
	registerCollectionTools(server, collection, {
		storage: fakeStorage(),
		secretVarNames: new Set(["API_KEY"]),
	})
	const shape = server.tools.auth_call.config.inputSchema
	assert.ok(!("API_KEY" in shape))
})

test("Tool call: invoking the callback actually executes the HTTP request and returns MCP content", async () => {
	const httpServer = http.createServer((req, res) => {
		res.writeHead(200, { "Content-Type": "application/json" })
		res.end(JSON.stringify({ ok: true, path: req.url }))
	})
	await new Promise((r) => httpServer.listen(0, r))
	const { port } = httpServer.address()

	const server = fakeMcpServer()
	const storage = fakeStorage()
	const collection = {
		id: "col_1",
		requests: [
			{
				id: "r1",
				name: "Ping",
				method: "GET",
				url: `http://127.0.0.1:${port}/ping`,
				headers: [],
				params: [],
				body: { type: "none" },
				auth: { type: "none" },
			},
		],
	}
	registerCollectionTools(server, collection, { storage })

	const result = await server.tools.ping.cb({})
	assert.strictEqual(result.isError, false)
	assert.ok(result.content[0].text.includes("200"))
	assert.ok(
		result.content[0].text.includes('"ok":true') ||
			result.content[0].text.includes("ok"),
	)
	assert.strictEqual(
		storage.history.length,
		1,
		"expected the tool call to be logged to history",
	)

	httpServer.close()
})

test("Tool call: agent-supplied args override {{var}} template values in the URL", async () => {
	let capturedPath
	const httpServer = http.createServer((req, res) => {
		capturedPath = req.url
		res.writeHead(200, { "Content-Type": "application/json" })
		res.end(JSON.stringify({ received: true }))
	})
	await new Promise((r) => httpServer.listen(0, r))
	const { port } = httpServer.address()

	const server = fakeMcpServer()
	const storage = fakeStorage()
	const collection = {
		id: "col_1",
		requests: [
			{
				id: "r1",
				name: "Get Widget",
				method: "GET",
				url: `http://127.0.0.1:${port}/widgets/{{id}}`,
				headers: [],
				params: [],
				body: { type: "none" },
				auth: { type: "none" },
			},
		],
	}
	registerCollectionTools(server, collection, { storage })

	await server.tools.get_widget.cb({ id: "42" })
	assert.strictEqual(capturedPath, "/widgets/42")

	httpServer.close()
})

test("Tool call: a 4xx/5xx response is reported as isError without throwing", async () => {
	const httpServer = http.createServer((_req, res) => {
		res.writeHead(404)
		res.end("not found")
	})
	await new Promise((r) => httpServer.listen(0, r))
	const { port } = httpServer.address()

	const server = fakeMcpServer()
	const collection = {
		id: "col_1",
		requests: [
			{
				id: "r1",
				name: "Missing",
				method: "GET",
				url: `http://127.0.0.1:${port}/nope`,
				headers: [],
				params: [],
				body: { type: "none" },
				auth: { type: "none" },
			},
		],
	}
	registerCollectionTools(server, collection, { storage: fakeStorage() })

	const result = await server.tools.missing.cb({})
	assert.strictEqual(result.isError, true)
	assert.ok(result.content[0].text.includes("404"))

	httpServer.close()
})

console.log("mcpServer.test.js passed")
