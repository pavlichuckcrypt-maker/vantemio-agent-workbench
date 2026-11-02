// Native session creation precedes enrollment; never cache an unbound no-op plugin.
export function lazyBoundHooks(schema,build,hasBinding,providerID){
 let active;
 async function bound(){
  if(!active){const promise=Promise.resolve().then(build);active=promise;try{return await promise;}catch(e){if(active===promise)active=null;throw e;}}
  return active;
 }
 const hooks={};
 for(const [name,value] of Object.entries(schema))if(typeof value==='function'&&name!=='config'&&name!=='event')hooks[name]=async(...args)=>(await bound())[name]?.(...args);
 hooks.config=schema.config;
 hooks.auth={provider:providerID,methods:[],loader:async(...args)=>({fetch:async(...request)=>{const h=await bound(),loader=await h.auth.loader(...args);return loader.fetch(...request);}})};
 hooks.tool=Object.fromEntries(Object.entries(schema.tool||{}).map(([name,definition])=>[name,{...definition,execute:async(...args)=>(await bound()).tool[name].execute(...args)}]));
 hooks.event=async event=>{if(!active&&!await hasBinding())return;return (await bound()).event?.(event);};
 return hooks;
}

/** Bind existing plugin initialization to native restoration, without creating an agent or input. */
export async function bindRestoredNativeAgent(ctx,{sessionID,install}){
 if(typeof sessionID!=='string'||!sessionID||typeof install!=='function')throw Error('EXACT_NATIVE_RESTORE_BINDING_REQUIRED');
 let live=true,initialization;
 const initialize=async payload=>{
  const agent=payload?.agent;
  if(!live||payload?.signal?.aborted||agent?.session?.id!==sessionID)return;
  if((ctx.agents??ctx.get?.('agents'))?.get(sessionID)!==agent)throw Error('EXACT_PUBLISHED_NATIVE_AGENT_REQUIRED');
  if(!initialization)initialization=Promise.resolve().then(()=>install(agent));
  return initialization;
 };
 const created=ctx.on('agent/created',initialize);
 const preStep=ctx.on('agent/pre-step',async(payload,next)=>{await initialize(payload);return next();});
 ctx.effect(()=>()=>{live=false;created?.();preStep?.();});
 const agent=(ctx.agents??ctx.get?.('agents'))?.get(sessionID);
 if(agent){await initialize({agent});return{phase:'native_agent_bound',sessionID};}
 return{phase:'awaiting_native_agent_restore',sessionID};
}
