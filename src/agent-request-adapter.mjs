import {createHash} from 'node:crypto';
import {createTaskContextTransform} from './task-context-hook.mjs';
import {restoreCurrentEvidence} from './evidence-context.mjs';
import {validateRequestBudget} from './request-budget.mjs';
import {normalizeProviderUsage,usageBinding} from './provider-usage.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const text = x => typeof x === 'string' && x.trim().length > 0;

function taskSnapshot(task, sessionID, requestID) {
  if (!task || task.binding?.sessionID !== sessionID || !text(task.providerID) || !text(task.modelID)) {
    throw Error('AGENT_REQUEST_INVALID_TASK');
  }
  // Required lifecycle evidence comes from the existing native host, not a chat title.
  for (const key of ['ownerStop','busy','pendingPermission','liveTools','unknownTools','unknownAdmissions']) {
    if (typeof task[key] !== 'boolean') throw Error('AGENT_REQUEST_LIFECYCLE_UNKNOWN');
    const ownedUnsent=key==='busy' && task.activeRequestID===requestID &&
      ['preparing','waiting_unsent'].includes(task.activeRequestPhase);
    if (task[key] && !ownedUnsent) throw Error('AGENT_REQUEST_HELD_'+key);
  }
  const checked=usageBinding({...task.binding,providerID:task.providerID,modelID:task.modelID,
    requestID:'validation-only',requestSHA256:'0'.repeat(64)});
  return {binding:Object.fromEntries(['actorID','sessionID','goalID','revision','inputID'].map(k=>[k,checked[k]])),
    providerID:checked.providerID,modelID:checked.modelID,workspaceRoot:task.workspaceRoot,
    fullGoal:task.fullGoal,projectContext:task.projectContext};
}

function jsonClone(value) {
  const visited=new Set();
  function check(x) {
    if (x === null || ['string','boolean'].includes(typeof x)) return;
    if (typeof x === 'number' && Number.isFinite(x)) return;
    if (!x || typeof x !== 'object' || visited.has(x) ||
        ![Object.prototype,Array.prototype,null].includes(Object.getPrototypeOf(x))) throw Error('AGENT_REQUEST_JSON_REQUIRED');
    visited.add(x);
    if (Array.isArray(x) && (Object.keys(x).length!==x.length ||
        Array.from({length:x.length},(_,i)=>i).some(i=>!Object.hasOwn(x,i)))) throw Error('AGENT_REQUEST_JSON_REQUIRED');
    for (const key of Object.keys(x)) {
      const descriptor=Object.getOwnPropertyDescriptor(x,key);
      if (!Object.hasOwn(descriptor,'value')) throw Error('AGENT_REQUEST_JSON_REQUIRED');
      check(descriptor.value);
    }
    visited.delete(x);
  }
  check(value);
  return JSON.parse(JSON.stringify(value));
}

function verifyPrepared(prepared) {
  if (prepared?.schema !== 'agent-prepared-request/v1' || typeof prepared.serializedBody !== 'string' ||
      sha(prepared.serializedBody) !== prepared.binding?.requestSHA256 ||
      !/^[a-f0-9]{64}$/.test(prepared.taskSnapshotSHA256 ?? '') ||
      !/^[a-f0-9]{64}$/.test(prepared.taskContextSHA256 ?? '') ||
      !/^[a-f0-9]{64}$/.test(prepared.evidenceSnapshotSHA256 ?? '')) throw Error('AGENT_REQUEST_PREPARED_CONFLICT');
  return usageBinding(prepared.binding);
}

function trustedContextStrings(body,format) {
  const blocks = value => typeof value==='string'?[value]:Array.isArray(value)?value.flatMap(x=>
    ['text','input_text'].includes(x?.type) && typeof x.text==='string'?[x.text]:[]):[];
  if (format==='anthropic-messages') return blocks(body.system);
  if (format==='responses') return [...blocks(body.instructions),...(Array.isArray(body.input)?body.input:[])
    .filter(m=>['system','developer'].includes(m?.role)).flatMap(m=>blocks(m.content))];
  return (Array.isArray(body.messages)?body.messages:[]).filter(m=>['system','developer'].includes(m?.role))
    .flatMap(m=>blocks(m.content));
}

