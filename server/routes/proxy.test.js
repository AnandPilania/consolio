import assert from "node:assert"
import http from "node:http"
import test from "node:test"
import { executeRequest } from "./proxy.js"

const storage = {
	consolioDir: process.cwd(),
	getConfig: () => ({ settings: {} }),
}

test("apikey auth with placement 'query' appends key=value to the request URL", async () => {
	let receivedUrl
	const server = http.createServer((req, res) => {
		receivedUrl = req.url
		res.end("ok")
	})
	await new Promise((r) => server.listen(0, r))
	const { port } = server.address()

	const { httpStatus } = await executeRequest(
		{
			method: "GET",
			url: `http://127.0.0.1:${port}/path`,
			auth: {
				type: "apikey",
				key: "api_key",
				value: "secret123",
				placement: "query",
			},
			saveToHistory: false,
		},
		{ storage },
	)

	assert.strictEqual(httpStatus, 200)
	assert.ok(
		receivedUrl.includes("api_key=secret123"),
		`expected query param in ${receivedUrl}`,
	)
	server.close()
})

test("apikey auth with placement 'header' still sets the header (no regression)", async () => {
	let receivedHeader
	const server = http.createServer((req, res) => {
		receivedHeader = req.headers.api_key
		res.end("ok")
	})
	await new Promise((r) => server.listen(0, r))
	const { port } = server.address()

	await executeRequest(
		{
			method: "GET",
			url: `http://127.0.0.1:${port}/path`,
			auth: {
				type: "apikey",
				key: "api_key",
				value: "secret123",
				placement: "header",
			},
			saveToHistory: false,
		},
		{ storage },
	)

	assert.strictEqual(receivedHeader, "secret123")
	server.close()
})

test("// history test", async () => {
	let saved
	const historyStorage = {
		consolioDir: process.cwd(),
		getConfig: () => ({ settings: {} }),
		addHistory: (entry) => {
			saved = entry
		},
	}
	const server = http.createServer((_req, res) => res.end("ok"))
	await new Promise((r) => server.listen(0, r))
	const { port } = server.address()

	await executeRequest(
		{
			method: "GET",
			url: `http://127.0.0.1:${port}/path`,
			saveToHistory: true,
			collectionId: "col_abc",
			requestId: "req_xyz",
			requestName: "Get widget",
		},
		{ storage: historyStorage },
	)

	assert.ok(saved, "expected addHistory to be called")
	assert.strictEqual(saved.collectionId, "col_abc")
	assert.strictEqual(saved.requestId, "req_xyz")
	assert.strictEqual(saved.requestName, "Get widget")
	server.close()
})

console.log("proxy.test.js: all checks passed")
