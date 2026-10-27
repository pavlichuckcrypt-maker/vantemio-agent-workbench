import test from'node:test';import assert from'node:assert/strict';
import{validateRequestBudget}from'../src/request-budget.mjs';
const policy={maxInputTokens:80000,maxSerializedTextBytes:1048576,maxFreshInputTokens:20000,maxCachedInputTokens:70000,targetFreshInputTokens:15000,cacheEvidenceMaxAgeMs:3600000};
test('higher useful cache ceiling leaves fresh and total ceilings unchanged',()=>{const p=validateRequestBudget(policy);assert.equal(p.maxFreshInputTokens,20000);assert.equal(p.maxInputTokens,80000);assert.equal(p.targetFreshInputTokens,15000);assert.equal(p.maxCachedInputTokens,70000);assert.equal(p.cacheHitGuarantee,false);});
test('rejects excessive fresh input, cache and target without provider dispatch',()=>{for(const patch of[{maxFreshInputTokens:50001},{maxCachedInputTokens:70001},{targetFreshInputTokens:20001},{maxInputTokens:90000}])assert.throws(()=>validateRequestBudget({...policy,...patch}),/INVALID_OWNER/);});
