import assert from 'node:assert';
import { loadProtoServices } from './grpcProxy.js';

const SAMPLE_PROTO = `
syntax = "proto3";
package demo;

service Greeter {
  rpc SayHello (HelloRequest) returns (HelloReply) {}
  rpc StreamHellos (HelloRequest) returns (stream HelloReply) {}
}

message HelloRequest { string name = 1; }
message HelloReply { string message = 1; }
`;

// Parses a service + its methods, and correctly flags unary vs server-streaming
{
    const { grpcObj, methods } = loadProtoServices(SAMPLE_PROTO);
    assert.strictEqual(methods.length, 2);

    const unary = methods.find(m => m.methodName === 'SayHello');
    assert.strictEqual(unary.path, 'demo.Greeter/SayHello');
    assert.strictEqual(unary.requestStream, false);
    assert.strictEqual(unary.responseStream, false);

    const streaming = methods.find(m => m.methodName === 'StreamHellos');
    assert.strictEqual(streaming.requestStream, false);
    assert.strictEqual(streaming.responseStream, true);

    // the returned grpcObj is a real client constructor namespace, addressable by dotted path
    assert.strictEqual(typeof grpcObj.demo.Greeter, 'function');
}

// Malformed proto surfaces as a thrown error, not a silent empty result
{
    assert.throws(() => loadProtoServices('this is not a proto file'));
}

console.log('grpcProxy.test.js: all checks passed');
