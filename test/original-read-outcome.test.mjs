import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {reconcileVerifiedOriginal, originalInputSHA256} from '../src/original-outcome.mjs';
const sha = value => createHash('sha256').update(value).digest('hex');
function fixture() {
  const binding = {actorID:'actor-a', sessionID:'session-a', goalID:'goal-a', revision:1,
    taskID:'task-a', objectiveSHA256:sha('goal')};
  const original = {binding, requestID:'read-request', callID:'read-call', tool:'read', input:{filePath:'/project/missing.mjs'}};
  const current = {binding:structuredClone(binding), ownerStop:false, complete:false};
  const receipt = {qualified:true, signatureVerified:true, originalOnly:true, ...structuredClone(original),
    inputSHA256:originalInputSHA256(original.input), receiptID:'receipt-a', receiptSHA256:sha('receipt'),
    originalCompletedAt:5, outcome:{kind:'read_failed', operation:'read', readonlyQualified:true,
      dispatched:true, readOperationTerminal:true, error:'FileNotFound: exact requested file'}};
  return {original, current, receipt};
}
const run = x => reconcileVerifiedOriginal({original:x.original, readCurrent:async()=>x.current,
  verifyOriginal:async()=>x.receipt});
test('authenticated read failure is terminal failure, never unknown mutation, Source or PASS', async()=>{
  const x=fixture(), before=structuredClone(x), r=await run(x);
  assert.equal(r.kind,'known_read_failed'); assert.equal(r.usableReadResult,false);
  assert.equal(r.originalError,x.receipt.outcome.error); assert.equal(r.noOperationReplay,true);
  assert.equal(r.claimsReleased,false); assert.equal(r.noReleaseApproval,true);
  assert.equal('sourceSHA256' in r,false); assert.deepEqual(x,before);
});
for (const change of [
  x=>x.original.tool='write', x=>x.receipt.tool=x.original.tool='exec',
  x=>x.receipt.tool='exec', x=>x.receipt.outcome.operation='write',
  x=>x.receipt.outcome.readonlyQualified=false, x=>x.receipt.outcome.dispatched=false,
  x=>x.receipt.outcome.readOperationTerminal=false, x=>x.receipt.outcome.timedOut=true,
  x=>x.receipt.outcome.status='UNKNOWN', x=>x.receipt.outcome.executionOutcome='UNKNOWN',
  x=>x.receipt.signatureVerified=false, x=>x.receipt.inputSHA256=sha('other request'),
  x=>x.current.ownerStop=true, x=>x.current.binding.taskID='next-task',
  x=>x.receipt.outcome.error='', x=>x.receipt.outcome.error='x'.repeat(1048577),
]) test('read failure still requires exact authenticated original and current live task: '+String(change), async()=>{
  const x=fixture();change(x);assert.equal((await run(x)).resolved,false);
});
test('directory read is metadata and has no invented code digest', async()=>{
  const x=fixture();Object.assign(x.receipt.outcome,{kind:'read_completed',entryType:'directory',output:'one.mjs\ntwo.mjs'});
  delete x.receipt.outcome.error;
  const r=await run(x);assert.equal(r.kind,'known_read_completed');assert.equal(r.metadataOnly,true);
  assert.equal(r.sourceSHA256Unknown,true);assert.equal('sourceSHA256' in r,false);
  x.receipt.outcome.sourceSHA256=sha('fake code');assert.equal((await run(x)).resolved,false);
});
test('completed file read needs the authenticated original Source digest', async()=>{
  const x=fixture();Object.assign(x.receipt.outcome,{kind:'read_completed',entryType:'file',output:'export const a=1;'});
  delete x.receipt.outcome.error;
  assert.equal((await run(x)).resolved,false);
  x.receipt.outcome.sourceSHA256=sha(x.receipt.outcome.output);
  const r=await run(x);assert.equal(r.metadataOnly,false);assert.equal(r.sourceSHA256,x.receipt.outcome.sourceSHA256);
  x.receipt.outcome.error='Contradictory failure';assert.equal((await run(x)).resolved,false);
});
test('Stop arriving during read reconciliation cannot be cleared', async()=>{
  const x=fixture(), r=await reconcileVerifiedOriginal({original:x.original,readCurrent:async()=>x.current,
    verifyOriginal:async()=>{x.current.ownerStop=true;return x.receipt;}});
  assert.equal(r.resolved,false);assert.equal(x.current.ownerStop,true);
});
