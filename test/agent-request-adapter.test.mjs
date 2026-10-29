import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {createAgentRequestAdapter} from '../src/agent-request-adapter.mjs';
import {captureSourceReadEvidence} from '../src/evidence-context.mjs';

const policy=JSON.parse(await readFile(new URL('../config/request-policy.example.json',import.meta.url),'utf8'));
async function fixture(run) {
  const root=await mkdtemp(path.join(os.tmpdir(),'agent-request-'));
  try {
    await writeFile(path.join(root,'TECHNICAL_TASK.md'),'Implement the approved caller');
    await writeFile(path.join(root,'REQUIREMENTS.md'),'No original outcome replay');
    const task={binding:{actorID:'actor-a',sessionID:'session-a',goalID:'goal-a',revision:1,inputID:'input-a'},
      providerID:'provider-a',modelID:'model-a',workspaceRoot:root,fullGoal:'Full current Goal',projectContext:'Existing architecture and prototype',
      ownerStop:false,busy:false,pendingPermission:false,liveTools:false,unknownTools:false,unknownAdmissions:false};
    let evidence={records:[],originalResults:[],currentSources:[]};
    const host={task,checks:[],get evidence(){return evidence},set evidence(value){evidence=value},
      resolveTask:async()=>task,resolveEvidence:async()=>evidence,
      measureInput:async()=>({inputTokenUpperBound:1000,method:'isolated tokenizer fixture'}),
      assertSnapshotCurrent:async info=>{host.checks.push(info);if(info.prepared.preflight.requiresHostCacheAdmission)throw Error('HOST_CACHE_ADMISSION_REQUIRED')}};
    const adapter=()=>createAgentRequestAdapter({...host,policy});
    const request={sessionID:'session-a',requestID:'request-a',payload:{model:'model-a',max_tokens:4096,reasoning_effort:'high',stream:true,
      messages:[{role:'system',content:'Native policy'},{role:'user',content:'Original task'}],tools:[]}};
    await run({root,task,host,adapter,request});
  } finally {await rm(root,{recursive:true,force:true});}
}

test('one host adapter carries the full Goal, original tool result and usage across a normal tool step',async()=>{
  await fixture(async({host,task,adapter,request})=>{
    const client=adapter(), nativeBefore=structuredClone(request.payload);
    const first=await client.prepare(request);
    assert.deepEqual(request.payload,nativeBefore);
    await client.beforeDispatch(first);
    const sent=JSON.parse(first.serializedBody);
    assert.equal(sent.messages[0].content,'Native policy');
    assert.equal(JSON.parse(sent.messages[1].content).fullGoal,task.fullGoal);
    assert.equal(sent.max_tokens,4096);assert.equal(sent.reasoning_effort,'high');assert.equal(sent.stream,true);
    const toolCall={id:'call-read-a',type:'function',function:{name:'read',arguments:'{"path":"module.mjs"}'}};
    const bytes=Buffer.from('export const answer = 42;\n');
    const record=captureSourceReadEvidence({binding:task.binding,toolCall,receiptID:'read-a',sourcePath:'module.mjs',sourceBytes:bytes,range:{startLine:1,endLine:1}});
    const original=structuredClone(record.original);
    task.binding.inputID='input-b';
    host.evidence={records:[record],originalResults:[original],currentSources:[{binding:task.binding,path:'module.mjs',sha256:createHash('sha256').update(bytes).digest('hex'),proofID:'source-version-a'}]};
    const next={...request,requestID:'request-b',payload:{...request.payload,messages:[...request.payload.messages,
      {role:'assistant',tool_calls:[toolCall]},{role:'tool',tool_call_id:toolCall.id,content:'Native compact reference'}]}};
    const prepared=await client.prepare(next);await client.beforeDispatch(prepared);
    assert.equal(JSON.parse(prepared.serializedBody).messages.at(-1).content,bytes.toString());
    const observed=client.observe(prepared,{binding:prepared.binding,receiptID:'usage-a',observedAt:1000,stage:'final',
      usage:{prompt_tokens:20000,prompt_tokens_details:{cached_tokens:15000},completion_tokens:100}});
    assert.equal(observed.observation.metrics.uncachedInputTokens,5000);
    assert.equal(observed.budgetObservation.freshInputExceeded,false);
    assert.equal(observed.budgetObservation.retryAuthorized,false);
    assert.equal(host.checks.filter(x=>x.dispatchBoundary).length,2);
  });
});

