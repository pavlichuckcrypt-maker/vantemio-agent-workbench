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
