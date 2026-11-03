import{stationReadEnvelope,summarizeSourceRanges}from'./station-read-envelope.mjs';
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
 const explicitOriginal=new Set([...(view.requiredGoalSourceCallIDs||[]),...(view.currentGoalSourceCallIDs||[]),...(view.currentGoalArtifactReadCallIDs||[])]),represented=new Set();
 for(const alias of view.protectedCurrentTaskContextReads||[]){
  if(alias.contextKind!=='current-task-code-cache-read'||!(view.protectedTaskCodeCacheReadCallIDs||[]).includes(alias.callID)||alias.observationOnlyNotSourceClaim!==true||alias.sourceSnapshotNotFreshCAS!==true)continue;
  const originalID=alias.originalStationReadCallID,original=sourceOriginals[originalID],copy=sourceOriginals[alias.callID],ref=view.protectedOriginalSourceResults?.[alias.callID],originalRef=view.protectedOriginalSourceResults?.[originalID];
  if(explicitOriginal.has(originalID)||typeof original!=='string'||typeof copy!=='string'||!ref||!originalRef||sha(copy)!==alias.outputSHA256||ref.sha256!==alias.outputSHA256||view.nativeToolOutputSHA256?.[alias.callID]!==alias.outputSHA256||sha(original)!==originalRef.sha256||view.nativeToolOutputSHA256?.[originalID]!==originalRef.sha256)continue;
  const call=calls.get(originalID);if(call?.tool!=='studio_station_read'||normal(call.args?.filePath)!==normal(alias.originalStationPath))continue;
  const envelope=stationReadEnvelope({text:original,callID:originalID,filePath:alias.originalStationPath}),range=envelope?.sourceRange,coverage=new Set(alias.sourceRows||[]);
  if(!range||envelope.sourceSHA256!==alias.observedSourceSHA256||range[1]-range[0]+1>coverage.size)continue;
  let complete=true;for(let row=range[0];row<=range[1];row++)if(!coverage.has(row)){complete=false;break;}
  if(complete)represented.add(originalID);
 }
 const nativeTodoRequiredCallIDs=ids.filter(id=>{if(represented.has(id))return false;const file=fileByID.get(id),name=file?.split('/').at(-1);return !!file&&!!todoText&&(exactPath(file)||byName.get(name)?.size===1&&words.has(name));}),todoRequired=new Set(nativeTodoRequiredCallIDs);
 const retainedIDs=ids.filter(id=>!represented.has(id)&&(!rows.find(r=>r.actualReadToolCallID===id)?.canonicalNativeDependency||todoRequired.has(id)));
 if(!retainedIDs.length&&!represented.size)return none;
 const next={...view,softActiveWorkingReadCallIDs:[...new Set([...(view.softActiveWorkingReadCallIDs||[]).filter(id=>(view.neededVerifiedSourceReadCallIDs||[]).includes(id)),...retainedIDs.filter(id=>!(view.neededVerifiedSourceReadCallIDs||[]).includes(id))])].filter(id=>!todoRequired.has(id)),neededVerifiedSourceReadCallIDs:[...new Set([...(view.neededVerifiedSourceReadCallIDs||[]).filter(id=>!represented.has(id)),...retainedIDs])]};
 return{view:next,record:{version:2,applied:true,callIDs:[...new Set(retainedIDs)],representedNativeSourceReadCallIDs:[...represented],nativeTodoRequiredCallIDs,currentUnfinishedNativeTodoSourcePriority:true,onlyCurrentWorkingSource:true,originalBytesAndRangesPreserved:true,noFreshSourceOrReplayAuthority:true,historyAndGoalsUnchanged:true}};
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
  const envelope=stationReadEnvelope({text,callID:id,filePath:file}),sourceSHA=envelope?.sourceSHA256??null;
  eligible.push(id);index.push({file:normal(file),observedSourceSHA256:sourceSHA,originalTotalLines:envelope?.originalTotalLines??null,originalReadCallID:id,sourceRows:[numbered[0].source,numbered.at(-1).source],localOriginal:{file:ref.file,sha256:ref.sha256,cacheRows:[numbered[0].cache,numbered.at(-1).cache]},snapshotNotFreshCAS:true,readIsNotReviewOrAcceptance:true});
 }
 if(!eligible.length)return none;
 const deferred=new Set(eligible.filter(id=>!explicit.has(id))),next={...view,canonicalDependencyReadCallIDs:(view.canonicalDependencyReadCallIDs||[]).filter(id=>!deferred.has(id)),neededVerifiedSourceReadCallIDs:(view.neededVerifiedSourceReadCallIDs||[]).filter(id=>!deferred.has(id)),softActiveWorkingReadCallIDs:[...new Set([...(view.softActiveWorkingReadCallIDs||[]),...deferred])].filter(id=>!explicit.has(id))};
 return{view:next,index:{schema:'studio.current-source-cache-index/v1',sessionID:view.sessionID,goalID:a?.goalID??s.currentContinuationContext?.goalID??null,goalRevision:a?.goalRevision??s.currentContinuationContext?.goalRevision??null,coverageBySource:summarizeSourceRanges(index),entries:index.sort((a,b)=>a.file.localeCompare(b.file)||a.originalReadCallID.localeCompare(b.originalReadCallID)),rule:'Complete original reads remain in the SAME verified local request-memory. coverageBySource merges only fetched ranges of the SAME file and Source SHA; a per-page unobserved range does not erase earlier pages. Whole-file fetching is not whole-file review or audit acceptance. Recover specifically needed already-fetched Source from the listed local originals, instead of refetching the same ranges. Use native read on localOriginal.file/cacheRows for needed code; do not repeat Station reads merely to recover unchanged returned Source. Fresh host/CAS checks remain separate. Current tool results and explicit Goal-required ranges remain protected; a filename in TODO does not require an entire historical file in every request.',notOwnerInstructionOrSourceClaim:true},record:{version:1,applied:true,deferredHistoricalReadCallIDs:[...deferred],explicitRequiredCallIDs:[...explicit],currentToolResultsUnchanged:true,nativeCanonicalLedgerUnchanged:true,noCacheHitAssumed:true,hardLimitsUnchanged:true}};
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

