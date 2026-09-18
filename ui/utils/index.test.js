import assert from "node:assert"
import test from "node:test"
import { parse as parseYaml } from "yaml"
import {
	buildCurl,
	buildHarRequest,
	buildJUnitXml,
	diffLines,
	exportInsomniaCollection,
	exportOpenAPI,
	exportPostmanCollection,
	importInsomniaExport,
	importOpenAPI,
	importPostmanCollection,
	parseCurl,
} from "./index.js"

test("GraphQL body type: query + variables shape into a single JSON POST body", async () => {
	const req = {
		method: "POST",
		url: "http://localhost/graphql",
		headers: [],
		params: [],
		auth: { type: "none" },
		body: {
			type: "graphql",
			query: "query Hello($name: String) { hello(name: $name) }",
			variables: '{"name":"Ada"}',
		},
	}
	const curl = buildCurl(req)
	assert.ok(
		curl.includes(
			`-d '{"query":"query Hello($name: String) { hello(name: $name) }","variables":{"name":"Ada"}}'`,
		),
	)
	const har = buildHarRequest(req)
	assert.strictEqual(har.postData.mimeType, "application/json")
	assert.deepStrictEqual(JSON.parse(har.postData.text), {
		query: req.body.query,
		variables: { name: "Ada" },
	})
})

test("diffLines: same/add/del classification for a simple 3-line change", async () => {
	const d = diffLines("a\nb\nc", "a\nx\nc")
	assert.deepStrictEqual(
		d.map((l) => l.type),
		["same", "del", "add", "same"],
	)
	assert.strictEqual(d.find((l) => l.type === "del").line, "b")
	assert.strictEqual(d.find((l) => l.type === "add").line, "x")
	assert.strictEqual(
		diffLines("same", "same").every((l) => l.type === "same"),
		true,
	)
})

test("buildJUnitXml: failure count and escaping", async () => {
	const xml = buildJUnitXml("Suite <1>", [
		{ name: "ok", pass: true, elapsed: 10 },
		{ name: "bad", pass: false, elapsed: 5, error: "x < y" },
	])
	assert.ok(xml.includes('tests="2" failures="1"'))
	assert.ok(xml.includes("Suite &lt;1&gt;"))
	assert.ok(xml.includes("x &lt; y"))
})

test("parseCurl: long-flag variants (--header, --request, --data-raw) it previously missed", async () => {
	const r = parseCurl(
		`curl --request POST --url 'https://api.example.com/x' --header 'X-Api-Key: abc' --data-raw '{"a":1}'`,
	)
	assert.strictEqual(r.method, "POST")
	assert.strictEqual(r.url, "https://api.example.com/x")
	assert.strictEqual(r.headers[0].key, "X-Api-Key")
	assert.strictEqual(r.body.type, "json")
})

test("parseCurl: multipart -F fields, including a file field", async () => {
	const r = parseCurl(
		`curl -X POST 'https://api.example.com/upload' -F 'name=John' -F 'avatar=@photo.png;type=image/png'`,
	)
	assert.strictEqual(r.body.type, "multipart")
	assert.strictEqual(r.body.fields.length, 2)
	assert.strictEqual(r.body.fields[0].value, "John")
	assert.strictEqual(r.body.fields[1].type, "file")
	assert.strictEqual(r.body.fields[1].fileName, "photo.png")
})

test("Postman import: nested folders preserved, folderId wired up", async () => {
	const postman = {
		info: { name: "Demo" },
		item: [
			{
				name: "Auth",
				item: [
					{
						name: "Login",
						request: { method: "POST", url: "/login" },
					},
				],
			},
			{ name: "Ping", request: { method: "GET", url: "/ping" } },
		],
	}
	const col = importPostmanCollection(postman)
	assert.strictEqual(col.folders.length, 1)
	assert.strictEqual(col.folders[0].name, "Auth")
	const login = col.requests.find((r) => r.name === "Login")
	assert.strictEqual(login.folderId, col.folders[0].id)
	const ping = col.requests.find((r) => r.name === "Ping")
	assert.strictEqual(ping.folderId, null)

	const exported = exportPostmanCollection(col)
	assert.strictEqual(exported.item.length, 2) // Auth folder + Ping request at root
	const authFolder = exported.item.find((i) => i.item)
	assert.strictEqual(authFolder.item[0].name, "Login")
})

test("Insomnia import: request_group nesting + body/auth mapping", async () => {
	const insomnia = {
		_type: "export",
		__export_format: 4,
		resources: [
			{ _id: "wrk_1", _type: "workspace", name: "Demo" },
			{
				_id: "grp_1",
				_type: "request_group",
				name: "Auth",
				parentId: "wrk_1",
			},
			{
				_id: "req_1",
				_type: "request",
				name: "Login",
				method: "post",
				url: "/login",
				parentId: "grp_1",
				body: { mimeType: "application/json", text: '{"u":1}' },
				authentication: { type: "bearer", token: "tok" },
			},
		],
	}
	const col = importInsomniaExport(insomnia)
	assert.strictEqual(col.folders.length, 1)
	assert.strictEqual(col.requests[0].folderId, col.folders[0].id)
	assert.strictEqual(col.requests[0].method, "POST")
	assert.strictEqual(col.requests[0].auth.type, "bearer")

	const exported = exportInsomniaCollection(col)
	assert.strictEqual(
		exported.resources.filter((r) => r._type === "request_group").length,
		1,
	)
	assert.strictEqual(
		exported.resources.filter((r) => r._type === "request").length,
		1,
	)
})

