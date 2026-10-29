import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {reconcileVerifiedOriginal,originalInputSHA256} from '../src/original-outcome.mjs';
import {qualifiedProgressFacts,terminalProgress} from '../src/runtime-progress.mjs';
import {createBoundedProofCache,stableOriginalTransportResult} from '../src/proof-cache.mjs';
import {formatReadPreview} from '../src/source-presentation.mjs';
import {qualifyCompletedMaintenanceHold} from '../src/maintenance-hold.mjs';
import {qualifySupersededNativeInput,supersededNativeVariant,qualifyContinuationSnapshot,mergeContinuationState,commitContinuationIntent,settleContinuationIntent} from '../src/control-state.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const binding={actorID:'actor-a',sessionID:'session-a',goalID:'goal-a',revision:1,taskID:'task-a',objectiveSHA256:sha('goal')};
const original={binding,requestID:'request-a',callID:'call-a',tool:'exec',input:{command:'node --test test/local.test.mjs'}};
const verified=()=>({qualified:true,signatureVerified:true,originalOnly:true,...structuredClone(original),inputSHA256:originalInputSHA256(original.input),receiptID:'receipt-a',receiptSHA256:sha('receipt'),originalCompletedAt:2,outcome:{kind:'completed',dispatched:true,executionClosed:true,exitCode:0,output:'ok'}});
const current=()=>({binding:structuredClone(binding),ownerStop:false,complete:false});
const run=(v=verified(),c=current(),args={})=>reconcileVerifiedOriginal({original,readCurrent:async()=>c,verifyOriginal:async()=>v,...args});
test('signed SAME original completion: no replay, no claim release, nonzero is failure',async()=>{
 const a=await run();assert.equal(a.kind,'known_execution_succeeded');assert.equal(a.noOperationReplay,true);assert.equal(a.claimsReleased,false);
 const b=verified();b.outcome.exitCode=2;assert.equal((await run(b)).kind,'known_execution_failed');
});
for(const field of ['requestID','callID','tool','inputSHA256','receiptSHA256'])test('reject wrong original '+field,async()=>{const v=verified();v[field]='wrong';assert.equal((await run(v)).resolved,false)});
for(const field of Object.keys(binding))test('reject changed receipt scope '+field,async()=>{const v=verified();v.binding[field]=field==='revision'?2:'other';assert.equal((await run(v)).resolved,false)});
for(const field of ['signatureVerified','originalOnly','qualified'])test('host verifier required: '+field,async()=>{const v=verified();v[field]=false;assert.equal((await run(v)).resolved,false)});
test('UNKNOWN, partial execution and oversized output never become completed',async()=>{
 for(const change of [{executionOutcome:'UNKNOWN'},{status:'UNKNOWN'},{executionClosed:false},{timedOut:true},{output:'x'.repeat(33)}]){const v=verified();Object.assign(v.outcome,change);assert.equal((await run(v,current(),{maxOutputBytes:32})).resolved,false)}
});
test('readonly timeout is known absence of usable read, not completed operation',async()=>{
 const v=verified();v.outcome={kind:'readonly_timeout',dispatched:true,readonlyQualified:true,usableReadResult:false,error:'deadline'};
 const a=await run(v);assert.equal(a.kind,'known_readonly_timeout_no_result');assert.equal(a.operationCompleted,false);assert.equal(a.descendantCompletionNotInferred,true);
 v.outcome.readonlyQualified=false;assert.equal((await run(v)).resolved,false);
});
test('pre-execution rejection preserves failure',async()=>{const v=verified();v.outcome={kind:'rejected_before_execution',dispatched:false,error:'invalid input'};const a=await run(v);assert.equal(a.kind,'known_rejected_before_execution');assert.equal(a.operationDispatched,false)});
test('Stop/new task during verifier cannot be overwritten; provider/model are not pins',async()=>{
 for(const change of [c=>c.ownerStop=true,c=>c.binding.taskID='task-b']){const c=current();const a=await run(verified(),c,{verifyOriginal:async()=>{change(c);return verified()}});assert.equal(a.resolved,false)}
 const c=current();c.modelID='new-model';c.providerID='new-provider';assert.equal((await run(verified(),c)).resolved,true);
});
test('capture input before await and isolate mutable verifier arguments',async()=>{
 const a=structuredClone(original);const result=await run(verified(),current(),{original:a,verifyOriginal:async clone=>{a.input.command='changed';clone.binding.taskID='changed';clone.input.command='changed';return verified()}});
 assert.equal(result.resolved,true);assert.equal(result.inputSHA256,originalInputSHA256(original.input));assert.equal(result.binding.taskID,'task-a');
});
test('missing host callbacks do not trigger execution',async()=>{await assert.rejects(reconcileVerifiedOriginal({original}),/HOST_VERIFIER/)});
const read=(limit=40,output='1: export const x=1;')=>({info:{id:'assistant-a'},parts:[{type:'tool',tool:'read',callID:'call-'+limit,state:{status:'completed',input:{filePath:'/project/module.mjs',limit},output}}]});
test('same Source bytes with different read limit/callID/DCP marker are same observation',()=>{
 const a=qualifiedProgressFacts([read()]);const b=qualifiedProgressFacts([read(80,'1: export const x=1;\n<dcp-message-id>new</dcp-message-id>')]);assert.equal(a[0].fingerprint,b[0].fingerprint);assert.equal(a[0].candidateOnlyNotIntegration,true);
 assert.notEqual(a[0].fingerprint,qualifiedProgressFacts([read(80,'1: export const x=2;')])[0].fingerprint);
});
test('new task changes observation; reading has no arbitrary round quota',()=>{
 assert.notEqual(qualifiedProgressFacts([read()],{task:'a'})[0].fingerprint,qualifiedProgressFacts([read()],{task:'b'})[0].fingerprint);
 const last={info:{time:{completed:1}},parts:[]};assert.equal(terminalProgress({duplicateTerminalCount:100},{messages:[read()],last,scope:{}}).stagnationQualified,false);
});
test('only repeated terminal text in same scope with no new evidence qualifies stagnation',()=>{
 const last={info:{time:{completed:1}},parts:[{type:'text',text:'Done'}]};let state={};for(let i=0;i<4;i++)state=terminalProgress(state,{messages:[],last,scope:{task:'a'}});assert.equal(state.stagnationQualified,true);
 assert.equal(terminalProgress(state,{messages:[read()],last,scope:{task:'a'}}).stagnationQualified,false);
 assert.equal(terminalProgress(state,{messages:[],last,scope:{task:'b'}}).stagnationQualified,false);
});
test('bounded proof cache uses actual bytes and LRU; caller mutation cannot grow cache',()=>{
 const c=createBoundedProofCache({maxBytes:25,maxEntries:2});const value={v:'a'};c.set('a',value);c.set('b',{v:'b'});c.get('a');c.set('c',{v:'c'});assert.equal(c.has('b'),false);value.v='z'.repeat(100);c.get('a').v='z'.repeat(100);assert.equal(c.get('a').v,'a');assert.ok(c.stats().bytes<=25);assert.equal(c.set('huge',{v:'z'.repeat(100)}),false);assert.equal(c.stats().durableOriginalsUnchanged,true);
 assert.throws(()=>createBoundedProofCache({maxBytes:0}));assert.throws(()=>createBoundedProofCache({maxEntries:1.5}));assert.throws(()=>c.set('bad',undefined));
});
test('transport ACK metadata changes do not alter original outcome digest',()=>{
 const a={exitCode:0,output:'ok',responseCleanupConfirmed:false},b={...a,responseCleanupConfirmed:true,requestTransport:'changed'};assert.deepEqual(stableOriginalTransportResult(a),stableOriginalTransportResult(b));assert.notDeepEqual(stableOriginalTransportResult(a),stableOriginalTransportResult({...a,exitCode:1}));assert.equal(a.responseCleanupConfirmed,false);
});
const fullRead='<path>/project/module.mjs</path>\n<type>file</type>\n<content>\n'+Array.from({length:60},(_,i)=>(i+100)+': line '+i+'\n').join('')+'</content>';
const ref={file:'/project/archive/read.txt',sha256:sha(fullRead),callID:'call-read'};
test('preview carries original hash, missing lines and archive coordinate mapping',()=>{
 const p=formatReadPreview(fullRead,ref,9),meta=JSON.parse(p.split('\n')[0]);assert.deepEqual(meta.omittedLines,[106,156]);assert.deepEqual(meta.originalReadLines,[100,159]);assert.equal(meta.archiveSourceLineOffset,-96);assert.equal(meta.incompleteSourcePreview,true);assert.equal(meta.noReplayOrFreshCASAuthority,true);assert.equal(formatReadPreview(fullRead,ref,60),fullRead);
});
test('preview requires matching digest, known numbered format and safe budget',()=>{
 assert.throws(()=>formatReadPreview(fullRead,{...ref,sha256:sha('wrong')},5));assert.throws(()=>formatReadPreview(fullRead,ref,-1));assert.equal(formatReadPreview('plain',{...ref,sha256:sha('plain')},5),null);
});
const g={id:'goal-a',revision:1,objectiveSHA256:sha('goal')};
const nativeBinding={enabled:true,ownerStopped:false,root:'/project/actor',goal:g,sourceGoal:{id:g.id,revision:1,objective:'goal',phase:'running'}};
const manifestSHA=sha('manifest');const hold={holdNewUnsentOnly:true,owner:'shared_backend_maintenance',operationID:'operation-a',sourceManifestSHA256:manifestSHA};
const release={operationID:'operation-a',sourceManifestSHA256:manifestSHA,phase:'runtime_loaded_not_product_acceptance',nativePID:123,actors:{'session-a':{goalID:g.id,goalRevision:1,root:nativeBinding.root}}};
const maintenance=()=>({state:{enabled:true,clientMaintenance:structuredClone(hold)},binding:structuredClone(nativeBinding),sessionID:'session-a',root:nativeBinding.root,nativePID:123,release:structuredClone(release),manifestSHA256:manifestSHA});
test('only own completed maintenance operation/PID/manifest/Goal can release its hold',()=>{
 assert.equal(qualifyCompletedMaintenanceHold(maintenance()),true);
 for(const mutate of [a=>a.nativePID++,a=>a.release.operationID='later',a=>a.manifestSHA256=sha('other'),a=>a.binding.goal.revision++,a=>a.state.ownerStop=true,a=>a.binding.ownerStopped=true,a=>a.release.actors['session-a'].root='/other',a=>a.state.accepted=true]){const a=maintenance();mutate(a);assert.equal(qualifyCompletedMaintenanceHold(a),false)}
 assert.equal(qualifyCompletedMaintenanceHold({}),false);
});
const old={info:{id:'old-assistant',parentID:'old-input',providerID:'provider-a',modelID:'model-a',variant:'high',time:{created:1,completed:3},error:{name:'UnknownError',data:{message:'AGENT_REQUEST_HELD_unknownTools'}}},parts:[]};
const input={info:{id:'new-input',model:{providerID:'provider-a',modelID:'model-a'},time:{created:2}},parts:[{type:'text',synthetic:true,text:'[STUDIO_PEER_HANDOFF handoff-a]\nChanged interface'}]};
test('new accepted input is not resubmitted; peer reasoning level only for same native model',()=>{
 const q=qualifySupersededNativeInput({last:old,currentInput:input});assert.equal(q.peer,true);assert.equal(supersededNativeVariant({last:old,currentInput:input,inputQualification:q}),'high');
 const changed=structuredClone(input);changed.info.model.modelID='model-b';assert.equal(supersededNativeVariant({last:old,currentInput:changed,inputQualification:q}),undefined);
 const human=structuredClone(input);human.parts=[{type:'text',text:'Continue'}];assert.equal(supersededNativeVariant({last:old,currentInput:human,inputQualification:qualifySupersededNativeInput({last:old,currentInput:human})}),undefined);
 human.info.variant='low';assert.equal(supersededNativeVariant({last:old,currentInput:human,inputQualification:{peer:false}}),'low');
 human.parts[0].text='Stop';assert.equal(qualifySupersededNativeInput({last:old,currentInput:human}),null);
 const executed=structuredClone(old);executed.parts=[{type:'tool'}];assert.equal(qualifySupersededNativeInput({last:executed,currentInput:input}),null);
});
const snapshot=()=>({expected:{goalID:g.id,revision:1,objectiveSHA256:g.objectiveSHA256,lastAssistantID:'assistant-a',inputID:'input-a'},binding:structuredClone(nativeBinding),state:{enabled:true},messages:[{info:{role:'user',id:'input-a'},parts:[]},{info:{role:'assistant',id:'assistant-a',parentID:'input-a'},parts:[]}],status:{type:'idle'},nativeInputID:'input-a',permissionPending:false});
test('final snapshot refuses Stop, input change, permission and live tool',()=>{
 assert.equal(qualifyContinuationSnapshot(snapshot()),true);
 for(const mutate of [a=>a.state.ownerStop=true,a=>a.state.ownerAbort=true,a=>a.permissionPending=true,a=>a.nativeInputID='input-b',a=>a.messages.at(-1).parts.push({type:'tool',state:{status:'running'}}),a=>a.binding.sourceGoal.phase='complete']){const a=snapshot();mutate(a);assert.equal(qualifyContinuationSnapshot(a),false)}
});
test('merge derived changes retains fresh owner/ledger state and detects concurrent conflicts',()=>{
 const start={enabled:true,x:1,dispatches:[]},draft={...start,x:2},fresh={...start,ownerAbort:true,dispatches:[{messageID:'other'}]};const a=mergeContinuationState(start,draft,fresh);assert.equal(a.ownerAbort,true);assert.equal(a.dispatches.length,1);assert.equal(a.x,2);assert.throws(()=>mergeContinuationState(start,draft,{...fresh,x:3}),/CONFLICT/);
});
test('exclusive host writer CAS and immutable control receipt preserve later Stop',()=>{
 const root=mkdtempSync(path.join(os.tmpdir(),'control-test-'));try{
 const file=path.join(root,'state.json'),raw=JSON.stringify({enabled:true,dispatches:[]});writeFileSync(file,raw);assert.equal(commitContinuationIntent(file,'stale',{}),false);
 assert.equal(commitContinuationIntent(file,raw,{enabled:true,ownerStop:true,lastOutcome:'owner_stop',dispatches:[{messageID:'control-a',phase:'intent'}]}),true);
 assert.equal(settleContinuationIntent(file,'control-a',{phase:'accepted',lastOutcome:'accepted'}),true);const saved=JSON.parse(readFileSync(file));assert.equal(saved.ownerStop,true);assert.equal(saved.lastOutcome,'owner_stop');assert.equal(saved.dispatches[0].phase,'accepted');
 assert.throws(()=>settleContinuationIntent(file,'control-a',{phase:'UNKNOWN'}),/CONFLICT/);assert.throws(()=>settleContinuationIntent(file,'../bad',{phase:'accepted'}),/MESSAGE_ID/);assert.throws(()=>commitContinuationIntent('relative','',{}),/ABSOLUTE/);
 }finally{rmSync(root,{recursive:true,force:true})}
});