for (const key of ['ownerStop','busy','pendingPermission','liveTools','unknownTools','unknownAdmissions']) test(key+' holds prepare and the actual dispatch boundary',async()=>{
  await fixture(async({host,adapter,request})=>{
    const client=adapter(), prepared=await client.prepare(request);
    host.task[key]=true;
    await assert.rejects(client.prepare(request),new RegExp('HELD_'+key));
    await assert.rejects(client.beforeDispatch(prepared),new RegExp('HELD_'+key));
    delete host.task[key];
    await assert.rejects(client.prepare(request),/LIFECYCLE_UNKNOWN/);
  });
});

test('task change or Stop during asynchronous measurement rejects without mutating the native input',async()=>{
  await fixture(async({host,adapter,request})=>{
    const before=structuredClone(request);
    host.measureInput=async()=>{host.task.binding.revision++;return{inputTokenUpperBound:1000,method:'fixture'}};
    await assert.rejects(adapter().prepare(request),/TASK_CHANGED/);
    assert.deepEqual(request,before);
    host.measureInput=async()=>{host.task.ownerStop=true;return{inputTokenUpperBound:1000,method:'fixture'}};
    await assert.rejects(adapter().prepare(request),/HELD_ownerStop/);
  });
});

test('host Source/CAS rejection is propagated rather than sending stale evidence',async()=>{
  await fixture(async({host,adapter,request})=>{
    host.assertSnapshotCurrent=async()=>{throw Error('EXACT_SOURCE_VERSION_CHANGED')};
    await assert.rejects(adapter().prepare(request),/EXACT_SOURCE_VERSION_CHANGED/);
  });
});

test('Source proof, Goal text and task documents are revalidated after pacing',async()=>{
  await fixture(async({host,adapter,request,root})=>{
    const client=adapter(), prepared=await client.prepare(request);
    host.task.fullGoal='Changed Goal without a revision bump';
    await assert.rejects(client.beforeDispatch(prepared),/TASK_CHANGED/);
    host.task.fullGoal='Full current Goal';
    host.evidence={records:[],originalResults:[],currentSources:[{binding:host.task.binding,path:'new.mjs',sha256:'a'.repeat(64),proofID:'new'}]};
    await assert.rejects(client.beforeDispatch(prepared),/SOURCE_SNAPSHOT_CHANGED/);
    host.evidence={records:[],originalResults:[],currentSources:[]};
    await writeFile(path.join(root,'REQUIREMENTS.md'),'Changed requirement');
    await assert.rejects(client.beforeDispatch(prepared),/CONTEXT_CHANGED/);
  });
});

test('large input gets no historical cache credit and requires the host cache admission',async()=>{
  await fixture(async({host,adapter,request})=>{
    host.measureInput=async()=>({inputTokenUpperBound:policy.maxFreshInputTokens+5000,method:'fixture upper bound'});
    await assert.rejects(adapter().prepare(request),/HOST_CACHE_ADMISSION_REQUIRED/);
    host.assertSnapshotCurrent=async info=>{assert.equal(info.prepared.preflight.historicalCacheCredit,0);return {cacheAdmission:{qualified:true,receiptID:'cache-admission-a',binding:info.prepared.binding,expectedFreshInputTokens:15000,observationKind:'bound_prefix_estimate'}}};
    const prepared=await adapter().prepare(request);
    assert.equal(prepared.preflight.requiresHostCacheAdmission,true);
    assert.equal(prepared.preflight.inputTokenUpperBound,policy.maxFreshInputTokens+5000);
    host.assertSnapshotCurrent=async()=>undefined;
    await assert.rejects(adapter().prepare(request),/BOUND_CACHE_ADMISSION_REQUIRED/);
  });
});

test('total/serialized bounds and missing tokenizer proof reject without provider access',async()=>{
  await fixture(async({host,adapter,request})=>{
    host.measureInput=async()=>({inputTokenUpperBound:80001,method:'fixture'});
    await assert.rejects(adapter().prepare(request),/TOTAL_INPUT_BUDGET_EXCEEDED/);
    host.measureInput=async()=>({inputTokenUpperBound:1000});
    await assert.rejects(adapter().prepare(request),/MEASUREMENT_UNKNOWN/);
    const big=structuredClone(request);big.payload.messages[1].content='x'.repeat(1048576);
    await assert.rejects(adapter().prepare(big),/SERIALIZED_BUDGET_EXCEEDED/);
  });
});

test('model/format/JSON misuse is explicit and output settings are never silently repaired',async()=>{
  await fixture(async({host,adapter,request})=>{
    const other=structuredClone(request);other.payload.model='different-model';
    await assert.rejects(adapter().prepare(other),/MODEL_OR_MESSAGES_MISMATCH/);
    assert.throws(()=>createAgentRequestAdapter({...host,policy,format:'responses'}),/QUALIFIED_SERIALIZER_REQUIRED/);
    assert.throws(()=>createAgentRequestAdapter({...host,policy,maxEvidenceBytes:Infinity}),/INVALID_ADAPTER/);
    for(const value of [undefined,Infinity,()=>{},new Date()]) {
      const bad=structuredClone(request);bad.payload.extra=value;
      await assert.rejects(adapter().prepare(bad),/JSON_REQUIRED/);
    }
  });
});

