/** Preserve the native root contract across the installed legacy Context boundary. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';import path from 'node:path';import {pathToFileURL} from 'node:url';
import{stableTaskArtifactPrefix,qualifyTaskArtifact}from'./task-artifact-view.mjs';
export const name='studio-pi-root-context-compat';export const inject=['llm','sessions'];
const sha=v=>createHash('sha256').update(typeof v==='string'||v instanceof Uint8Array?v:JSON.stringify(v)).digest('hex');
export function preserveNativeRoot(options){
 const messages=options.messages;if(!Array.isArray(messages))return {options,changed:false,reason:'no_native_messages'};
 const parts=[];if(typeof options.system==='string'&&options.system.length)parts.push(options.system);
 let count=0;for(const message of messages){
  if(message.role!=='system')break;
  if(!Array.isArray(message.content)||message.content.some(b=>b.type!=='text'))return {options,changed:false,reason:'native_unsupported_root_delegated'};
  parts.push(message.content.map(b=>b.text).join(''));count++;
 }
 const text=parts.filter(Boolean).join('\n\n');if(!text)return {options,changed:false,reason:'no_root_text'};
 const first=messages[0],root=Object.freeze({...(count?first:{}),role:'developer',content:Object.freeze([Object.freeze({type:'text',text})])});
 // SDK appendDeveloper emits a leading pi-ai system message. Its old systemPrompt
 // field is ignored by this installed pi-ai version. No user/tool text is promoted.
 const next=Object.freeze({...options,system:undefined,messages:Object.freeze([root,...messages.slice(count)])});
 return {options:next,changed:true,rootSHA256:sha(text),rootCharacters:text.length,originalLeadingSystemCount:count};
}
async function save(file,data){await mkdir(path.dirname(file),{recursive:true});const t=file+'.'+randomUUID()+'.tmp';await writeFile(t,JSON.stringify(data),{flag:'wx',mode:0o600});try{await rename(t,file);}catch(e){if(!['EPERM','EACCES','EBUSY'].includes(e.code))throw e;}}
export function installRootCompatibility(llm,{expectedPrepareSHA256,expectedStreamSHA256,onForward=async()=>{},trustedArtifactsFor=()=>[]}){
 if(!(llm?.adapters instanceof Map)||typeof llm.emitAdaptersUpdated!=='function')throw Error('QUALIFIED_NATIVE_LLM_REGISTRY_REQUIRED');
 const owned=new Map();let busy=false,disposed=false;
 function wrap(options,delegate){return (async function*(){let authority=null;try{authority=await trustedArtifactsFor(options.sessionId);}catch{}const trusted=Array.isArray(authority)?authority:authority?.messages??[],qualified=authority?.kind==='current-native-task-artifacts-v1';const root=preserveNativeRoot(options),prefix=stableTaskArtifactPrefix(root.options,{trustedArtifacts:trusted,includeMissingNative:qualified,currentTaskBinding:qualified?authority:null}),view={...root,options:prefix.options,taskPrefixChanged:prefix.changed,taskPrefixSHA256:prefix.taskPrefixSHA256,taskArtifactCount:prefix.artifactCount,insertedNativeArtifactCount:prefix.insertedNativeArtifactCount,taskPrefixReason:prefix.reason,nativeSessionProvenanceUsed:prefix.nativeSessionProvenanceUsed,trustedArtifactCount:trusted.length,wireArtifactShapes:(root.options.messages??[]).filter(m=>m.content?.some(b=>b.type==='text'&&b.text.includes('[CURRENT DECLARED TASK ARTIFACT]'))).map(m=>({role:m.role,sourceKind:m.source?.kind??null,relativePath:m.source?.relativePath??null,contentSHA256:sha(m.content),blockTypes:m.content.map(b=>b.type)}))};try{await onForward(options,view);}catch{}yield*delegate(view.options);})();}
 function sync(notify=false){
  if(disposed||busy)return 0;busy=true;let added=0;
  try{
   const live=new Set([...llm.adapters.values()].map(r=>r.adapter));
   for(const [adapter,state] of owned){if(live.has(adapter))continue;restore(adapter,state);owned.delete(adapter);}
   const candidates=[];
   for(const adapter of live){
    if(owned.has(adapter))continue;
    if(typeof adapter?.prepareCall!=='function'||typeof adapter?.stream!=='function'||
      sha(adapter.prepareCall.toString())!==expectedPrepareSHA256||sha(adapter.stream.toString())!==expectedStreamSHA256)continue;
    if(!Object.isExtensible(adapter))throw Error('NATIVE_ADAPTER_NOT_EXTENSIBLE');
    const prepare=adapter.prepareCall,stream=adapter.stream,prepareDescriptor=Object.getOwnPropertyDescriptor(adapter,'prepareCall'),streamDescriptor=Object.getOwnPropertyDescriptor(adapter,'stream');
    if(prepareDescriptor&&!prepareDescriptor.configurable||streamDescriptor&&!streamDescriptor.configurable)throw Error('NATIVE_ADAPTER_METHOD_NOT_CONFIGURABLE');
    candidates.push({adapter,prepare,stream,prepareDescriptor,streamDescriptor});
   }
   // Validate the complete eligible set before touching any live adapter.
   for(const {adapter,prepare,stream,prepareDescriptor,streamDescriptor} of candidates){
    const preparedWrapper=function(...args){const result=Reflect.apply(prepare,this,args);return Promise.resolve(result).then(call=>{
     if(!call||typeof call.stream!=='function')throw Error('NATIVE_PREPARED_STREAM_REQUIRED');
     return Object.freeze({...call,stream:options=>wrap(options,next=>call.stream(next))});
    });};
    const streamWrapper=function(options){return wrap(options,next=>Reflect.apply(stream,this,[next]));};
    Object.defineProperty(adapter,'prepareCall',{value:preparedWrapper,writable:true,configurable:true});
    Object.defineProperty(adapter,'stream',{value:streamWrapper,writable:true,configurable:true});
    owned.set(adapter,{prepare,stream,prepareDescriptor,streamDescriptor,preparedWrapper,streamWrapper});added++;
   }
   if(notify&&added)llm.emitAdaptersUpdated();
   return added;
  }finally{busy=false;}
 }
 function restore(adapter,s){
  for(const [key,wrapper,descriptor] of [['prepareCall',s.preparedWrapper,s.prepareDescriptor],['stream',s.streamWrapper,s.streamDescriptor]]){
   if(adapter[key]!==wrapper)continue;if(descriptor)Object.defineProperty(adapter,key,descriptor);else delete adapter[key];
  }
 }
 return {sync,get size(){return owned.size;},dispose(){if(disposed)return;disposed=true;for(const [a,s]of owned)restore(a,s);owned.clear();llm.emitAdaptersUpdated();}};
}
/** Remove only the exact old, owned wrapper pair from the qualified native class. */
export function repairLegacyRootWrappers(llm,NativeAdapter,{prepareSHA256,streamSHA256}){
 const rows=[];
 for(const adapter of new Set([...llm.adapters.values()].map(r=>r.adapter))){
  const proto=Object.getPrototypeOf(adapter);
  if(typeof adapter?.prepareCall!=='function'||typeof adapter?.stream!=='function'||typeof proto?.prepareCall!=='function'||typeof proto?.stream!=='function'||sha(proto.prepareCall.toString())!==sha(NativeAdapter.prototype.prepareCall.toString())||sha(proto.stream.toString())!==sha(NativeAdapter.prototype.stream.toString()))continue;
  if(sha(adapter.prepareCall.toString())!==prepareSHA256||sha(adapter.stream.toString())!==streamSHA256)continue;
  const prepare=Object.getOwnPropertyDescriptor(adapter,'prepareCall'),stream=Object.getOwnPropertyDescriptor(adapter,'stream');
  if(!prepare?.configurable||!stream?.configurable)throw Error('LEGACY_OWN_ROOT_WRAPPER_NOT_CONFIGURABLE');
  rows.push({adapter,prepare,stream});
 }
 // Check the complete owned predecessor set before changing any method.
 for(const {adapter}of rows){delete adapter.prepareCall;delete adapter.stream;}
 return rows.length;
}
export async function apply(ctx,config){
 if(!path.isAbsolute(config.moduleRoot)||!path.isAbsolute(config.stateRoot))throw Error('ROOT_COMPAT_NATIVE_ROOTS_REQUIRED');
 if(typeof ctx.effect!=='function')throw Error('NATIVE_SCOPED_LIFECYCLE_REQUIRED');
 const nativeFile=path.join(config.moduleRoot,'@deepseek-ai/dsh-llm-pi-ai/lib/index.js');
 if(sha(await readFile(nativeFile))!==config.expectedAdapterModuleSHA256)throw Error('ROOT_COMPAT_SDK_SOURCE_CHANGED');
 const {PiAiAdapter}=await import(pathToFileURL(nativeFile).href);
 const prepareSHA=sha(PiAiAdapter.prototype.prepareCall.toString()),streamSHA=sha(PiAiAdapter.prototype.stream.toString());
 if(prepareSHA!==config.expectedPrepareSHA256||streamSHA!==config.expectedStreamSHA256)throw Error('ROOT_COMPAT_NATIVE_METHOD_CHANGED');
 const llm=ctx.llm??ctx.get('llm'),moduleSHA256=sha(await readFile(new URL(import.meta.url)));let observed=0,legacyRootWrappersMigrated=0;
 if(config.legacyRootModule){
  if(!path.isAbsolute(config.legacyRootModule)||sha(await readFile(config.legacyRootModule))!==config.legacyRootModuleSHA256)throw Error('LEGACY_ROOT_SOURCE_NOT_QUALIFIED');
  const hasLegacy=[...llm.adapters.values()].some(r=>typeof r.adapter?.prepareCall==='function'&&typeof r.adapter?.stream==='function'&&sha(r.adapter.prepareCall.toString())===config.legacyPrepareWrapperSHA256&&sha(r.adapter.stream.toString())===config.legacyStreamWrapperSHA256);
  const agents=ctx.get?.('agents');if(hasLegacy&&agents?.list().some(a=>a.status==='running'))throw Error('LEGACY_ROOT_MIGRATION_REQUIRES_IDLE_NATIVE_AGENTS');
  legacyRootWrappersMigrated=repairLegacyRootWrappers(llm,PiAiAdapter,{prepareSHA256:config.legacyPrepareWrapperSHA256,streamSHA256:config.legacyStreamWrapperSHA256});
 }

 let collectArtifacts=null;
 if(config.currentArtifactsModule){
  if(!path.isAbsolute(config.currentArtifactsModule)||sha(await readFile(config.currentArtifactsModule))!==config.currentArtifactsModuleSHA256)throw Error('CURRENT_NATIVE_ARTIFACT_READER_SOURCE_REQUIRED');
  ({collectArtifacts}=await import(pathToFileURL(config.currentArtifactsModule).href));
 }
 const patch=installRootCompatibility(llm,{expectedPrepareSHA256:prepareSHA,expectedStreamSHA256:streamSHA,trustedArtifactsFor:async id=>{
  const session=(ctx.sessions??ctx.get?.('sessions'))?.get(id),agent=ctx.get?.('agents')?.get(id),goals=ctx.get?.('goals'),goal=agent&&goals?.get(agent);
  if(!collectArtifacts||!session||agent?.session!==session||goal?.phase!=='active'||goal.activation==='disarmed')return[];
  const root=session.cwd??session.meta?.cwd??session.header?.cwd;if(typeof root!=='string')return[];
  const data=await collectArtifacts(root,goal),latest=goals.get(agent);if(data.status!=='qualified'||latest.id!==goal.id||latest.revision!==goal.revision||latest.phase!=='active'||latest.activation==='disarmed')return[];
  const messages=session.deriveMessages().filter(m=>{const proof=qualifyTaskArtifact(m,id);return proof&&proof.taskSHA256===data.taskSHA256&&proof.goalID===goal.id&&data.artifacts.some(a=>a.status==='current'&&a.path===proof.path&&a.relativePath===proof.relativePath&&a.sourceSHA256===proof.sourceSHA256&&a.text===proof.body);});
  return {kind:'current-native-task-artifacts-v1',messages,taskSHA256:data.taskSHA256,goalID:goal.id};
 },onForward:async(options,view)=>{
  observed++;await save(path.join(config.stateRoot,'root-contract-forwarding',sha(String(options.sessionId??'unbound'))+'.json'),{
   schema:1,pid:process.pid,at:new Date().toISOString(),normalizerVersion:2,moduleSHA256,sessionID:options.sessionId??null,provider:options.provider,model:options.model,reasoningEffort:options.reasoningEffort??null,
   changed:view.changed,reason:view.reason,rootSHA256:view.rootSHA256,taskPrefixChanged:view.taskPrefixChanged,taskPrefixSHA256:view.taskPrefixSHA256,taskArtifactCount:view.taskArtifactCount,insertedNativeArtifactCount:view.insertedNativeArtifactCount,taskPrefixReason:view.taskPrefixReason,nativeSessionProvenanceUsed:view.nativeSessionProvenanceUsed,trustedArtifactCount:view.trustedArtifactCount,wireArtifactShapes:view.wireArtifactShapes,rootCharacters:view.rootCharacters,originalLeadingSystemCount:view.originalLeadingSystemCount,
   originalFrozenRequestUnchanged:true,nativeHistoryUnchanged:true,providerSelectionUnchanged:true,toolsReplayed:false,observation:observed,beforeNativeAdapterDispatch:true});
 }});
 ctx.on('llm/adapters-updated',()=>patch.sync());
 ctx.effect(()=>()=>patch.dispose());
 const added=patch.sync(true);if(!added&&patch.size===0){await save(path.join(config.stateRoot,'ROOT_ADAPTER_QUALIFICATION_FAILED.json'),{at:new Date().toISOString(),moduleSHA256,legacyRootWrappersMigrated,adapters:[...llm.adapters.values()].map(r=>({constructor:r.adapter?.constructor?.name,prepareSHA:typeof r.adapter?.prepareCall==='function'?sha(r.adapter.prepareCall.toString()):null,streamSHA:typeof r.adapter?.stream==='function'?sha(r.adapter.stream.toString()):null}))});throw Error('QUALIFIED_LIVE_PI_ADAPTER_NOT_FOUND');}
 await save(path.join(config.stateRoot,'ROOT_CONTEXT_COMPAT_READY.json'),{schema:1,pid:process.pid,at:new Date().toISOString(),moduleSHA256:sha(await readFile(new URL(import.meta.url))),loadedApplySHA256:sha(apply.toString()),normalizerSHA256:sha(preserveNativeRoot.toString()),taskPrefixFunctionSHA256:sha(stableTaskArtifactPrefix.toString()),taskArtifactViewSHA256:sha(await readFile(new URL('./task-artifact-view.mjs',import.meta.url))),stableTaskDataPrefixVersion:3,nativeSessionArtifactProvenanceVersion:2,currentNativeArtifactReaderSHA256:config.currentArtifactsModuleSHA256??null,legacyRootWrappersMigrated,scopedLifecycleCleanupVersion:1,nativeAdapterModuleSHA256:config.expectedAdapterModuleSHA256,prepareSHA256:prepareSHA,streamSHA256:streamSHA,patchedAdapters:patch.size,liveOldPreparedCallsUntouched:true,nativeAdapterEpochInvalidated:true,allNativePiProvidersModelsAndFutureRegistrations:true,modelProviderAuthPinned:false,noNewControllerOrQueue:true});
}
