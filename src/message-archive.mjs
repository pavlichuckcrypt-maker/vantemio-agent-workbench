import * as fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createBoundedProofCache} from './proof-cache.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
function stamp(stat){
 if(!stat.isFile()||stat.isSymbolicLink())throw Error('LOCAL_MESSAGE_ARCHIVE_INTEGRITY');
 const precise=typeof stat.mtimeNs==='bigint'&&typeof stat.ctimeNs==='bigint';
 return {precise,key:[stat.dev,stat.ino,stat.mode,stat.size,precise?stat.mtimeNs:stat.mtimeMs,precise?stat.ctimeNs:stat.ctimeMs,stat.birthtimeNs??stat.birthtimeMs].map(String).join('|')};
}
// This stores small verified filesystem stamps, never historical message bodies.
// Eviction or a changed/missing file requires local verification, never tool replay.
export function createVerifiedMessageArchive({io=fs,maxBytes=8*1024*1024,maxEntries=32768}={}){
 const proofs=createBoundedProofCache({maxBytes,maxEntries}),inflight=new Map();
 const counts={requests:0,metadataProofHits:0,bodyVerifications:0,verifiedBodyBytes:0,archiveWrites:0,indexAppends:0,coalesced:0};
 async function archiveRecord(folder,sessionID,message){
  if(!path.isAbsolute(folder)||typeof sessionID!=='string'||!sessionID||message?.info?.sessionID!==undefined&&message.info.sessionID!==sessionID)throw Error('NATIVE_MESSAGE_SESSION_BINDING_REQUIRED');
  const raw=JSON.stringify(message);if(raw===undefined)throw Error('NATIVE_MESSAGE_JSON_REQUIRED');
  const hash=sha(raw),file=path.join(folder,hash+'.json'),ref={messageID:message?.info?.id,file,sha256:hash};counts.requests++;
  const pending=inflight.get(file);if(pending){counts.coalesced++;return {reference:await pending,serializedChars:raw.length};}
  const save=async()=>{
   let before,created=false;
   try{before=await io.lstat(file,{bigint:true});}catch(error){if(error.code!=='ENOENT')throw error;}
   if(before){const current=stamp(before),cached=proofs.get(file);if(current.precise&&cached?.sha256===hash&&cached.stamp===current.key&&String(before.size)===String(Buffer.byteLength(raw))){counts.metadataProofHits++;return ref;}}
   else{
    proofs.delete(file);
    try{await io.writeFile(file,raw,{flag:'wx',mode:0o600});created=true;counts.archiveWrites++;}catch(error){if(error.code!=='EEXIST')throw error;}
    before=await io.lstat(file,{bigint:true});
   }
   const start=stamp(before),bytes=await io.readFile(file),after=await io.lstat(file,{bigint:true}),end=stamp(after);
   counts.bodyVerifications++;counts.verifiedBodyBytes+=bytes.length;
   if(start.key!==end.key||sha(bytes)!==hash){proofs.delete(file);throw Error('LOCAL_MESSAGE_ARCHIVE_INTEGRITY');}
   if(created){await io.appendFile(path.join(folder,'index.jsonl'),JSON.stringify({sessionID,...ref})+'\n',{mode:0o600});counts.indexAppends++;}
   if(end.precise)proofs.set(file,{sha256:hash,stamp:end.key});
   return ref;
  };
  const operation=save();inflight.set(file,operation);
  try{return {reference:await operation,serializedChars:raw.length};}finally{if(inflight.get(file)===operation)inflight.delete(file);}
 }
 return {
  archiveMessage:async(...args)=>(await archiveRecord(...args)).reference,
  async archiveMessages(folder,sessionID,messages){
   if(!Array.isArray(messages))throw Error('NATIVE_MESSAGE_ARRAY_REQUIRED');
   const references=[];let serializedChars=2+Math.max(0,messages.length-1);
   // Keep index order and avoid allocating one giant serialized history string.
   for(const message of messages){const record=await archiveRecord(folder,sessionID,message);references.push(record.reference);serializedChars+=record.serializedChars;}
   return {references,serializedChars};
  },
  stats:()=>({...counts,...proofs.stats(),activeLocalWrites:inflight.size,containsHistoricalBodies:false,providerCacheHitInferred:false})
 };
}