test('immutable prepared bytes and exact outcome binding preserve original accounting',async()=>{
  await fixture(async({adapter,request})=>{
    const client=adapter(), prepared=await client.prepare(request);
    assert.throws(()=>{prepared.binding.requestID='changed'},TypeError);
    const changed=structuredClone(prepared);changed.serializedBody+=' ';
    await assert.rejects(client.beforeDispatch(changed),/PREPARED_CONFLICT/);
    assert.throws(()=>client.observe(prepared,{binding:{...prepared.binding,requestID:'other'},receiptID:'r',observedAt:1,stage:'final',usage:{}}),/OUTCOME_BINDING_CONFLICT/);
    const unknown=client.observe(prepared,{binding:prepared.binding,receiptID:'r',observedAt:1,stage:'final',usage:{prompt_tokens:1000}});
    assert.equal(unknown.observation.metrics.cachedInputTokens,null);
    assert.equal(unknown.budgetObservation.freshInputExceeded,null);
    assert.equal(unknown.budgetObservation.retryAuthorized,false);
  });
});

test('provider-reported fresh overflow is recorded, never hidden or retried',async()=>{
  await fixture(async({adapter,request})=>{
    const client=adapter(), prepared=await client.prepare(request);
    const result=client.observe(prepared,{binding:prepared.binding,receiptID:'r',observedAt:1,stage:'final',usage:{prompt_tokens:policy.maxFreshInputTokens+5000,prompt_tokens_details:{cached_tokens:0}}});
    assert.equal(result.budgetObservation.freshInputExceeded,true);
    assert.equal(result.budgetObservation.retryAuthorized,false);
  });
});


test('changed or corrupted token admission evidence is not trusted after preparation',async()=>{
  await fixture(async({adapter,host,request})=>{
    const client=adapter(), prepared=await client.prepare(request);
    const corrupt=structuredClone(prepared);corrupt.preflight.serializedBytes++;
    await assert.rejects(client.beforeDispatch(corrupt),/PREPARED_CONFLICT/);
    host.measureInput=async()=>({inputTokenUpperBound:2000,method:'isolated tokenizer fixture'});
    await assert.rejects(adapter().beforeDispatch(prepared),/MEASUREMENT_CHANGED/);
  });
});


for(const format of ['responses','anthropic-messages']) test(format+' retains native reasoning/tool identities through an explicitly supplied host serializer',async()=>{
  await fixture(async({host,request})=>{
    const payload=format==='responses'?{model:'model-a',max_output_tokens:4096,reasoning:{effort:'high'},instructions:'Native instructions',
      input:[{type:'reasoning',id:'native-reasoning-a',encrypted_content:'opaque-original'},
        {type:'function_call',id:'native-function-a',call_id:'native-call-a',name:'read',arguments:'{}'},
        {type:'function_call_output',call_id:'native-call-a',output:'Original Source output'}]}:
      {model:'model-a',max_tokens:4096,thinking:{type:'enabled',budget_tokens:1024},system:[{type:'text',text:'Native instructions'}],
       messages:[{role:'assistant',content:[{type:'thinking',thinking:'Native summary',signature:'opaque-original'},
         {type:'tool_use',id:'native-call-a',name:'read',input:{}}]},
         {role:'user',content:[{type:'tool_result',tool_use_id:'native-call-a',content:'Original Source output'}]}]};
    const native=structuredClone(payload);
    const client=createAgentRequestAdapter({...host,policy,format,projectRequest:async({payload,taskContext,evidence})=>{
      assert.deepEqual(evidence.records,[]); // Nonempty native evidence requires its own qualified projection.
      if(format==='responses')payload.instructions+='\n'+taskContext;
      else payload.system.push({type:'text',text:taskContext});
      return{payload,evidenceDecisions:[]};
    }});
    const prepared=await client.prepare({...request,payload});await client.beforeDispatch(prepared);
    const sent=JSON.parse(prepared.serializedBody);
    assert.deepEqual(sent[format==='responses'?'input':'messages'],native[format==='responses'?'input':'messages']);
    assert.deepEqual(payload,native);
    const usage=format==='responses'?{input_tokens:1000,input_tokens_details:{cached_tokens:800}}:
      {input_tokens:200,cache_creation_input_tokens:0,cache_read_input_tokens:800};
    assert.equal(client.observe(prepared,{binding:prepared.binding,receiptID:'r',observedAt:1,stage:'final',usage}).observation.metrics.uncachedInputTokens,200);
  });
});