test("OpenAPI import: paths × methods, tag-based folders, YAML parsing", async () => {
	const yamlSpec = `
openapi: 3.0.0
info:
  title: Pet API
servers:
  - url: https://api.pets.dev
paths:
  /pets:
    get:
      tags: [Pets]
      summary: List pets
    post:
      tags: [Pets]
      summary: Create pet
      requestBody:
        content:
          application/json:
            example: { name: Fido }
`
	const col = importOpenAPI(yamlSpec, parseYaml)
	assert.strictEqual(col.name, "Pet API")
	assert.strictEqual(col.folders.length, 1)
	assert.strictEqual(col.folders[0].name, "Pets")
	assert.strictEqual(col.requests.length, 2)
	const createPet = col.requests.find((r) => r.method === "POST")
	assert.strictEqual(createPet.url, "https://api.pets.dev/pets")
	assert.ok(createPet.body.content.includes("Fido"))
	assert.strictEqual(createPet.folderId, col.folders[0].id)
})

test("exportOpenAPI: generates a valid OpenAPI 3.1 doc from a collection, round-trip-compatible with importOpenAPI", async () => {
	const col = {
		id: "col_1",
		name: "Pet Store",
		description: "A store for pets",
		folders: [{ id: "fld_1", name: "Pets", parentId: null }],
		requests: [
			{
				id: "req_1",
				name: "List pets",
				description: "Returns all pets",
				method: "GET",
				url: "https://api.pets.dev/pets",
				headers: [],
				params: [{ key: "limit", value: "10", enabled: true }],
				body: { type: "none" },
				auth: { type: "none" },
				folderId: "fld_1",
			},
			{
				id: "req_2",
				name: "Get pet by id",
				method: "GET",
				url: "https://api.pets.dev/pets/{{id}}",
				headers: [],
				params: [],
				body: { type: "none" },
				auth: { type: "bearer", token: "{{TOKEN}}" },
				folderId: "fld_1",
			},
			{
				id: "req_3",
				name: "Create pet",
				method: "POST",
				url: "https://api.pets.dev/pets",
				headers: [],
				params: [],
				body: { type: "json", content: '{"name":"Fido"}' },
				auth: { type: "none" },
				folderId: "fld_1",
			},
		],
	}
	const spec = exportOpenAPI(col)

	assert.strictEqual(spec.openapi, "3.1.0")
	assert.strictEqual(spec.info.title, "Pet Store")
	assert.strictEqual(spec.info.description, "A store for pets")

	assert.ok(spec.paths["/pets"].get)
	assert.strictEqual(spec.paths["/pets"].get.tags[0], "Pets")
	assert.strictEqual(spec.paths["/pets"].get.description, "Returns all pets")
	assert.ok(
		spec.paths["/pets"].get.parameters.some(
			(p) => p.name === "limit" && p.in === "query",
		),
	)

	assert.ok(spec.paths["/pets/{id}"].get)
	const pathParam = spec.paths["/pets/{id}"].get.parameters.find(
		(p) => p.name === "id",
	)
	assert.strictEqual(pathParam.in, "path")
	assert.strictEqual(pathParam.required, true)

	assert.deepStrictEqual(spec.paths["/pets/{id}"].get.security, [
		{ bearerAuth: [] },
	])
	assert.strictEqual(spec.components.securitySchemes.bearerAuth.type, "http")

	assert.ok(spec.paths["/pets"].post)
	const reqBody = spec.paths["/pets"].post.requestBody
	assert.deepStrictEqual(reqBody.content["application/json"].example, {
		name: "Fido",
	})

	assert.ok(spec.paths["/pets"].get.responses["200"])
})

test("exportOpenAPI: round-trips through importOpenAPI without losing paths or methods", async () => {
	const col = {
		id: "col_2",
		name: "Round Trip",
		folders: [],
		requests: [
			{
				id: "r1",
				name: "Get widget",
				method: "GET",
				url: "https://api.example.com/widgets/{{id}}",
				headers: [],
				params: [],
				body: { type: "none" },
				auth: { type: "none" },
			},
			{
				id: "r2",
				name: "List widgets",
				method: "GET",
				url: "https://api.example.com/widgets",
				headers: [],
				params: [],
				body: { type: "none" },
				auth: { type: "none" },
			},
		],
	}
	const spec = exportOpenAPI(col)
	const reimported = importOpenAPI(JSON.stringify(spec), parseYaml)
	const urls = reimported.requests.map((r) => `${r.method} ${r.url}`)
	assert.ok(urls.includes("GET /widgets/{{id}}"))
	assert.ok(urls.includes("GET /widgets"))
})

console.log("ui/utils/index.test.js: all checks passed")
