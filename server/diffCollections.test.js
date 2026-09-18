import assert from "node:assert"
import test from "node:test"
import { diffCollections } from "./diffCollections.js"

function req(overrides) {
	return {
		id: "r1",
		name: "Get widget",
		method: "GET",
		url: "https://api.example.com/widgets",
		headers: [],
		params: [],
		body: { type: "none" },
		auth: { type: "none" },
		...overrides,
	}
}

test("diffCollections: identical collections produce no changes, not breaking", async () => {
	const before = { requests: [req({})] }
	const after = { requests: [req({})] }
	const diff = diffCollections(before, after)
	assert.strictEqual(diff.breaking, false)
	assert.strictEqual(diff.summary.removedEndpoints, 0)
	assert.strictEqual(diff.summary.changedEndpoints, 0)
})

test("diffCollections: an endpoint present before and missing after is flagged as removed and breaking", async () => {
	const before = {
		requests: [
			req({ id: "r1", url: "https://api.example.com/widgets" }),
			req({
				id: "r2",
				method: "DELETE",
				url: "https://api.example.com/widgets/{{id}}",
			}),
		],
	}
	const after = {
		requests: [req({ id: "r1", url: "https://api.example.com/widgets" })],
	}
	const diff = diffCollections(before, after)
	assert.strictEqual(diff.breaking, true)
	assert.strictEqual(diff.removedEndpoints.length, 1)
	assert.strictEqual(diff.removedEndpoints[0].method, "DELETE")
})

test("diffCollections: a brand-new endpoint is reported as added, not breaking on its own", async () => {
	const before = { requests: [req({ id: "r1" })] }
	const after = {
		requests: [
			req({ id: "r1" }),
			req({
				id: "r2",
				method: "POST",
				url: "https://api.example.com/widgets",
			}),
		],
	}
	const diff = diffCollections(before, after)
	assert.strictEqual(diff.breaking, false)
	assert.strictEqual(diff.addedEndpoints.length, 1)
})

test("diffCollections: URLs are normalized (host/query ignored) so a re-import from a different base URL still matches", async () => {
	const before = {
		requests: [req({ url: "https://api.example.com/widgets?x=1" })],
	}
	const after = { requests: [req({ url: "http://localhost:3000/widgets" })] }
	const diff = diffCollections(before, after)
	assert.strictEqual(diff.removedEndpoints.length, 0)
	assert.strictEqual(diff.summary.changedEndpoints, 0)
})

test("diffCollections: removed query param on a still-present endpoint is flagged", async () => {
	const before = {
		requests: [req({ params: [{ key: "limit", value: "10", enabled: true }] })],
	}
	const after = { requests: [req({ params: [] })] }
	const diff = diffCollections(before, after)
	assert.strictEqual(diff.changedEndpoints.length, 1)
	assert.strictEqual(diff.changedEndpoints[0].changes[0].type, "params_removed")
	assert.deepStrictEqual(diff.changedEndpoints[0].changes[0].detail, ["limit"])
	assert.strictEqual(diff.breaking, true)
})

test("diffCollections: auth type change (bearer -> none) is flagged and breaking", async () => {
	const before = { requests: [req({ auth: { type: "bearer", token: "x" } })] }
	const after = { requests: [req({ auth: { type: "none" } })] }
	const diff = diffCollections(before, after)
	const change = diff.changedEndpoints[0].changes.find(
		(c) => c.type === "auth_changed",
	)
	assert.deepStrictEqual(change.detail, { from: "bearer", to: "none" })
	assert.strictEqual(diff.breaking, true)
})

test("diffCollections: Content-Type header removal is ignored (routinely varies, not breaking)", async () => {
	const before = {
		requests: [
			req({
				headers: [
					{
						key: "Content-Type",
						value: "application/json",
						enabled: true,
					},
				],
			}),
		],
	}
	const after = { requests: [req({ headers: [] })] }
	const diff = diffCollections(before, after)
	assert.strictEqual(diff.changedEndpoints.length, 0)
})

test("diffCollections: non-Content-Type header removal alone is flagged but not treated as breaking", async () => {
	const before = {
		requests: [
			req({ headers: [{ key: "X-Custom", value: "1", enabled: true }] }),
		],
	}
	const after = { requests: [req({ headers: [] })] }
	const diff = diffCollections(before, after)
	assert.strictEqual(diff.changedEndpoints.length, 1)
	assert.strictEqual(
		diff.changedEndpoints[0].changes[0].type,
		"headers_removed",
	)
	assert.strictEqual(diff.breaking, false)
})

test("diffCollections: body type change (json -> form) is flagged and breaking", async () => {
	const before = { requests: [req({ body: { type: "json" } })] }
	const after = { requests: [req({ body: { type: "form" } })] }
	const diff = diffCollections(before, after)
	const change = diff.changedEndpoints[0].changes.find(
		(c) => c.type === "body_type_changed",
	)
	assert.deepStrictEqual(change.detail, { from: "json", to: "form" })
	assert.strictEqual(diff.breaking, true)
})

console.log("diffCollections.test.js passed")