test('a host serializer cannot silently change generation settings',async()=>{
  await fixture(async({host,request})=>{
    const client=createAgentRequestAdapter({...host,policy,projectRequest:async({payload})=>({payload:{...payload,max_tokens:1},evidenceDecisions:[]})});
    await assert.rejects(client.prepare(request),/PARAMETER_CHANGED/);
  });
});


test('a supplied serializer cannot omit the complete task context or demote it to tool data',async()=>{
  await fixture(async({host,request})=>{
    for(const projectRequest of [async({payload})=>({payload,evidenceDecisions:[]}),
      async({payload,taskContext})=>({payload:{...payload,messages:[...payload.messages,{role:'tool',tool_call_id:'not-authority',content:taskContext}]},evidenceDecisions:[]})]) {
      const client=createAgentRequestAdapter({...host,policy,projectRequest});
      await assert.rejects(client.prepare(request),/TASK_CONTEXT_MISSING/);
    }
  });
});


test('native busy for the SAME proven unsent request is not confused with another live model',async()=>{
  await fixture(async({host,adapter,request})=>{
    host.task.busy=true;host.task.activeRequestID=request.requestID;host.task.activeRequestPhase='preparing';
    const client=adapter(), prepared=await client.prepare(request);
    host.task.activeRequestPhase='waiting_unsent';
    await client.beforeDispatch(prepared);
    host.task.activeRequestPhase='dispatched';
    await assert.rejects(client.beforeDispatch(prepared),/HELD_busy/);
    host.task.activeRequestPhase='waiting_unsent';host.task.activeRequestID='other-original-request';
    await assert.rejects(client.beforeDispatch(prepared),/HELD_busy/);
  });
});


test('native context values can be reused byte-for-byte without adding a second Goal',async()=>{
  await fixture(async({host,task,request,root})=>{
    task.fullGoal=JSON.stringify({id:'goal-a',objective:'Full current Goal',criteria:['same task']});
    task.projectContext='Authority with a newline\nand a quote "value"';
    const technicalContract=await readFile(path.join(root,'TECHNICAL_TASK.md'),'utf8');
    const requirements=await readFile(path.join(root,'REQUIREMENTS.md'),'utf8');
    const payload={...request.payload,messages:[{role:'system',content:'Native contract\n'+technicalContract+'\n'+requirements},
      {role:'system',content:JSON.stringify({goal:JSON.parse(task.fullGoal),authority:task.projectContext})},
      {role:'user',content:'Same native input'}]};
    const client=createAgentRequestAdapter({...host,policy,projectRequest:async({payload})=>({payload,evidenceDecisions:[],contextRepresentation:'native-values'})});
    const prepared=await client.prepare({...request,payload});
    assert.equal(prepared.serializedBody,JSON.stringify(payload));await client.beforeDispatch(prepared);
    const demoted=structuredClone(payload);for(const message of demoted.messages)message.role='user';
    await assert.rejects(client.prepare({...request,payload:demoted}),/TASK_CONTEXT_MISSING/);
  });
});

test('local estimates remain explicitly unknown hard bounds and require exact host admission',async()=>{
  await fixture(async({host,request})=>{
    host.measureInput=async()=>({inputTokenUpperBound:null,estimatedInputTokens:20000,method:'qualified native local estimate'});
    const options={...host,policy,allowHostEstimatedInput:true};
    await assert.rejects(createAgentRequestAdapter({...options,allowHostEstimatedInput:false}).prepare(request),/MEASUREMENT_UNKNOWN/);
    await assert.rejects(createAgentRequestAdapter(options).prepare(request),/BOUND_INPUT_ADMISSION_REQUIRED/);
    options.assertSnapshotCurrent=async({prepared})=>({inputAdmission:{qualified:true,receiptID:'native-budget-a',binding:prepared.binding,
      expectedTotalInputTokens:19000,expectedFreshInputTokens:15000,observationKind:'calibrated_estimate'}});
    const client=createAgentRequestAdapter(options),prepared=await client.prepare(request);
    assert.equal(prepared.preflight.inputTokenUpperBound,null);
    assert.equal(prepared.preflight.measurementKind,'host_estimate');
    assert.equal(prepared.hostInputAdmission.hardTokenBoundKnown,false);
    await client.beforeDispatch(prepared);
    const bad=structuredClone(prepared);bad.binding.requestSHA256='b'.repeat(64);
    await assert.rejects(client.beforeDispatch(bad),/PREPARED_CONFLICT/);
  });
});
