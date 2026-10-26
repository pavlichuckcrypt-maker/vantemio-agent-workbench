import test from 'node:test';
import assert from 'node:assert/strict';
import {observeUsageStream} from '../src/usage-stream.mjs';

function nativeResponse(text,chunk=7) {
  const bytes=new TextEncoder().encode(text);
  return new Response(new ReadableStream({start(controller){for(let i=0;i<bytes.length;i+=chunk)controller.enqueue(bytes.slice(i,i+chunk));controller.close()}}),
    {headers:{'content-type':'text/event-stream','x-native-receipt':'kept'}});
}

test('provider bytes and Unicode survive the same single stream while original final usage is emitted once',async()=>{
  const wire='data: {"choices":[{"delta":{"content":"Привет 🧩"},"finish_reason":null}]}\r\n\r\n'+
    'data: {"id":"response-a","choices":[{"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":100,"prompt_tokens_details":{"cached_tokens":80}}}\n\n'+
    'data: [DONE]\n\n';
  const observations=[];
  const response=observeUsageStream(nativeResponse(wire),{onUsage:(row,done)=>observations.push({row,done})});
  assert.equal(await response.text(),wire);
  assert.equal(response.headers.get('x-native-receipt'),'kept');
  assert.equal(observations.filter(x=>x.done).length,1);
  assert.equal(observations[0].row.usage.prompt_tokens,100);
});

test('observer or log failures do not fail, alter or retry the actual provider stream',async()=>{
  const wire='data: {"type":"response.completed","response":{"id":"response-a","usage":{"input_tokens":20}}}\n\n';
  let errors=0;
  const response=observeUsageStream(nativeResponse(wire),{onUsage:()=>{throw Error('fixture log failure')},onObserverError:()=>{errors++;throw Error('fixture error sink failure')}});
  assert.equal(await response.text(),wire);assert.equal(errors,1);
});

test('a failed response cannot promote prior partial usage into a final success',async()=>{
  const wire='data: {"type":"response.in_progress","response":{"usage":{"input_tokens":20}}}\n\n'+
    'data: {"type":"response.failed","response":{"error":{"message":"upstream"}}}\n\n'+
    'data: [DONE]\n\n';
  const observations=[];
  const response=observeUsageStream(nativeResponse(wire),{onUsage:(row,done)=>observations.push(done)});
  assert.equal(await response.text(),wire);assert.deepEqual(observations,[false]);
});

test('non-stream responses are left to their ordinary native consumer',()=>{
  const response=new Response('{"usage":{"prompt_tokens":20}}',{headers:{'content-type':'application/json'}});
  assert.equal(observeUsageStream(response,{onUsage:()=>{throw Error('must not consume another body')}}),response);
});

test('usage after an original terminal error remains partial through DONE',async()=>{
  const wire='data: {"error":{"message":"upstream failed"}}\n\n'+
    'data: {"usage":{"prompt_tokens":20}}\n\n'+
    'data: [DONE]\n\n';
  const observations=[];
  const response=observeUsageStream(nativeResponse(wire),{onUsage:(row,done)=>observations.push(done)});
  assert.equal(await response.text(),wire);assert.deepEqual(observations,[false]);
});

test('media types are matched case-insensitively without parsing other response bodies',async()=>{
  const wire='data: {"usage":{"prompt_tokens":20}}\n\ndata: [DONE]\n\n',observations=[];
  const original=nativeResponse(wire);original.headers.set('content-type','Text/Event-Stream; charset=utf-8');
  assert.equal(await observeUsageStream(original,{onUsage:(row,done)=>observations.push(done)}).text(),wire);
  assert.deepEqual(observations,[false,true]);
  const json=new Response(wire,{headers:{'content-type':'application/json; note=text/event-stream'}});
  assert.equal(observeUsageStream(json,{onUsage:()=>assert.fail('unexpected body consumption')}),json);
});


test('malformed derivative event data never corrupts the original stream',async()=>{
 const wire='data: null\n\ndata: []\n\ndata: {"choices":"not-an-array"}\n\ndata: {"choices":[null]}\n\n';
 const response=observeUsageStream(nativeResponse(wire),{onUsage:()=>{}});
 assert.equal(await response.text(),wire);
});

test('a callback cannot mutate a later final snapshot of the original provider counters',async()=>{
 const wire='data: {"usage":{"prompt_tokens":20}}\n\ndata: [DONE]\n\n',counts=[];
 const response=observeUsageStream(nativeResponse(wire),{onUsage:(row,done)=>{counts.push(row.usage.prompt_tokens);row.usage.prompt_tokens=999;}});
 assert.equal(await response.text(),wire);assert.deepEqual(counts,[20,20]);
});
