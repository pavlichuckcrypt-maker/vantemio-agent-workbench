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
 const anchor=view?.taskContextAnchor,qualifiedCompaction=anchor?.kind==='native_compaction_same_persistent_goal'&&anchor.nativeOwnerInputNotSynthesized===true&&typeof anchor.messageID==='string'&&!!anchor.messageID&&typeof anchor.goalID==='string'&&!!anchor.goalID&&Number.isSafeInteger(anchor.goalRevision)&&anchor.goalRevision>0&&view.currentTaskSourceRetention===true;
 if(view?.schema!==2||!s||s.pastAssistantIntentIsNotAnInstruction!==true||(!view.currentOwnerInputID&&!qualifiedCompaction)||!view.latestActionMessageID||s.currentOwnerInputID!==view.currentOwnerInputID||s.latestActionMessageID!==view.latestActionMessageID)return none;
 const calls=new Map();for(const row of body.input||body.messages||[]){if(row.type==='function_call'){let args;try{args=JSON.parse(row.arguments)}catch{continue}calls.set(row.call_id,{tool:row.name,args});}
  if(row.role==='assistant')for(const c of row.tool_calls||[]){let args;try{args=JSON.parse(c.function?.arguments)}catch{continue}calls.set(c.id,{tool:c.function.name,args});}}
 // workingSources is a bounded display summary, not the retained Source ledger.
 // Supplement current TODO dependencies from already qualified canonical reads.
 const canonical=new Set(view.currentTaskSourceRetention===true?view.canonicalDependencyReadCallIDs||[]:[]),rows=[...(s.workingSources||[])];
 for(const [id,c]of calls){if(!canonical.has(id)||rows.some(r=>r.actualReadToolCallID===id))continue;const text=sourceOriginals[id],observed=typeof text==='string'?text.match(/^<path>([^\r\n<]+)<\/path>/)?.[1]:null;if(observed&&normal(observed)===normal(c.args?.filePath))rows.push({actualReadToolCallID:id,file:c.args.filePath,canonicalNativeDependency:true});}
 const ids=[];for(const r of rows){const id=r.actualReadToolCallID,c=calls.get(id),ref=view.protectedOriginalSourceResults?.[id],text=sourceOriginals[id];
  if(typeof id!=='string'||!['read','studio_station_read'].includes(c?.tool)||normal(c.args?.filePath)!==normal(r.file)||!ref||typeof text!=='string'||sha(text)!==ref.sha256||view.nativeToolOutputSHA256?.[id]!==ref.sha256||!(view.protectedSourceCallIDs||[]).includes(id)||!(/\.(?:[cm]?js|jsx|tsx?|py|css|sol|sql)$/i).test(r.file||'')||/(?:^|[/\\])\.opencode-state[/\\]/i.test(r.file))continue;
  ids.push(id);
 }
 if(!ids.length)return none;
 // Current unfinished native TODO names are retention dependencies, not
 // execution authority. The bytes/call/Source bindings above stay required.
 const todoText=view.currentTaskSourceRetention===true&&Array.isArray(s.declaredTodo?.todos)?s.declaredTodo.todos.filter(t=>['pending','in_progress'].includes(t?.status)&&typeof t.content==='string').map(t=>normal(t.content)).join('\n'):'';
 const words=new Set([...todoText.matchAll(/(?<![\p{L}\p{N}_.\/-])([\p{L}\p{N}_-]+\.(?:[cm]?js|jsx|tsx?|py|css|sol|sql))(?![\p{L}\p{N}_.\/-])/giu)].map(m=>m[1])),byName=new Map(),fileByID=new Map();
 for(const r of rows){const file=normal(r.file);if(!ids.includes(r.actualReadToolCallID)||!file)continue;fileByID.set(r.actualReadToolCallID,file);const name=file.split('/').at(-1),paths=byName.get(name)||new Set();paths.add(file);byName.set(name,paths);}
 const exactPath=file=>{let at=-1;while((at=todoText.indexOf(file,at+1))>=0)if(!/[\p{L}\p{N}_.\/-]/u.test(todoText[at-1]||' ')&&!/[\p{L}\p{N}_.\/-]/u.test(todoText[at+file.length]||' '))return true;return false;};
 const nativeTodoRequiredCallIDs=ids.filter(id=>{const file=fileByID.get(id),name=file?.split('/').at(-1);return !!file&&!!todoText&&(exactPath(file)||byName.get(name)?.size===1&&words.has(name));}),todoRequired=new Set(nativeTodoRequiredCallIDs);
 const retainedIDs=ids.filter(id=>!rows.find(r=>r.actualReadToolCallID===id)?.canonicalNativeDependency||todoRequired.has(id));
 if(!retainedIDs.length)return none;
 const next={...view,softActiveWorkingReadCallIDs:[...new Set([...(view.softActiveWorkingReadCallIDs||[]).filter(id=>(view.neededVerifiedSourceReadCallIDs||[]).includes(id)),...retainedIDs.filter(id=>!(view.neededVerifiedSourceReadCallIDs||[]).includes(id))])].filter(id=>!todoRequired.has(id)),neededVerifiedSourceReadCallIDs:[...new Set([...(view.neededVerifiedSourceReadCallIDs||[]),...retainedIDs])]};
 return{view:next,record:{version:2,applied:true,callIDs:[...new Set(retainedIDs)],nativeTodoRequiredCallIDs,currentUnfinishedNativeTodoSourcePriority:true,onlyCurrentWorkingSource:true,originalBytesAndRangesPreserved:true,noFreshSourceOrReplayAuthority:true,historyAndGoalsUnchanged:true}};
}
