import test from 'node:test';
import assert from 'node:assert/strict';
import {captureSourceReadEvidence} from '../src/evidence-context.mjs';
import {collectRequiredTaskDocuments} from '../src/current-task-documents.mjs';
function fixture() {
  const binding={actorID:'actor-a',sessionID:'session-a',goalID:'goal-a',revision:1,inputID:'input-a'};
  const file='/project/TECHNICAL_TASK.md', sourceBytes=Buffer.from('Start\nNecessary middle requirement\nFinish\n');
  const call={id:'read-a',type:'function',function:{name:'read',arguments:JSON.stringify({filePath:file})}};
  const record=captureSourceReadEvidence({binding,toolCall:call,receiptID:'receipt-a',sourcePath:file,
    sourceBytes,range:{startLine:1,endLine:3}});
  return {binding,ownerStop:false,requiredPaths:[file],records:[record],originalResults:[record.original],
    currentSources:[{binding,proofID:'current-proof',...record.original.sources[0]}],
    messages:[{role:'assistant',tool_calls:[call]},{role:'tool',tool_call_id:call.id,content:'Only start and finish were forwarded'}],
    maxEvidenceBytes:1048576,maxDocumentBytes:10000};
}
test('needed middle of the original current document survives a previously shortened tool result',()=>{
  const x=fixture(), before=structuredClone(x), r=collectRequiredTaskDocuments(x);
  assert.equal(r.documents[0].content,'Start\nNecessary middle requirement\nFinish\n');
  assert.deepEqual(r.requiredCallIDs,['read-a']);assert.equal(r.sourceOrReleaseAuthority,false);
  r.documents[0].observedRange.startLine=99;
  assert.deepEqual(x,before);
});
test('repeated completed reads produce one document block and explicit aliases',()=>{
  const x=fixture(), r=structuredClone(x.records[0]), c=structuredClone(x.messages[0].tool_calls[0]);
  c.id='read-b';r.original.callID=c.id;r.original.receiptID='receipt-b';
  x.records.push(r);x.originalResults.push(r.original);
  x.messages.push({role:'assistant',tool_calls:[c]},{role:'tool',tool_call_id:c.id,content:'shortened again'});
  const out=collectRequiredTaskDocuments(x);assert.equal(out.documents.length,1);
  assert.deepEqual(out.requiredCallIDs,['read-a','read-b']);
});
for(const change of [
  x=>x.currentSources[0].sha256='a'.repeat(64),
  x=>x.records[0].content='Unobserved replacement',
  x=>x.binding.revision=2,
  x=>x.requiredPaths=['/project/OTHER.md'],
  x=>x.originalResults=[],
]) test('does not forward stale, changed, foreign or unobserved task text: '+String(change),()=>{
  const x=fixture();change(x);assert.equal(collectRequiredTaskDocuments(x).documents.length,0);
});
test('required context is never silently trimmed to fit a smaller budget',()=>{
  const x=fixture();x.maxDocumentBytes=8;assert.throws(()=>collectRequiredTaskDocuments(x),/CONTEXT_TOO_LARGE/);
});
test('owner Stop remains authoritative',()=>{
  const x=fixture();x.ownerStop=true;assert.throws(()=>collectRequiredTaskDocuments(x),/OWNER_STOP/);
});
