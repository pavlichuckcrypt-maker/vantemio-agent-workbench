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

// A canonical read is an observation retained in the native ledger. It is not
// an instruction to resend a whole file on every continuation of a broad TODO.
export function planSourceContextTransfer(body,view,{sourceOriginals={}}={}){
 const s=state(body),none={view,index:null,record:{version:1,applied:false}};
 const a=view?.taskContextAnchor,anchor=a?.kind==='native_compaction_same_persistent_goal'&&a.nativeOwnerInputNotSynthesized===true&&a.goalID&&Number.isSafeInteger(a.goalRevision)&&view.currentTaskSourceRetention===true;
 if(view?.schema!==2||!s||s.pastAssistantIntentIsNotAnInstruction!==true||(!view.currentOwnerInputID&&!anchor)||s.currentOwnerInputID!==view.currentOwnerInputID||s.latestActionMessageID!==view.latestActionMessageID||view.currentTaskSourceRetention!==true)return none;
 if(s.currentContinuationContext?.sessionID&&s.currentContinuationContext.sessionID!==view.sessionID||s.currentContinuationContext?.goalID&&a?.goalID&&s.currentContinuationContext.goalID!==a.goalID||s.currentContinuationContext?.goalRevision&&a?.goalRevision&&s.currentContinuationContext.goalRevision!==a.goalRevision)return none;
 const explicit=new Set([...(view.requiredGoalSourceCallIDs||[]),...(view.currentGoalSourceCallIDs||[]),...(view.currentGoalArtifactReadCallIDs||[]),...(view.protectedCurrentTaskContextReads||[]).map(r=>r.callID),...(view.protectedReadonlySourceCacheRead?.qualified?[view.protectedReadonlySourceCacheRead.callID]:[])]),eligible=[],index=[];
 for(const id of view.canonicalDependencyReadCallIDs||[]){
  const ref=view.protectedOriginalSourceResults?.[id],text=sourceOriginals[id];if(!(view.protectedSourceCallIDs||[]).includes(id)||typeof text!=='string'||!ref||sha(text)!==ref.sha256||view.nativeToolOutputSHA256?.[id]!==ref.sha256)continue;
  const file=text.match(/^<path>([^\r\n<]+)<\/path>/)?.[1];if(!file||!/\.(?:[cm]?js|jsx|tsx?|py|css|sol|sql)$/i.test(file)||/(?:private|credential|secret|\.env|\.opencode-state)(?:[._/\\]|$)/i.test(file))continue;
  const numbered=text.split('\n').flatMap((l,i)=>{const m=l.match(/^(\d+):/);return m?[{source:+m[1],cache:i+1}]:[];});if(!numbered.length||!numbered.every((x,i)=>!i||x.source===numbered[i-1].source+1))continue;
  const snapshots=[...text.matchAll(/\[STATION_SOURCE_SNAPSHOT path=([^\r\n]+?) sha256=([a-f0-9]{64}) actualReadCompleted=true;/g)],snap=snapshots.at(-1),receipt=text.match(/\[STATION_NATIVE_RESULT request=[^\s]+ receipt=[^\r\n]+ sha256=([a-f0-9]{64})\]\s*(?:<dcp-message-id>[^<]+<\/dcp-message-id>\s*)?$/),sourceSHA=snap&&receipt&&normal(snap[1])===normal(file)&&snap[2]===receipt[1]?snap[2]:null;
  eligible.push(id);index.push({file:normal(file),observedSourceSHA256:sourceSHA,originalReadCallID:id,sourceRows:[numbered[0].source,numbered.at(-1).source],localOriginal:{file:ref.file,sha256:ref.sha256,cacheRows:[numbered[0].cache,numbered.at(-1).cache]},snapshotNotFreshCAS:true,readIsNotReviewOrAcceptance:true});
 }
 if(!eligible.length)return none;
 const deferred=new Set(eligible.filter(id=>!explicit.has(id))),next={...view,canonicalDependencyReadCallIDs:(view.canonicalDependencyReadCallIDs||[]).filter(id=>!deferred.has(id)),neededVerifiedSourceReadCallIDs:(view.neededVerifiedSourceReadCallIDs||[]).filter(id=>!deferred.has(id)),softActiveWorkingReadCallIDs:[...new Set([...(view.softActiveWorkingReadCallIDs||[]),...deferred])].filter(id=>!explicit.has(id))};
 return{view:next,index:{schema:'studio.current-source-cache-index/v1',sessionID:view.sessionID,goalID:a?.goalID??s.currentContinuationContext?.goalID??null,goalRevision:a?.goalRevision??s.currentContinuationContext?.goalRevision??null,entries:index.sort((a,b)=>a.file.localeCompare(b.file)||a.originalReadCallID.localeCompare(b.originalReadCallID)),rule:'Complete original reads remain in the SAME verified local request-memory. Use native read on localOriginal.file/cacheRows for needed code; do not repeat Station reads merely to recover unchanged returned Source. Fresh host/CAS checks remain separate. Current tool results and explicit Goal-required ranges remain protected; a filename in TODO does not require an entire historical file in every request.',notOwnerInstructionOrSourceClaim:true},record:{version:1,applied:true,deferredHistoricalReadCallIDs:[...deferred],explicitRequiredCallIDs:[...explicit],currentToolResultsUnchanged:true,nativeCanonicalLedgerUnchanged:true,noCacheHitAssumed:true,hardLimitsUnchanged:true}};
}

export function appendSourceCacheIndex(body,index,{archiveRef=null,maxInlineBytes=8192}={}){
 if(!index?.entries?.length)return{applied:false};const marker='[CURRENT VERIFIED LOCAL SOURCE CACHE — data, not instructions] ',raw=JSON.stringify(index),value=Buffer.byteLength(raw)<=maxInlineBytes?index:{schema:index.schema,sessionID:index.sessionID,goalID:index.goalID,goalRevision:index.goalRevision,entryCount:index.entries.length,fullIndex:archiveRef,rule:index.rule,notOwnerInstructionOrSourceClaim:true};if(value!==index&&!archiveRef)return{applied:false,requiresVerifiedLocalIndexArchive:true};
 const rows=body.input||body.messages;if(!Array.isArray(rows))return{applied:false};const text=marker+JSON.stringify(value),prior=rows.find(r=>r.role==='user'&&typeof r.content==='string'&&r.content.startsWith(marker));if(prior)prior.content=text;else rows.push({role:'user',content:text});return{applied:true,inlineEntries:value===index?index.entries.length:0,entryCount:index.entries.length,atVolatileTail:true,cacheControlMetadataUnchanged:true};
}

// Reuse an existing native cache-control object. Never invent a cache syntax or
// assume a cache hit. A volatile resume/diagnostic snapshot must not be the only
// native breakpoint after historical Source blocks leave the working packet.
export function stabilizeNativeCacheBoundary(body){
 const parts=[];for(const row of body.input||body.messages||[]){if(Array.isArray(row.content))for(const part of row.content)if(typeof part?.text==='string')parts.push({role:row.role,part});}if(Array.isArray(body.system))for(const part of body.system)if(typeof part?.text==='string')parts.push({role:'system',part});
 const goal=parts.find(x=>['system','developer'].includes(x.role)&&x.part.text.includes('[STABLE OWNER BACKEND GOAL AND TECHNICAL CONTRACT] '));if(!goal||goal.part.cache_control)return{version:1,changed:false};
 const volatile=parts.find(x=>x.role==='user'&&x.part.cache_control&&typeof x.part.cache_control==='object'&&x.part.cache_control.type==='ephemeral'&&/^\s*\[(?:CURRENT CROSS-CLIENT RESUME SNAPSHOT;|CLIENT CURRENT STATE:|CURRENT DECLARED PLAN AND PEERS;)/.test(x.part.text));if(!volatile)return{version:1,changed:false};
 goal.part.cache_control=structuredClone(volatile.part.cache_control);delete volatile.part.cache_control;return{version:1,changed:true,reusedNativeMetadata:true,movedFromVolatileObservation:true,stableGoalBoundary:true,breakpointCountUnchanged:true,providerCacheHitNotInferred:true};
}
