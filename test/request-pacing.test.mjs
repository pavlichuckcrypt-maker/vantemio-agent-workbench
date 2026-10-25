import test from'node:test';import assert from'node:assert/strict';import{nextAllowedAt}from'../src/request-pacing.mjs';
test('one actor cannot dispatch a second request before60s; other actors are staggered15s',()=>{
 const now=1000000,state={actors:{a:{lastDispatchAt:now}},lastDispatchAt:now};
 assert.equal(nextAllowedAt(state,'a',now+2000,60000,15000),now+60000);
 assert.equal(nextAllowedAt(state,'b',now+2000,60000,15000),now+15000);
 assert.equal(nextAllowedAt(state,'a',now+61000,60000,15000),now+61000);
});
test('clock/active timestamps never authorize an early send, no provider access',()=>{
 assert.equal(nextAllowedAt({actors:{a:{lastDispatchAt:200000}},lastDispatchAt:200000},'a',190000,60000,15000),260000);
});