// Drop only an exact duplicate technical PLAN excerpt already present in a
// current native read result. This does not summarize or modify that result.
export function deduplicateCurrentPlanExcerpt(body){
 const rows=body.input||body.messages||[],calls=new Map(),reads=[];
 for(const row of rows){if(row.role==='assistant')for(const c of row.tool_calls||[]){try{calls.set(c.id,{name:c.function.name,args:JSON.parse(c.function.arguments)});}catch{}}else if(row.type==='function_call'){try{calls.set(row.call_id,{name:row.name,args:JSON.parse(row.arguments)});}catch{}}}
 for(const row of rows){const id=row.role==='tool'?row.tool_call_id:row.type==='function_call_output'?row.call_id:null,text=row.role==='tool'?row.content:row.type==='function_call_output'?row.output:null,c=calls.get(id);if(!id||typeof text!=='string'||!['read','studio_station_read'].includes(c?.name)||typeof c.args?.filePath!=='string'||!/(?:^|[/\\])(?:PLAN|CURRENT_WORK)\.md$/i.test(c.args.filePath))continue;const observed=text.match(/^<path>([^\r\n<]+)<\/path>/)?.[1],content=text.match(/<content([^>]*)>\r?\n([^]*?)\r?\n<\/content>/);if(!observed||normal(observed)!==normal(c.args.filePath)||!content||!text.includes('<type>file</type>'))continue;let value=content[2];if(!content[1].includes('line-numbering="implicit-v1"')){const numbered=value.split(/\r?\n/);if(!numbered[0]?.startsWith('1:'))continue;if(!numbered.every((l,i)=>l.startsWith((i+1)+':')))continue;value=numbered.map(l=>l.replace(/^\d+: ?/,'')).join('\n');}else if(!/first-line="1"/.test(content[1]))continue;reads.push({id,file:normal(observed),value,toolResultSHA256:sha(text)});}
 let changed=0;for(const row of rows){if(row.role!=='user')continue;const parts=typeof row.content==='string'?[{text:row.content}]:row.content;if(!Array.isArray(parts))continue;for(const part of parts){const marker='[CURRENT DECLARED PLAN AND PEERS; not production evidence] ',text=part.text;if(typeof text!=='string'||!text.startsWith(marker))continue;let data;try{data=JSON.parse(text.slice(marker.length));}catch{continue;}const plan=data.plan;if(!plan||typeof plan.file!=='string'||typeof plan.currentLocalText!=='string'||plan.currentLocalText.length<512)continue;const covered=reads.find(r=>r.file===normal(plan.file)&&r.value.startsWith(plan.currentLocalText));if(!covered)continue;const excerpt=plan.currentLocalText;delete plan.currentLocalText;plan.currentInlineRead={callID:covered.id,toolResultSHA256:covered.toolResultSHA256,coveredExcerptSHA256:sha(excerpt),coveredExcerptChars:excerpt.length,alreadyInCurrentPacket:true,notFreshFileOrReviewAuthority:true};const next=marker+JSON.stringify(data);if(next.length>=text.length)continue;if(typeof row.content==='string')row.content=next;else part.text=next;changed++;}}
 return{version:1,changed:changed>0,duplicateExcerptsRemoved:changed,currentNativeReadAndGoalUnchanged:true,historyAndToolOutcomesUnchanged:true};
}

