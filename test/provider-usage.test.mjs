import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeProviderUsage,aggregateProviderUsage} from '../src/provider-usage.mjs';

const binding={actorID:'actor-a',sessionID:'session-a',goalID:'goal-a',revision:1,inputID:'input-a',providerID:'provider-a',modelID:'model-a',requestID:'request-a',requestSHA256:'a'.repeat(64)};
const normalize=(usage, extra={}) => normalizeProviderUsage({binding,format:'chat-completions',receiptID:'receipt-a',observedAt:1000,stage:'final',usage,...extra});

test('missing usage/cache fields stay UNKNOWN while explicit zero remains measured',()=>{
  for (const raw of [undefined,null,{}]) {
    const r=normalize(raw);
    assert.equal(r.status,'unknown');assert.equal(r.metrics.cachedInputTokens,null);assert.equal(r.metrics.cacheHitFraction,null);
  }
  const partial=normalize({prompt_tokens:12000,completion_tokens:20});
  assert.equal(partial.status,'partial');assert.equal(partial.metrics.uncachedInputTokens,null);
  const zero=normalize({prompt_tokens:12000,prompt_tokens_details:{cached_tokens:0}});
  assert.equal(zero.status,'known');assert.equal(zero.metrics.uncachedInputTokens,12000);assert.equal(zero.metrics.cacheHitFraction,0);
});

test('inclusive Chat Completions input is not added twice',()=>{
  const r=normalize({prompt_tokens:25000,completion_tokens:100,prompt_tokens_details:{cached_tokens:20000}});
  assert.equal(r.metrics.inputTokens,25000);assert.equal(r.metrics.uncachedInputTokens,5000);
  assert.equal(r.metrics.cacheHitFraction,0.8);assert.equal(r.metrics.cacheWriteInputTokens,null);
});

test('Responses cache writes remain fresh processing, not cache hits',()=>{
  const r=normalize({input_tokens:12000,input_tokens_details:{cached_tokens:4000,cache_write_tokens:7000,
    cache_write_tokens_details:{ttl_30m_tokens:3000,ttl_12h_tokens:4000}},output_tokens:20},{format:'responses'});
  assert.equal(r.metrics.inputTokens,12000);assert.equal(r.metrics.cachedInputTokens,4000);
  assert.equal(r.metrics.uncachedInputTokens,8000);assert.equal(r.metrics.ordinaryInputTokens,1000);
  assert.equal(r.metrics.cacheWriteInputTokens,7000);
});

test('Anthropic already uncached ordinary input is never reduced by cached reads',()=>{
  const r=normalize({input_tokens:1000,cache_creation_input_tokens:2000,cache_read_input_tokens:20000,output_tokens:30}, {format:'anthropic-messages'});
  assert.equal(r.metrics.inputTokens,23000);assert.equal(r.metrics.uncachedInputTokens,3000);
  assert.equal(r.metrics.ordinaryInputTokens,1000);assert.equal(r.metrics.cachedInputTokens,20000);
});

test('missing Anthropic creation/read counters do not become invented zero',()=>{
  const r=normalize({input_tokens:1000},{format:'anthropic-messages'});
  assert.equal(r.metrics.ordinaryInputTokens,1000);assert.equal(r.metrics.uncachedInputTokens,null);
  assert.equal(r.metrics.inputTokens,null);assert.equal(r.metrics.cachedInputTokens,null);
});

test('DeepSeek explicit hit/miss counts derive only supported totals',()=>{
  const r=normalize({prompt_cache_hit_tokens:18000,prompt_cache_miss_tokens:2000},{format:'deepseek-chat'});
  assert.equal(r.metrics.inputTokens,20000);assert.equal(r.metrics.uncachedInputTokens,2000);
  assert.equal(r.metrics.cacheHitFraction,0.9);
  const missing=normalize({prompt_tokens:20000,prompt_cache_miss_tokens:2000},{format:'deepseek-chat'});
  assert.equal(missing.metrics.cachedInputTokens,null);assert.equal(missing.metrics.cacheHitFraction,null);
});

