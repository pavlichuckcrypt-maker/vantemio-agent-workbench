import test from 'node:test';
import assert from 'node:assert/strict';
import * as progress from '../src/runtime-progress.mjs';
const task={taskID:'same-task',current:'Current source review',next:'Next independent source consumer'};
const todos=[{status:'completed',content:'Completed source fix'},{status:'in_progress',content:'Wait for original readback; preserve UNKNOWN'},{status:'pending',content:'QA after dependency'},{status:'pending',content:'Document verified dependency'},{status:'pending',content:'Review independent source'}];
test('continuation retains task current, next and unfinished native alternatives',()=>{
 const cue=progress.continuationTaskCue({task,todos});
 for(const text of [task.current,task.next,'Wait for original readback','Document verified dependency','Review independent source'])assert(cue.includes(text));
 assert(!cue.includes('Completed source fix'));
});
test('continuation projection does not mutate native task or TODO',()=>{
 const before=JSON.stringify({task,todos});progress.continuationTaskCue({task,todos});assert.equal(JSON.stringify({task,todos}),before);
});
test('long navigation is explicit about omitted and shortened data',()=>{
 const cue=progress.continuationTaskCue({task:{taskID:'same',current:'x'.repeat(3000),next:'y'.repeat(3000)},todos:Array.from({length:20},()=>({status:'pending',content:'z'.repeat(3000)}))});
 assert(cue.includes('truncated'));assert(cue.includes('omittedNativeTodos'));assert(cue.includes('fullValueInNativeTaskOrTodo'));assert(cue.length<7000);
});
test('repair and stream cues preserve rights, UNKNOWN and no-replay wording',()=>{
 const cue=progress.continuationTaskCue({task,todos,noActionRepair:true,retryableStream:true});
 for(const text of ['оборвался','фаза аудита и права остаются прежними','UNKNOWN','не повторять','не меняют Goal','остальные разрешённые'])assert(cue.includes(text));
});
test('empty metadata does not invent a task or native TODO',()=>{
 const cue=progress.continuationTaskCue();assert(cue.includes('"taskID":null'));assert(cue.includes('"nextUnfinishedNativeTodo":null'));assert(cue.includes('"unfinishedNativeTodoCount":0'));
});
const scope={goalID:'goal',revision:1,taskID:'task'};
const frame={externalInputID:'original-owner-input',providerID:'provider',modelID:'model',backendReleaseOperationID:'release'};
const terminal=(id,parentID,text)=>({info:{id,parentID,role:'assistant',finish:'stop',time:{completed:10}},parts:[{type:'text',text}]});
const initial=terminal('first','automatic-input','Waiting for unchanged evidence.');
const opts={messages:[initial],last:initial,scope,automaticContinuation:true,continuationFrame:frame};
test('a completed automatic no-action answer qualifies one grounded repair',()=>{
 const result=progress.terminalProgress({},opts);assert(result.noActionNeedsRepair);assert(!result.stagnationQualified);
});
test('a paraphrased completed repair descendant preserves original ledger phases',()=>{
 const first=progress.terminalProgress({},opts),last=terminal('second','repair-input','The same evidence is still pending.');
 for(const phase of ['intent','accepted','UNKNOWN']){
  const state={...first,dispatches:[{messageID:'repair-input',phase,kind:'native_task_evidence_repair',progressEvidenceSHA256:first.noActionEvidenceSHA256}]};
  const result=progress.terminalProgress(state,{...opts,messages:[last],last});assert(result.stagnationQualified);assert(!result.noActionNeedsRepair);assert.equal(state.dispatches[0].phase,phase);
 }
});
test('new owner input, selected model, task or release prevents stale stagnation',()=>{
 const first=progress.terminalProgress({},opts),last=terminal('second','repair-input','No fresh result.');
 const state={...first,dispatches:[{messageID:'repair-input',phase:'accepted',kind:'native_task_evidence_repair',progressEvidenceSHA256:first.noActionEvidenceSHA256}]};
 for(const change of [x=>x.continuationFrame.externalInputID='new-owner-input',x=>x.continuationFrame.modelID='new-model',x=>x.continuationFrame.backendReleaseOperationID='new-release',x=>x.scope.revision++,x=>x.scope.taskID='new-task']){
  const current=structuredClone({...opts,messages:[last],last});change(current);assert(!progress.terminalProgress(state,current).stagnationQualified);
 }
});
test('errors, incomplete output and owner turns are not no-action repair candidates',()=>{
 for(const change of [x=>x.last.info.error={name:'FixtureError'},x=>delete x.last.info.time.completed,x=>x.last.info.finish='length',x=>x.automaticContinuation=false]){
  const current=structuredClone(opts);change(current);assert(!progress.terminalProgress({},current).noActionNeedsRepair);
 }
});
test('a real tool action anywhere in the same turn prevents false no-action classification',()=>{
 const step={info:{role:'assistant',parentID:initial.info.parentID},parts:[{type:'tool',tool:'edit',state:{status:'completed',input:{filePath:'PLAN.md'},output:'actual plan update'}}]};
 assert(!progress.terminalProgress({},{...opts,messages:[step,initial]}).noActionNeedsRepair);
});
test('new current source observations remain evidence without claiming implementation',()=>{
 const step={info:{role:'assistant',parentID:initial.info.parentID},parts:[{type:'tool',tool:'read',callID:'source-call',state:{status:'completed',input:{filePath:'/workspace/project/core.mjs'},output:'1: export const current = true;'}}]};
 const result=progress.terminalProgress({},{...opts,messages:[step,initial]});assert.equal(result.newFacts.length,1);assert(!result.noActionNeedsRepair);assert(result.newFacts[0].candidateOnlyNotIntegration);
});