// Preserve actual Source code, with one verified mapping instead of nested
// native-read wrappers. Original results remain in the existing local archive.
export function projectVerifiedTaskSourceCacheReads(body,view,{sourceOriginals={}}={}){
 const proof=retainActiveWorkingReadContext(body,view,{sourceOriginals}),represented=new Set(proof.record.representedNativeSourceReadCallIDs||[]),changes=[];
 if(!represented.size)return{version:1,changes,originalsAndNativeProtocolUnchanged:true};
 const aliases=new Map((view.protectedCurrentTaskContextReads||[]).filter(a=>a.contextKind==='current-task-code-cache-read'&&represented.has(a.originalStationReadCallID)).map(a=>[a.callID,a]));
 for(const row of body.input||body.messages||[]){
  const id=row.type==='function_call_output'?row.call_id:row.role==='tool'?row.tool_call_id:null,key=row.type==='function_call_output'?'output':'content',a=aliases.get(id),raw=sourceOriginals[id],ref=view.protectedOriginalSourceResults?.[id];
  if(!a||typeof raw!=='string'||row[key]!==raw||!ref||sha(raw)!==ref.sha256)continue;
  const original=sourceOriginals[a.originalStationReadCallID],envelope=stationReadEnvelope({text:original,callID:a.originalStationReadCallID,filePath:a.originalStationPath}),range=envelope?.sourceRange,content=original?.match(/<content>\r?\n([\s\S]*?)\r?\n<\/content>/)?.[1],cachePath=raw.match(/^<path>([^\r\n<]+)<\/path>/)?.[1];
  if(!range||!cachePath||envelope.sourceSHA256!==a.observedSourceSHA256||typeof content!=='string')continue;
  const rows=content.split('\n').map(line=>line.match(/^(\d+): ([^\n]*)$/));
  if(rows.length!==range[1]-range[0]+1||rows.some((m,i)=>!m||Number(m[1])!==range[0]+i))continue;
  const metadata={sourceFile:a.originalStationPath,sourceSHA256:envelope.sourceSHA256,sourceRows:range,originalStationReadCallID:a.originalStationReadCallID,snapshotNotFreshCAS:true};
  const projected='[VERIFIED SOURCE CACHE CODE V1] '+JSON.stringify(metadata)+'\n<content source-lines="verified-cache-v1" first-line="'+range[0]+'" rows="'+rows.length+'">\n'+rows.map(m=>m[2]).join('\n')+'\n</content>';
  if(projected.length>=raw.length)continue;
  row[key]=projected;changes.push({callID:id,originalStationReadCallID:a.originalStationReadCallID,sourceSHA256:envelope.sourceSHA256,sourceRows:range,originalSHA256:ref.sha256,originalResultFile:ref.file,projectedSHA256:sha(projected),savedChars:raw.length-projected.length,allSourceCodePreserved:true,snapshotNotFreshCAS:true});
 }
 return{version:1,changes,originalsAndNativeProtocolUnchanged:true,providerCacheHitNotClaimed:true};
}