test('malformed, impossible and inconsistent counters produce no plausible fraction',()=>{
  for (const bad of [-1,0.1,'0',NaN,Infinity,Number.MAX_SAFE_INTEGER+1]) {
    const r=normalize({prompt_tokens:100,prompt_tokens_details:{cached_tokens:bad}});
    assert.equal(r.status,'invalid');assert.equal(r.metrics.cacheHitFraction,null);
    assert.equal(r.metrics.cachedInputTokens,null);
  }
  for (const [usage,format] of [
    [{prompt_tokens:100,prompt_tokens_details:{cached_tokens:200}},'chat-completions'],
    [{prompt_tokens:100,prompt_cache_hit_tokens:40,prompt_cache_miss_tokens:70},'deepseek-chat'],
    [{input_tokens:5,cache_read_input_tokens:Number.MAX_SAFE_INTEGER,cache_creation_input_tokens:1},'anthropic-messages'],
    [{input_tokens:20,input_tokens_details:{cached_tokens:10,cache_write_tokens:11}},'responses'],
    [{input_tokens:20,input_tokens_details:{cached_tokens:0,cache_write_tokens:10,cache_write_tokens_details:{ttl_30m_tokens:4,ttl_12h_tokens:8}}},'responses'],
    [{input_tokens:1,cache_read_input_tokens:10,cache_creation_input_tokens:5,cache_creation:{ephemeral_5m_input_tokens:3,ephemeral_1h_input_tokens:3}},'anthropic-messages'],
  ]) assert.equal(normalize(usage,{format}).status,'invalid');
});

test('unsupported formats, missing original identity and invalid observation metadata reject',()=>{
  for (const extra of [{format:'guess-by-model'},{receiptID:''},{observedAt:-1},{stage:'http200'},
    {binding:{...binding,requestSHA256:'not-a-digest'}},{binding:{...binding,providerID:''}}])
    assert.throws(()=>normalize({},extra));
});

test('final usage is counted once per original request, never as stream chunk sums',()=>{
  const final=normalize({prompt_tokens:100,prompt_tokens_details:{cached_tokens:80}});
  const partial=normalize({prompt_tokens:40,prompt_tokens_details:{cached_tokens:20}},{stage:'partial'});
  const r=aggregateProviderUsage([partial,final,structuredClone(final)]);
  assert.equal(r.finalRequests,1);assert.equal(r.partialSnapshots,1);
  assert.equal(r.measuredSubset.inputTokens,100);assert.equal(r.cacheHitFraction,0.8);
});

test('unknown/invalid coverage prevents an invented all-sample cache rate',()=>{
  const known=normalize({prompt_tokens:100,prompt_tokens_details:{cached_tokens:80}});
  const unknown=normalize({prompt_tokens:100},{binding:{...binding,requestID:'request-b'}});
  const invalid=normalize({prompt_tokens:-1},{binding:{...binding,requestID:'request-c'}});
  const r=aggregateProviderUsage([known,unknown,invalid]);
  assert.equal(r.finalRequests,3);assert.equal(r.reportedCacheRequests,1);
  assert.equal(r.unknownCacheRequests,1);assert.equal(r.invalidRequests,1);
  assert.equal(r.cacheHitFraction,null);assert.equal(r.reportedSubsetCacheHitFraction,0.8);
});

test('aggregate ratio is token-weighted, not a mean of per-request percentages',()=>{
  const a=normalize({prompt_tokens:100,prompt_tokens_details:{cached_tokens:100}});
  const b=normalize({prompt_tokens:900,prompt_tokens_details:{cached_tokens:0}},{binding:{...binding,requestID:'request-b'}});
  assert.equal(aggregateProviderUsage([a,b]).cacheHitFraction,0.1);
});

for (const key of ['modelID','goalID','revision','requestSHA256']) test('same original request with changed '+key+' conflicts',()=>{
  const a=normalize({prompt_tokens:100,prompt_tokens_details:{cached_tokens:80}});
  const b=structuredClone(a);b.binding[key]=key==='revision'?2:key==='requestSHA256'?'b'.repeat(64):'changed';
  assert.throws(()=>aggregateProviderUsage([a,b]),/ORIGINAL_REQUEST_CONFLICT/);
});

test('zero-input requests do not manufacture a cache fraction or guarantee',()=>{
  const r=normalize({prompt_tokens:0,prompt_tokens_details:{cached_tokens:0}});
  assert.equal(r.status,'known');assert.equal(r.metrics.cacheHitFraction,null);
  assert.equal(aggregateProviderUsage([r]).cacheHitFraction,null);assert.equal(r.cacheHitGuarantee,false);
});


test('tampered normalized counters are rejected before aggregation',()=>{
  const record=normalize({prompt_tokens:100,prompt_tokens_details:{cached_tokens:80}});
  for(const metrics of [{...record.metrics,cachedInputTokens:120}, {...record.metrics,inputTokens:undefined},
    {...record.metrics,cacheHitFraction:1}, {...record.metrics,uncachedInputTokens:-1}])
    assert.throws(()=>aggregateProviderUsage([{...record,metrics}]),/INVALID_NORMALIZED_RECORD/);
});
