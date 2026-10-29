import{createHash}from'node:crypto';
const sha=x=>createHash('sha256').update(x).digest('hex'),mutations=new Set(['write','edit','apply_patch','studio_station_write','studio_station_edit']);
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
const digest=v=>sha(JSON.stringify(stable(v)));
export function qualifiedProgressFacts(messages,scope={}){
 const facts=[];
 for(const m of messages)for(const p of m.parts||[]){
  const s=p.state||{},a=s.input||{};if(p.type!=='tool'||s.status!=='completed')continue;
  const file=a.filePath||a.file_path||'',command=a.command||'',patch=a.patchText||a.patch||'',output=String(s.output||'').replace(/\s*<dcp-message-id>[A-Za-z0-9_-]+<\/dcp-message-id>\s*$/,'').replace(/\n\[STATION_NATIVE_RESULT[^\n]+\]\s*$/,'');let kind;
  if(mutations.has(p.tool)){
   if(/(?:PLAN|WORK|TODO|PROJECT_LOCATION)\.md$/i.test(file))continue;
   if(p.tool==='apply_patch'&&!/^\*\*\* (?:Update|Add|Delete) File: .*\.(?:[cm]?js|jsx|tsx?|py|css|sol)$/m.test(patch))continue;
   kind='completed_source_write_candidate';
  }else if(['bash','studio_station_exec'].includes(p.tool)&&/\b(?:node(?:\.exe)?\s+--test|pytest|python(?:3|\.exe)?\s+-m\s+(?:pytest|unittest)|npm\s+(?:run\s+)?(?:test|check)|tsc)\b/i.test(command))kind='actual_test_invocation';
  else if(['read','studio_station_read'].includes(p.tool)&&/\.(?:[cm]?js|jsx|tsx?|py|css|sol|sql|json|md|toml|ya?ml)$/i.test(file)&&!/(?:[/\\]\.opencode-state[/\\]|(?:PLAN|WORK|TODO|PROJECT_LOCATION)\.md$)/i.test(file))kind='new_source_observation_not_implementation';
  else if(p.tool==='studio_codegraph'){
   let x=a.arguments;try{if(typeof x==='string')x=JSON.parse(x)}catch{continue}
   if(!['search_graph','trace_path','get_code_snippet','query_graph','search_code'].includes(a.tool)||typeof x?.project!=='string')continue;
   kind='new_scoped_graph_observation_not_source_authority';
  }else continue;
  const counts=[...output.matchAll(/^# (tests|pass|fail)\s+(\d+)\s*$/gm)].map(x=>[x[1],+x[2]]),observation=kind.startsWith('new_'),sourceRead=kind==='new_source_observation_not_implementation';
  const canonicalFile=file.replaceAll('\\','/').toLowerCase(),observed=sourceRead?output.replace(/^<path>[^<]+<\/path>/,'<path>'+canonicalFile+'</path>'):output;
  // A larger requested limit returning the exact SAME Source is not new
  // evidence. Actual returned numbered spans/bytes carry range identity.
  const evidenceInput=sourceRead?{file:canonicalFile}:a;
  facts.push({callID:p.callID,tool:p.tool,path:file||null,kind,fingerprint:digest({scope,tool:p.tool,input:evidenceInput,counts,...(observation?{outputSHA256:sha(observed)}:{})}),outputSHA256:sha(output),candidateOnlyNotIntegration:true});
 }
 return facts;
}
export function terminalProgress(state,{messages,last,scope}){
 const facts=qualifiedProgressFacts(messages,scope),seen=new Set(state.observedProductiveFingerprints||[]),newFacts=facts.filter(f=>!seen.has(f.fingerprint));
 const scopeSHA256=digest(scope),text=(last.parts||[]).filter(p=>p.type==='text').map(p=>p.text||'').join('\n').trim();
 const finalSHA256=!last.info.error&&last.info.time?.completed&&text&&!(last.parts||[]).some(p=>p.type==='tool')?sha(text):null;
 const repeated=!!finalSHA256&&finalSHA256===state.lastTerminalTextSHA256&&scopeSHA256===state.terminalProgressScopeSHA256&&!newFacts.length;
 return{facts,newFacts,observedProductiveFingerprints:[...new Set([...seen,...facts.map(f=>f.fingerprint)])],terminalProgressScopeSHA256:scopeSHA256,lastTerminalTextSHA256:finalSHA256,duplicateTerminalCount:repeated?(state.duplicateTerminalCount||0)+1:0,stagnationQualified:repeated&&(state.duplicateTerminalCount||0)+1>=3,sourceReadingIsNotAutomaticallyAStall:true};
}
