/** Preserve the native root contract across the installed legacy Context boundary. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';import path from 'node:path';import {pathToFileURL} from 'node:url';
export const name='studio-pi-root-context-compat';export const inject=['llm'];
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
export function installRootCompatibility(llm,{expectedPrepareSHA256,expectedStreamSHA256,onForward=async()=>{}}){
 if(!(llm?.adapters instanceof Map)||typeof llm.emitAdaptersUpdated!=='function')throw Error('QUALIFIED_NATIVE_LLM_REGISTRY_REQUIRED');
 const owned=new Map();let busy=false,disposed=false;
 function wrap(options,delegate){return (async function*(){const view=preserveNativeRoot(options);try{await onForward(options,view);}catch{}yield*delegate(view.options);})();}
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
export async function apply(ctx,config){
 if(!path.isAbsolute(config.moduleRoot)||!path.isAbsolute(config.stateRoot))throw Error('ROOT_COMPAT_NATIVE_ROOTS_REQUIRED');
 const nativeFile=path.join(config.moduleRoot,'@deepseek-ai/dsh-llm-pi-ai/lib/index.js');
 if(sha(await readFile(nativeFile))!==config.expectedAdapterModuleSHA256)throw Error('ROOT_COMPAT_SDK_SOURCE_CHANGED');
 const {PiAiAdapter}=await import(pathToFileURL(nativeFile).href);
 const prepareSHA=sha(PiAiAdapter.prototype.prepareCall.toString()),streamSHA=sha(PiAiAdapter.prototype.stream.toString());
 if(prepareSHA!==config.expectedPrepareSHA256||streamSHA!==config.expectedStreamSHA256)throw Error('ROOT_COMPAT_NATIVE_METHOD_CHANGED');
 const llm=ctx.llm??ctx.get('llm');let observed=0;
 const patch=installRootCompatibility(llm,{expectedPrepareSHA256:prepareSHA,expectedStreamSHA256:streamSHA,onForward:async(options,view)=>{
  observed++;await save(path.join(config.stateRoot,'root-contract-forwarding',sha(String(options.sessionId??'unbound'))+'.json'),{
   schema:1,pid:process.pid,at:new Date().toISOString(),sessionID:options.sessionId??null,provider:options.provider,model:options.model,reasoningEffort:options.reasoningEffort??null,
   changed:view.changed,reason:view.reason,rootSHA256:view.rootSHA256,rootCharacters:view.rootCharacters,originalLeadingSystemCount:view.originalLeadingSystemCount,
   originalFrozenRequestUnchanged:true,nativeHistoryUnchanged:true,providerSelectionUnchanged:true,toolsReplayed:false,observation:observed,beforeNativeAdapterDispatch:true});
 }});
 ctx.on('llm/adapters-updated',()=>patch.sync());ctx.on('dispose',()=>patch.dispose());
 const added=patch.sync(true);if(!added&&patch.size===0)throw Error('QUALIFIED_LIVE_PI_ADAPTER_NOT_FOUND');
 await save(path.join(config.stateRoot,'ROOT_CONTEXT_COMPAT_READY.json'),{schema:1,pid:process.pid,at:new Date().toISOString(),moduleSHA256:sha(await readFile(new URL(import.meta.url))),loadedApplySHA256:sha(apply.toString()),normalizerSHA256:sha(preserveNativeRoot.toString()),nativeAdapterModuleSHA256:config.expectedAdapterModuleSHA256,prepareSHA256:prepareSHA,streamSHA256:streamSHA,patchedAdapters:patch.size,liveOldPreparedCallsUntouched:true,nativeAdapterEpochInvalidated:true,allNativePiProvidersModelsAndFutureRegistrations:true,modelProviderAuthPinned:false,noNewControllerOrQueue:true});
}
