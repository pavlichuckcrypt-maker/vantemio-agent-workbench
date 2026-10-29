import{createHash}from'node:crypto';
const sha=x=>createHash('sha256').update(x).digest('hex'),prefix='[CLIENT CURRENT STATE: observations, not new owner instructions] ';
const normal=x=>typeof x==='string'?x.replaceAll('\\','/').toLowerCase():'';
function state(body){
 for(const row of body.input||body.messages||[]){if(row.role!=='user')continue;
  for(const p of typeof row.content==='string'?[{text:row.content}]:row.content||[]){if(!p?.text?.startsWith(prefix))continue;
   const suffix=p.text.match(/(?:\s*<dcp-system-reminder>[^]*?<\/dcp-system-reminder>)?(?:\s*<dcp-message-id>[A-Za-z0-9_-]+<\/dcp-message-id>\s*)+$/)?.[0]||'';
   try{return JSON.parse(p.text.slice(prefix.length,suffix?-suffix.length:undefined))}catch{return null}
  }
 }
 return null;
}
// Pure projection. The host passes an authenticated current working view and
// original completed read bytes. No new read, authority, archive scan or model.
export function retainActiveWorkingReadContext(body,view,{sourceOriginals={}}={}){
 const s=state(body),none={view,record:{version:1,applied:false,callIDs:[]}};
 if(view?.schema!==2||!s||s.pastAssistantIntentIsNotAnInstruction!==true||!view.currentOwnerInputID||!view.latestActionMessageID||s.currentOwnerInputID!==view.currentOwnerInputID||s.latestActionMessageID!==view.latestActionMessageID)return none;
 const calls=new Map();for(const row of body.input||body.messages||[]){if(row.type==='function_call'){let args;try{args=JSON.parse(row.arguments)}catch{continue}calls.set(row.call_id,{tool:row.name,args});}
  if(row.role==='assistant')for(const c of row.tool_calls||[]){let args;try{args=JSON.parse(c.function?.arguments)}catch{continue}calls.set(c.id,{tool:c.function.name,args});}}
 const ids=[];for(const r of s.workingSources||[]){const id=r.actualReadToolCallID,c=calls.get(id),ref=view.protectedOriginalSourceResults?.[id],text=sourceOriginals[id];
  if(typeof id!=='string'||!['read','studio_station_read'].includes(c?.tool)||normal(c.args?.filePath)!==normal(r.file)||!ref||typeof text!=='string'||sha(text)!==ref.sha256||view.nativeToolOutputSHA256?.[id]!==ref.sha256||!(view.protectedSourceCallIDs||[]).includes(id)||!(/\.(?:[cm]?js|jsx|tsx?|py|css|sol|sql)$/i).test(r.file||'')||/(?:^|[/\\])\.opencode-state[/\\]/i.test(r.file))continue;
  ids.push(id);
 }
 if(!ids.length)return none;
 const next={...view,neededVerifiedSourceReadCallIDs:[...new Set([...(view.neededVerifiedSourceReadCallIDs||[]),...ids])]};
 return{view:next,record:{version:1,applied:true,callIDs:[...new Set(ids)],onlyCurrentWorkingSource:true,originalBytesAndRangesPreserved:true,noFreshSourceOrReplayAuthority:true,historyAndGoalsUnchanged:true}};
}