function containsTaskContext(body,format,context,representation) {
  const trusted=trustedContextStrings(body,format);
  if (representation==='native-values') {
    const required=JSON.parse(context);
    return Object.values(required).every(value=>text(value) && trusted.some(s=>s.includes(value)||s.includes(JSON.stringify(value))));
  }
  if (representation!==undefined && representation!=='canonical-json') throw Error('AGENT_REQUEST_INVALID_CONTEXT_REPRESENTATION');
  return trusted.some(s=>s.includes(context));
}



// One host integration, no transport/authentication/storage authority or retry loop.
export function createAgentRequestAdapter({resolveTask,resolveEvidence,measureInput,assertSnapshotCurrent,projectRequest,
  policy,format='chat-completions',maxTaskContextBytes=262144,maxEvidenceBytes=262144,allowHostEstimatedInput=false} = {}) {
  if (![resolveTask,resolveEvidence,measureInput,assertSnapshotCurrent].every(x=>typeof x==='function') ||
      !['chat-completions','deepseek-chat','responses','anthropic-messages'].includes(format) ||
      !Number.isSafeInteger(maxEvidenceBytes) || maxEvidenceBytes<1 || maxEvidenceBytes>1048576 ||
      typeof allowHostEstimatedInput!=='boolean') throw Error('AGENT_REQUEST_INVALID_ADAPTER');
  if (projectRequest !== undefined && typeof projectRequest !== 'function') throw Error('AGENT_REQUEST_INVALID_ADAPTER');
  if (!projectRequest && ['responses','anthropic-messages'].includes(format)) throw Error('AGENT_REQUEST_QUALIFIED_SERIALIZER_REQUIRED');
  const budget=validateRequestBudget(policy ?? {});
  const transform=createTaskContextTransform({resolveTask,maxContextBytes:maxTaskContextBytes});
  function measurement(value) {
    if (!text(value?.method)) throw Error('AGENT_REQUEST_MEASUREMENT_UNKNOWN');
    if (Number.isSafeInteger(value.inputTokenUpperBound) && value.inputTokenUpperBound>=0) {
      return {inputTokenUpperBound:value.inputTokenUpperBound,estimatedInputTokens:null,measurementKind:'upper_bound',measurementMethod:value.method};
    }
    if (allowHostEstimatedInput && value.inputTokenUpperBound===null && Number.isSafeInteger(value.estimatedInputTokens) && value.estimatedInputTokens>=0) {
      return {inputTokenUpperBound:null,estimatedInputTokens:value.estimatedInputTokens,measurementKind:'host_estimate',measurementMethod:value.method};
    }
    throw Error('AGENT_REQUEST_MEASUREMENT_UNKNOWN');
  }
  function inputAdmission(prepared,result) {
    if (prepared.preflight.inputTokenUpperBound!==null) return null;
    const admission=result?.inputAdmission;
    if (!allowHostEstimatedInput || !admission || admission.qualified!==true || !text(admission.receiptID) ||
        !same(usageBinding(admission.binding),prepared.binding) ||
        !Number.isSafeInteger(admission.expectedTotalInputTokens) || admission.expectedTotalInputTokens<0 || admission.expectedTotalInputTokens>budget.maxInputTokens ||
        !Number.isSafeInteger(admission.expectedFreshInputTokens) || admission.expectedFreshInputTokens<0 ||
        admission.expectedFreshInputTokens>Math.min(admission.expectedTotalInputTokens,budget.maxFreshInputTokens) ||
        admission.expectedTotalInputTokens-admission.expectedFreshInputTokens>budget.maxCachedInputTokens ||
        !['native_estimate','calibrated_estimate'].includes(admission.observationKind)) throw Error('AGENT_REQUEST_BOUND_INPUT_ADMISSION_REQUIRED');
    return {receiptID:admission.receiptID,expectedTotalInputTokens:admission.expectedTotalInputTokens,
      expectedFreshInputTokens:admission.expectedFreshInputTokens,observationKind:admission.observationKind,hardTokenBoundKnown:false};
  }
  function cacheAdmission(prepared, result) {
    if (!prepared.preflight.requiresHostCacheAdmission) return null;
    const admission=result?.cacheAdmission;
    if (!admission || admission.qualified !== true || !text(admission.receiptID) ||
        !same(usageBinding(admission.binding),prepared.binding) ||
        !Number.isSafeInteger(admission.expectedFreshInputTokens) || admission.expectedFreshInputTokens < 0 ||
        admission.expectedFreshInputTokens > budget.maxFreshInputTokens ||
        !['bound_prefix_estimate','provider_admission'].includes(admission.observationKind)) {
      throw Error('AGENT_REQUEST_BOUND_CACHE_ADMISSION_REQUIRED');
    }
    return {receiptID:admission.receiptID,expectedFreshInputTokens:admission.expectedFreshInputTokens,
      observationKind:admission.observationKind,cacheHitGuarantee:false};
  }

  async function prepare({sessionID,requestID,payload}) {
    if (!text(sessionID) || !text(requestID)) throw Error('AGENT_REQUEST_ORIGINAL_ID_REQUIRED');
    const input={sessionID,requestID};
    const before=taskSnapshot(await resolveTask(input),sessionID,requestID);
    const original=jsonClone(payload);
    if (original?.model !== before.modelID) throw Error('AGENT_REQUEST_MODEL_OR_MESSAGES_MISMATCH');
    const context={system:[]};
    await transform(input,context);
    const evidence=jsonClone(await resolveEvidence({binding:before.binding}));
    let body, decisions, representation;
    if (projectRequest) {
      const projected=await projectRequest({binding:before.binding,format,payload:jsonClone(original),
        taskContext:context.system.join('\n'),evidence:jsonClone(evidence),maxEvidenceBytes});
      body=jsonClone(projected?.payload);decisions=jsonClone(projected?.evidenceDecisions);
      representation=projected?.contextRepresentation;
      if (!Array.isArray(decisions)) throw Error('AGENT_REQUEST_INVALID_PROJECTION');
    } else {
      body=original;
      if (!Array.isArray(body.messages)) throw Error('AGENT_REQUEST_MODEL_OR_MESSAGES_MISMATCH');
      const projection=restoreCurrentEvidence({...evidence,binding:before.binding,ownerStop:false,
        messages:body.messages,maxEvidenceBytes});
      const messages=projection.messages;
      const at=messages.findIndex(m=>!['system','developer'].includes(m?.role));
      messages.splice(at<0?messages.length:at,0,{role:'system',content:context.system.join('\n')});
      body={...body,messages};decisions=projection.decisions;
    }
    // Native serializers may change context fields only, never silently change model/output/options.
    const contextKeys=format==='responses'?['input','instructions']:format==='anthropic-messages'?['messages','system']:['messages'];
    for (const key of new Set([...Object.keys(original),...Object.keys(body)])) {
      if (!contextKeys.includes(key) && !same(original[key],body[key])) throw Error('AGENT_REQUEST_PARAMETER_CHANGED');
    }
    if (!containsTaskContext(body,format,context.system.join('\n'),representation)) throw Error('AGENT_REQUEST_TASK_CONTEXT_MISSING');
    const serializedBody=JSON.stringify(body), serializedBytes=Buffer.byteLength(serializedBody,'utf8');
    if (serializedBytes > budget.maxSerializedTextBytes) throw Error('AGENT_REQUEST_SERIALIZED_BUDGET_EXCEEDED');
    // The host must supply a qualified tokenizer/upper bound for this exact payload/model.
    const measured=measurement(await measureInput({serializedBody,providerID:before.providerID,modelID:before.modelID}));
    const count=measured.inputTokenUpperBound??measured.estimatedInputTokens;
    if (count > budget.maxInputTokens) throw Error('AGENT_REQUEST_TOTAL_INPUT_BUDGET_EXCEEDED');
    if (!same(before,taskSnapshot(await resolveTask(input),sessionID,requestID))) throw Error('AGENT_REQUEST_TASK_CHANGED');
    const binding=usageBinding({...before.binding,providerID:before.providerID,modelID:before.modelID,
      requestID,requestSHA256:sha(serializedBody)});
    const prepared={schema:'agent-prepared-request/v1',binding,format,serializedBody,
      taskSnapshotSHA256:sha(JSON.stringify(before)),evidenceSnapshotSHA256:sha(JSON.stringify(evidence)),
      taskContextSHA256:sha(context.system.join('\n')),
      preflight:{serializedBytes,...measured,requiresHostInputAdmission:measured.inputTokenUpperBound===null,
        historicalCacheCredit:0,requiresHostCacheAdmission:count>budget.maxFreshInputTokens},
      evidenceDecisions:decisions};
    // Existing host owns fresh Source/CAS and consistent document/lifecycle snapshots.
    const admission=await assertSnapshotCurrent({task:before,evidence,prepared:structuredClone(prepared)});
    prepared.hostInputAdmission=inputAdmission(prepared,admission);
    prepared.hostCacheAdmission=cacheAdmission(prepared,admission);
    if (!same(before,taskSnapshot(await resolveTask(input),sessionID,requestID))) throw Error('AGENT_REQUEST_TASK_CHANGED');
    Object.freeze(prepared.binding);
    Object.freeze(prepared.preflight);
    if (prepared.hostCacheAdmission) Object.freeze(prepared.hostCacheAdmission);
    if (prepared.hostInputAdmission) Object.freeze(prepared.hostInputAdmission);
    prepared.evidenceDecisions=Object.freeze(prepared.evidenceDecisions.map(Object.freeze));
    return Object.freeze(prepared);
  }

  async function beforeDispatch(prepared) {
    const binding=verifyPrepared(prepared), input={sessionID:binding.sessionID,requestID:binding.requestID};
    const bytes=Buffer.byteLength(prepared.serializedBody,'utf8'), count=prepared.preflight?.inputTokenUpperBound??prepared.preflight?.estimatedInputTokens;
    if (!Number.isSafeInteger(count) || count<0 || count>budget.maxInputTokens || bytes>budget.maxSerializedTextBytes ||
        bytes!==prepared.preflight.serializedBytes ||
        prepared.preflight.requiresHostCacheAdmission!==(count>budget.maxFreshInputTokens)) throw Error('AGENT_REQUEST_PREPARED_CONFLICT');
    const task=taskSnapshot(await resolveTask(input),binding.sessionID,binding.requestID);
    if (prepared.format!==format || sha(JSON.stringify(task))!==prepared.taskSnapshotSHA256 ||
        !same(task.binding,Object.fromEntries(['actorID','sessionID','goalID','revision','inputID'].map(k=>[k,binding[k]]))) ||
        task.providerID!==binding.providerID || task.modelID!==binding.modelID) throw Error('AGENT_REQUEST_TASK_CHANGED');
    const evidence=jsonClone(await resolveEvidence({binding:task.binding}));
    if (sha(JSON.stringify(evidence))!==prepared.evidenceSnapshotSHA256) throw Error('AGENT_REQUEST_SOURCE_SNAPSHOT_CHANGED');
    const context={system:[]};
    await transform(input,context);
    if (sha(context.system.join('\n'))!==prepared.taskContextSHA256) throw Error('AGENT_REQUEST_CONTEXT_CHANGED');
    const measured=measurement(await measureInput({serializedBody:prepared.serializedBody,providerID:binding.providerID,modelID:binding.modelID}));
    if (measured.inputTokenUpperBound!==prepared.preflight.inputTokenUpperBound ||
        measured.estimatedInputTokens!==(prepared.preflight.estimatedInputTokens??null) ||
        measured.measurementMethod!==prepared.preflight.measurementMethod) throw Error('AGENT_REQUEST_MEASUREMENT_CHANGED');
    // No cached usage from another/earlier request is a grant for this dispatch.
    const admission=await assertSnapshotCurrent({task,evidence,prepared:structuredClone(prepared),dispatchBoundary:true});
    inputAdmission(prepared,admission);
    cacheAdmission(prepared,admission);
    if (!same(task,taskSnapshot(await resolveTask(input),binding.sessionID,binding.requestID))) throw Error('AGENT_REQUEST_TASK_CHANGED');
    return {requestID:binding.requestID,requestSHA256:binding.requestSHA256};
  }

  function observe(prepared,{binding:original,receiptID,observedAt,stage,usage}) {
    const binding=verifyPrepared(prepared);
    if (prepared.format!==format || !same(binding,usageBinding(original))) throw Error('AGENT_REQUEST_OUTCOME_BINDING_CONFLICT');
    const observation=normalizeProviderUsage({format,binding,receiptID,observedAt,stage,usage});
    const m=observation.metrics;
    return {observation,budgetObservation:{final:stage==='final',
      totalInputExceeded:m.inputTokens===null?null:m.inputTokens>budget.maxInputTokens,
      freshInputExceeded:m.uncachedInputTokens===null?null:m.uncachedInputTokens>budget.maxFreshInputTokens,
      cachedInputExceeded:m.cachedInputTokens===null?null:m.cachedInputTokens>budget.maxCachedInputTokens,
      retryAuthorized:false}};
  }
  return {prepare,beforeDispatch,observe};
}
