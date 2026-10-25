// Derivative recovery accounting only. Never dispatches or rewrites native results.
const time=m=>Number(m?.info?.time?.completed)||0;
function genuine(m,providerID,modelID){const i=m?.info||{};return i.role==='assistant'&&i.providerID===providerID&&i.modelID===modelID&&!i.error&&time(m)>0&&((i.finish==='tool-calls'&&(m.parts||[]).some(p=>p.type==='tool'&&p.callID))||(m.parts||[]).some(p=>p.type==='text'&&String(p.text||'').trim()));}
export function providerFailureState(state,messages,{failure,providerID,modelID}={}){
 if(!providerID||!modelID)throw Error("EXPLICIT_PROVIDER_MODEL_REQUIRED");
 const out={providerStreamFailures:Number(state.providerStreamFailures)||0,providerConsecutiveFailureIDs:[...(state.providerConsecutiveFailureIDs||[])],lastProviderSuccessAt:Number(state.lastProviderSuccessAt)||0,lastProviderFailureAt:Number(state.lastProviderFailureAt)||0};
 const old=messages.find(m=>m.info?.id===state.lastAssistantID&&m.info?.error);
 if(!out.lastProviderFailureAt&&old)out.lastProviderFailureAt=time(old);
 const successes=messages.filter(m=>genuine(m,providerID,modelID)).sort((a,b)=>time(a)-time(b)),last=successes.at(-1);
 const cutoffKnown=out.providerStreamFailures===0||out.lastProviderFailureAt>0;
 if(last&&cutoffKnown&&time(last)>out.lastProviderSuccessAt&&time(last)>out.lastProviderFailureAt){out.providerStreamFailures=0;out.providerConsecutiveFailureIDs=[];out.lastProviderSuccessAt=time(last);out.providerRecoveredBy={assistantID:last.info.id,completedAt:time(last),nativeCallIDs:(last.parts||[]).filter(p=>p.type==='tool').map(p=>p.callID),kind:'completed-provider-generation-not-config-or-HTTP200'};}
 if(failure){const i=failure.info||{},at=time(failure);if(at>0&&out.lastProviderSuccessAt>=at){out.failureSupersededBySuccess=true;return out;}
  if(i.id&&!out.providerConsecutiveFailureIDs.includes(i.id)){
   // Legacy native callback may already have counted this exact failed assistant.
   if(!(state.lastAssistantID===i.id&&out.providerStreamFailures>0))out.providerStreamFailures++;
   out.providerConsecutiveFailureIDs.push(i.id);
  }
  out.lastProviderFailureAt=Math.max(out.lastProviderFailureAt,at);
 }
 return out;
}
