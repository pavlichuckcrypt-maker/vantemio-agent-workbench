import{readFileSync,writeFileSync,renameSync,unlinkSync,mkdirSync}from'node:fs';import path from'node:path';import{createHash,randomUUID}from'node:crypto';
const sha=x=>createHash('sha256').update(x).digest('hex'),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function qualifySupersededNativeInput({last,currentInput}){
 const info=last?.info,input=currentInput?.info,parts=(currentInput?.parts||[]).filter(p=>p.type==='text');
 const code=info?.error?.data?.message,preDispatch=['NATIVE_PUBLIC_CORE_GOAL_OR_INPUT_CHANGED','NATIVE_SDK_INPUT_SUPERSEDED_OR_STOPPED','AGENT_REQUEST_HELD_unknownTools'].includes(code)||/^CLIENT_INPUT_BUDGET_EXCEEDED: \d+ serialized text bytes, \d+ local estimated tokens; no provider request sent/.test(code||'');
 if(info?.error?.name!=='UnknownError'||!preDispatch||!Number.isFinite(info.time?.completed)||!Number.isFinite(input?.time?.created)||input.time.created<info.time.created||input.id===info.parentID||!parts.length||(last.parts||[]).some(p=>p.type==='tool'||['text','reasoning'].includes(p.type)&&p.text))return null;
 if(parts.some(p=>/^(?:stop|pause|стоп|пауза|остановись)(?:[.!\s]|$)/iu.test((p.text||'').trim())))return null;
 const peer=parts.every(p=>p.synthetic===true&&/^\[STUDIO_PEER_HANDOFF [-A-Za-z0-9_.:]+\]\r?\n/.test(p.text||''));
 const human=parts.some(p=>p.synthetic!==true&&!p.metadata?.backendContinuation);
 return human?{kind:'accepted_owner_input',peer:false}:peer?{kind:'accepted_peer_input',peer:true}:null;
}
export function supersededNativeVariant({last,currentInput,inputQualification}){
 const u=currentInput?.info,m=last?.info;if(u?.variant!=null)return u.variant;
 // A technical handoff is not an owner decision to change reasoning effort.
 // Preserve it only for the SAME native provider/model; never carry it to a
 // different model, or over an explicit new owner input.
 return inputQualification?.peer&&u?.model?.providerID===m?.providerID&&(u.model.modelID??u.model.id)===m?.modelID?m.variant:undefined;
}
export function qualifyContinuationSnapshot({expected,binding,state,messages,status,nativeInputID,permissionPending}){
 const g=binding?.goal,o=binding?.sourceGoal,last=messages?.findLast(m=>m.info.role==='assistant'),input=messages?.findLast(m=>m.info.role==='user');
 if(!expected||!Array.isArray(messages))return false;
 const sameTurnWithoutPagedUser=!input&&messages?.length&&messages.every(m=>m.info.role==='assistant'&&m.info.parentID===expected.inputID);
 return !!(binding?.enabled&&!binding.ownerStopped&&state?.enabled!==false&&!state?.ownerAbort&&!state?.ownerStop&&!state?.accepted&&!state?.clientMaintenance?.holdNewUnsentOnly&&!permissionPending&&(!status||status.type==='idle')&&g?.id===expected.goalID&&g?.revision===expected.revision&&g?.objectiveSHA256===expected.objectiveSHA256&&g.id===o?.id&&g.revision===o.revision&&sha(o.objective||'')===g.objectiveSHA256&&!['paused','stopped','complete','completed'].includes(o.phase)&&!['paused','stopped','complete','completed'].includes(o.status)&&last?.info.id===expected.lastAssistantID&&(input?.info.id===expected.inputID||sameTurnWithoutPagedUser)&&(!nativeInputID||nativeInputID===expected.inputID)&&!messages.some(m=>(m.parts||[]).some(p=>p.type==='tool'&&['pending','running'].includes(p.state?.status))));
}
export function mergeContinuationState(initial,draft,fresh){
 const next=structuredClone(fresh),owned=new Set(['enabled','accepted','ownerAbort','ownerStop','ownerResume','dispatches','clientMaintenance']);
 for(const key of new Set([...Object.keys(initial),...Object.keys(draft)])){
  if(owned.has(key)||same(initial[key],draft[key]))continue;
  if(!same(fresh[key],initial[key])&&!same(fresh[key],draft[key]))throw Error('CONTINUATION_DERIVED_STATE_CONFLICT');
  if(key in draft)next[key]=structuredClone(draft[key]);else delete next[key];
 }
 return next;
}
// Native Stop/input events run on this process's event loop. The predecessor
// check and atomic replacement deliberately contain no await/yield between them.
export function commitContinuationIntent(file,expectedRaw,next){
 if(typeof file!=='string'||!path.isAbsolute(file))throw Error('OWNED_ABSOLUTE_STATE_FILE_REQUIRED');
 if(!readFileSync(file).equals(Buffer.from(expectedRaw)))return false;
 const tmp=file+'.control-'+randomUUID()+'.tmp';writeFileSync(tmp,JSON.stringify(next,null,2),{flag:'wx',mode:0o600});
 if(!readFileSync(file).equals(Buffer.from(expectedRaw))){unlinkSync(tmp);return false;}
 renameSync(tmp,file);return true;
}
export function settleContinuationIntent(file,messageID,{phase,error,lastOutcome}){
 if(typeof file!=='string'||!path.isAbsolute(file))throw Error('OWNED_ABSOLUTE_STATE_FILE_REQUIRED');
 if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/.test(messageID||''))throw Error('INVALID_CONTROL_MESSAGE_ID');
 if(!['accepted','UNKNOWN','cancelled_before_post_state_changed'].includes(phase))throw Error('INVALID_CONTROL_PHASE');
 const folder=path.join(path.dirname(file),'request-memory');mkdirSync(folder,{recursive:true});
 const receipt={schema:'studio.native-control-receipt/v1',messageID,phase,...(error?{error}:{}),at:new Date().toISOString()},receiptFile=path.join(folder,'native-control-'+messageID+'.json');
 try{writeFileSync(receiptFile,JSON.stringify(receipt),{flag:'wx',mode:0o600})}catch(e){if(e.code!=='EEXIST')throw e;const old=JSON.parse(readFileSync(receiptFile));if(old.messageID!==messageID||old.phase!==phase||old.error!==error)throw Error('NATIVE_CONTROL_RECEIPT_CONFLICT')}
 const raw=readFileSync(file),state=JSON.parse(raw),entry=state.dispatches?.find(d=>d.messageID===messageID);if(!entry)return false;
 entry.phase=phase;if(error)entry.error=error;entry.originalControlReceipt=receiptFile;
 if(!state.ownerAbort&&!state.ownerStop&&!state.accepted&&state.enabled!==false)state.lastOutcome=lastOutcome;
 return commitContinuationIntent(file,raw,state);
}
