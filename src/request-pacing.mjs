import {readFile,writeFile,mkdir}from'node:fs/promises';import path from'node:path';import{randomUUID}from'node:crypto';
const locks=new Map();
async function serialized(key,fn){const prior=locks.get(key)||Promise.resolve();let release;const held=new Promise(r=>release=r);locks.set(key,held);await prior;try{return await fn();}finally{release();if(locks.get(key)===held)locks.delete(key);}}
async function load(file,fallback){try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
export function nextAllowedAt(state,sid,now,actorIntervalMs,globalGapMs){return Math.max(now,(state.actors?.[sid]?.lastDispatchAt||0)+actorIntervalMs,(state.lastDispatchAt||0)+globalGapMs);}
async function wait(ms,signal){if(signal?.aborted)throw signal.reason;await new Promise((resolve,reject)=>{const timer=setTimeout(done,ms);function done(){signal?.removeEventListener('abort',stop);resolve();}function stop(){clearTimeout(timer);signal?.removeEventListener('abort',stop);reject(signal.reason);}signal?.addEventListener('abort',stop,{once:true});});}
export async function pacedFetch({root,sessionID,profileRoot,requestID=randomUUID(),dispatch=fetch},input,init={}){
 const cfg=await load(path.join(profileRoot,'REQUEST_EFFICIENCY_POLICY.json'),{actorIntervalMs:60000,globalGapMs:15000});
 const actorIntervalMs=Math.max(1000,Number(cfg.actorIntervalMs)||60000),globalGapMs=Math.max(0,Number(cfg.globalGapMs)||15000);
 const file=path.join(profileRoot,'request-pacing-state.json'),observation=path.join(root,'.opencode-state/request-wire/request-pacing-current.json'),signal=init.signal;
 await mkdir(path.dirname(observation),{recursive:true});
 for(;;){
  if(signal?.aborted)throw signal.reason;
  const result=await serialized(file,async()=>{
   const state=await load(file,{actors:{}}),now=Date.now(),at=nextAllowedAt(state,sessionID,now,actorIntervalMs,globalGapMs);
   if(at>now)return{waitMs:at-now,at};
   state.actors??={};state.actors[sessionID]={lastDispatchAt:now,requestID};state.lastDispatchAt=now;
   await writeFile(file,JSON.stringify(state),{mode:0o600});return{at:now,waitMs:0};
  });
  await writeFile(observation,JSON.stringify({requestID,sessionID,phase:result.waitMs?'waiting_unsent':'dispatching_original_request',nextAllowedAt:result.at,actorIntervalMs,globalGapMs,noTimerOrBackgroundQueue:true}),{mode:0o600});
  if(!result.waitMs)break;
  // Inline wait for this already active request; cancellation sends no API call.
  await wait(Math.min(result.waitMs,1000),signal);
 }
 return dispatch(input,init);
}
