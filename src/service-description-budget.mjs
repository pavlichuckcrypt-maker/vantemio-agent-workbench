import {createHash} from 'node:crypto';
const sha=x=>createHash('sha256').update(x).digest('hex');
const digest=x=>sha(JSON.stringify(x));
const validName=x=>typeof x==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(x);
function brief(text){
  if(text.length<=120)return text;
  const first=text.split(/(?<=[.!?])\s+/)[0];
  if(first.length<=120)return first;
  return first.slice(0,120).replace(/\s+\S*$/,'');
}
function catalogText(text){
  if(typeof text!=='string'||!/^You are OpenCode\b/.test(text))return{value:text,names:[],changed:false,originals:[]};
  const names=[];let changed=false;const originals=[];
  const value=text.replace(/<available_skills>([\s\S]*?)<\/available_skills>/g,(all,inner)=>{
    let entries,render;
    if(inner.trim().startsWith('[')){
      try{entries=JSON.parse(inner);}catch{return all;}
      if(!Array.isArray(entries)||!entries.length||entries.some(e=>!e||!validName(e.name)||typeof e.description!=='string'||Object.keys(e).some(k=>!['name','description','location'].includes(k))))return all;
      render=rows=>'<available_skills>'+JSON.stringify(rows)+'</available_skills>';
    }else{
      const re=/<skill>([\s\S]*?)<\/skill>/g;
      const fragments=[...inner.matchAll(re)];if(!fragments.length||inner.replace(re,'').trim())return all;
      const matches=fragments.map(m=>m[1].match(/^\s*<name>([^<]+)<\/name>\s*<description>([\s\S]*?)<\/description>\s*$/));
      if(matches.some(m=>!m||m[2].includes('</description>')))return all;
      entries=matches.map(m=>({name:m[1],description:m[2]}));if(entries.some(e=>!validName(e.name)))return all;
      render=rows=>'<available_skills>'+rows.map(e=>'<skill><name>'+e.name+'</name><description>'+e.description+'</description></skill>').join('')+'</available_skills>';
    }
    if(new Set(entries.map(e=>e.name)).size!==entries.length)return all;
    names.push(...entries.map(e=>e.name));const shorter=entries.map(e=>({...e,description:brief(e.description)}));
    if(shorter.every((e,i)=>e.description===entries[i].description))return all;
    const projected=render(shorter);if(Buffer.byteLength(projected)>=Buffer.byteLength(all))return all;
    originals.push({original:all,projected,originalSHA256:sha(all),projectedSHA256:sha(projected)});changed=true;return projected;
  });return{value,names,changed,originals};
}
function schemaWithoutHelp(schema){
  if(!schema||typeof schema!=='object'||Array.isArray(schema))return schema;
  const out={...schema};for(const key of ['$schema','description','title','examples'])delete out[key];
  for(const key of ['properties','patternProperties','$defs','definitions','dependentSchemas'])if(out[key]&&typeof out[key]==='object')out[key]=Object.fromEntries(Object.entries(out[key]).map(([k,v])=>[k,schemaWithoutHelp(v)]));
  for(const key of ['items','additionalItems','contains','additionalProperties','not','propertyNames','if','then','else','unevaluatedProperties','unevaluatedItems'])if(out[key]&&typeof out[key]==='object'&&!Array.isArray(out[key]))out[key]=schemaWithoutHelp(out[key]);
  for(const key of ['allOf','anyOf','oneOf','prefixItems'])if(Array.isArray(out[key]))out[key]=out[key].map(schemaWithoutHelp);
  return out;
}
// Only exact, caller-qualified service metadata is shortened. Full descriptors
// remain in a hash-bound on-demand archive; installed skills and native schemas
// are unchanged. This is not a Source/task/instruction summarizer.
export function compactServiceDescriptions(body,{knownDescriptions=[],compactQualifiedSchemas=false}={}){
  const copy=structuredClone(body),archive={schema:'agent-service-descriptions/v1',originalBodySHA256:digest(body),tools:[],catalogs:[]},names=[];
  const known=new Map(knownDescriptions.map(x=>[x.name,x]));
  for(let i=0;i<(copy.tools||[]).length;i++){
    const f=copy.tools[i].function||copy.tools[i],k=known.get(f.name);
    if(!k||typeof f.description!=='string'||sha(f.description)!==k.sha256||typeof k.summary!=='string'||!k.summary.trim()||k.summary.length>=f.description.length)continue;
    const item={index:i,original:f.description,projected:k.summary,originalSHA256:sha(f.description),projectedSHA256:sha(k.summary)};
    if(compactQualifiedSchemas&&typeof k.parametersSHA256==='string'&&f.parameters&&typeof f.parameters==='object'&&k.parametersSHA256===digest(f.parameters)){const parameters=schemaWithoutHelp(f.parameters);if(digest(parameters)!==digest(f.parameters)){item.originalParameters=f.parameters;item.originalParametersSHA256=digest(f.parameters);item.projectedParametersSHA256=digest(parameters);f.parameters=parameters;}}
    archive.tools.push(item);f.description=k.summary;
  }
  for(const field of ['instructions','system'])if(typeof copy[field]==='string'){
    const r=catalogText(copy[field]);names.push(...r.names);if(r.changed){copy[field]=r.value;archive.catalogs.push(...r.originals.map(x=>({...x,path:[field]})));}
  }
  for(const field of ['messages','input'])for(let i=0;i<(copy[field]||[]).length;i++){
    const m=copy[field][i];if(!['system','developer'].includes(m.role))continue;
    const parts=typeof m.content==='string'?[{text:m.content}]:m.content;if(!Array.isArray(parts))continue;
    for(let j=0;j<parts.length;j++){
      if(typeof parts[j]?.text!=='string')continue;const r=catalogText(parts[j].text);names.push(...r.names);
      if(!r.changed)continue;parts[j].text=r.value;
      archive.catalogs.push(...r.originals.map(x=>({...x,path:[field,i,'content',...(typeof m.content==='string'?[]:[j,'text'])]})));
    }if(typeof m.content==='string')m.content=parts[0].text;
  }
  archive.projectedBodySHA256=digest(copy);const changed=archive.originalBodySHA256!==archive.projectedBodySHA256;
  return{changed,body:changed?copy:body,archive,record:{version:1,changed,skillNames:[...new Set(names)],toolDescriptionsDeferred:archive.tools.length,skillCatalogsDeferred:archive.catalogs.length,fullOriginalDescriptorsPreserved: true,toolValidationAndSourceUnchanged:true,fullNativeHelpInArchive:true}};
}
export function restoreServiceDescriptions(body,archive){
  const fail=()=>{throw Error('SERVICE_DESCRIPTION_INTEGRITY');};
  if(archive?.schema!=='agent-service-descriptions/v1'||digest(body)!==archive.projectedBodySHA256)fail();const copy=structuredClone(body);
  for(const x of archive.tools){const f=copy.tools?.[x.index]?.function||copy.tools?.[x.index];if(!f||sha(f.description)!==x.projectedSHA256||sha(x.original)!==x.originalSHA256)fail();f.description=x.original;if(x.originalParameters){if(digest(f.parameters)!==x.projectedParametersSHA256||digest(x.originalParameters)!==x.originalParametersSHA256)fail();f.parameters=x.originalParameters;}}
  for(const x of archive.catalogs){let parent=copy;for(const key of x.path.slice(0,-1))parent=parent?.[key];const key=x.path.at(-1);if(typeof parent?.[key]!=='string'||sha(x.original)!==x.originalSHA256||sha(x.projected)!==x.projectedSHA256||parent[key].split(x.projected).length!==2)fail();parent[key]=parent[key].replace(x.projected,x.original);}
  if(digest(copy)!==archive.originalBodySHA256)fail();return copy;
}
