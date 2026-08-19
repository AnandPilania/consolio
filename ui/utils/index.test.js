import assert from 'node:assert';
import { parse as parseYaml } from 'yaml';
import {
    parseCurl, importPostmanCollection, importInsomniaExport, importOpenAPI,
    exportPostmanCollection, exportInsomniaCollection, diffLines, buildJUnitXml,
    buildCurl, buildHarRequest,
} from './index.js';

// GraphQL body type: query + variables shape into a single JSON POST body
{
    const req = {
        method: 'POST', url: 'http://localhost/graphql', headers: [], params: [], auth: { type: 'none' },
        body: { type: 'graphql', query: 'query Hello($name: String) { hello(name: $name) }', variables: '{"name":"Ada"}' },
    };
    const curl = buildCurl(req);
    assert.ok(curl.includes(`-d '{"query":"query Hello($name: String) { hello(name: $name) }","variables":{"name":"Ada"}}'`));
    const har = buildHarRequest(req);
    assert.strictEqual(har.postData.mimeType, 'application/json');
    assert.deepStrictEqual(JSON.parse(har.postData.text), { query: req.body.query, variables: { name: 'Ada' } });
}

// diffLines: same/add/del classification for a simple 3-line change
{
    const d = diffLines('a\nb\nc', 'a\nx\nc');
    assert.deepStrictEqual(d.map(l => l.type), ['same', 'del', 'add', 'same']);
    assert.strictEqual(d.find(l => l.type === 'del').line, 'b');
    assert.strictEqual(d.find(l => l.type === 'add').line, 'x');
    assert.strictEqual(diffLines('same', 'same').every(l => l.type === 'same'), true);
}

// buildJUnitXml: failure count and escaping
{
    const xml = buildJUnitXml('Suite <1>', [{ name: 'ok', pass: true, elapsed: 10 }, { name: 'bad', pass: false, elapsed: 5, error: 'x < y' }]);
    assert.ok(xml.includes('tests="2" failures="1"'));
    assert.ok(xml.includes('Suite &lt;1&gt;'));
    assert.ok(xml.includes('x &lt; y'));
}

// parseCurl: long-flag variants (--header, --request, --data-raw) it previously missed
{
    const r = parseCurl(`curl --request POST --url 'https://api.example.com/x' --header 'X-Api-Key: abc' --data-raw '{"a":1}'`);
    assert.strictEqual(r.method, 'POST');
    assert.strictEqual(r.url, 'https://api.example.com/x');
    assert.strictEqual(r.headers[0].key, 'X-Api-Key');
    assert.strictEqual(r.body.type, 'json');
}

// parseCurl: multipart -F fields, including a file field
{
    const r = parseCurl(`curl -X POST 'https://api.example.com/upload' -F 'name=John' -F 'avatar=@photo.png;type=image/png'`);
    assert.strictEqual(r.body.type, 'multipart');
    assert.strictEqual(r.body.fields.length, 2);
    assert.strictEqual(r.body.fields[0].value, 'John');
    assert.strictEqual(r.body.fields[1].type, 'file');
    assert.strictEqual(r.body.fields[1].fileName, 'photo.png');
}

// Postman import: nested folders preserved, folderId wired up
{
    const postman = {
        info: { name: 'Demo' },
        item: [
            { name: 'Auth', item: [
                { name: 'Login', request: { method: 'POST', url: '/login' } },
            ] },
            { name: 'Ping', request: { method: 'GET', url: '/ping' } },
        ],
    };
    const col = importPostmanCollection(postman);
    assert.strictEqual(col.folders.length, 1);
    assert.strictEqual(col.folders[0].name, 'Auth');
    const login = col.requests.find(r => r.name === 'Login');
    assert.strictEqual(login.folderId, col.folders[0].id);
    const ping = col.requests.find(r => r.name === 'Ping');
    assert.strictEqual(ping.folderId, null);

    // round-trip through export
    const exported = exportPostmanCollection(col);
    assert.strictEqual(exported.item.length, 2); // Auth folder + Ping request at root
    const authFolder = exported.item.find(i => i.item);
    assert.strictEqual(authFolder.item[0].name, 'Login');
}

// Insomnia import: request_group nesting + body/auth mapping
{
    const insomnia = {
        _type: 'export', __export_format: 4,
        resources: [
            { _id: 'wrk_1', _type: 'workspace', name: 'Demo' },
            { _id: 'grp_1', _type: 'request_group', name: 'Auth', parentId: 'wrk_1' },
            { _id: 'req_1', _type: 'request', name: 'Login', method: 'post', url: '/login', parentId: 'grp_1',
              body: { mimeType: 'application/json', text: '{"u":1}' },
              authentication: { type: 'bearer', token: 'tok' } },
        ],
    };
    const col = importInsomniaExport(insomnia);
    assert.strictEqual(col.folders.length, 1);
    assert.strictEqual(col.requests[0].folderId, col.folders[0].id);
    assert.strictEqual(col.requests[0].method, 'POST');
    assert.strictEqual(col.requests[0].auth.type, 'bearer');

    const exported = exportInsomniaCollection(col);
    assert.strictEqual(exported.resources.filter(r => r._type === 'request_group').length, 1);
    assert.strictEqual(exported.resources.filter(r => r._type === 'request').length, 1);
}

// OpenAPI import: paths × methods, tag-based folders, YAML parsing
{
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
`;
    const col = importOpenAPI(yamlSpec, parseYaml);
    assert.strictEqual(col.name, 'Pet API');
    assert.strictEqual(col.folders.length, 1);
    assert.strictEqual(col.folders[0].name, 'Pets');
    assert.strictEqual(col.requests.length, 2);
    const createPet = col.requests.find(r => r.method === 'POST');
    assert.strictEqual(createPet.url, 'https://api.pets.dev/pets');
    assert.ok(createPet.body.content.includes('Fido'));
    assert.strictEqual(createPet.folderId, col.folders[0].id);
}

console.log('ui/utils/index.test.js: all checks passed');
