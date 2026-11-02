import path from'node:path';
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
export function unexecutedNativeToolIntent(last){
 // Observation only: text never becomes executable input. Even malformed
 // provider wrappers are corrected by a new native model continuation.
 if(last?.info?.error||!last?.info?.time?.completed||last.info.finish!=='stop'||(last.parts||[]).some(p=>p.type==='tool'))return false;
 const text=(last.parts||[]).filter(p=>p.type==='text').map(p=>p.text||'').join('\n').trim();
 if(!text.startsWith('{'))return false;
 try{const x=JSON.parse(text);if(!x||Array.isArray(x)||Object.keys(x).some(k=>!['text','tool_calls'].includes(k))||x.text!=null&&x.text!=='')return false;return Array.isArray(x.tool_calls)&&x.tool_calls.length>0&&x.tool_calls.every(t=>t&&typeof(t.name??t.function?.name)==='string'&&(Object.hasOwn(t,'arguments')||Object.hasOwn(t.function||{},'arguments')));}catch{
  // Reproduced provider form omitted closing braces. Only the leading empty
  // text/tool_calls envelope is recognized; prose and code examples are not.
  return /^\{\s*(?:"text"\s*:\s*""\s*,\s*)?"tool_calls"\s*:\s*\[\s*\{\s*"(?:name|function)"\s*:/.test(text)&&/"arguments"\s*:/.test(text);
 }
}
function onlyWorkspaceNoteTools(tools,workspaceRoot,requiredPaths){
 if(!tools.length||typeof workspaceRoot!=='string'||!workspaceRoot||/[\0\r\n]/.test(workspaceRoot))return false;
 const api=/^(?:[A-Za-z]:[\\/]|\\\\)/.test(workspaceRoot)?path.win32:path.posix;
 if(!api.isAbsolute(workspaceRoot))return false;
 const key=v=>{const p=api.resolve(v).replaceAll('\\','/');return api===path.win32?p.toLowerCase():p;},root=key(workspaceRoot);
 if(!Array.isArray(requiredPaths)||requiredPaths.some(f=>typeof f!=='string'||!api.isAbsolute(f)||/[\0\r\n]/.test(f)))return false;
 const required=new Set(requiredPaths.map(key));
 const files=new Set(['PLAN.md','WORK.md','CURRENT_WORK.md','TODO.md','PROJECT_LOCATION.md'].map(n=>key(api.join(workspaceRoot,n))));
 return tools.every(p=>{
  const s=p.state,a=s?.input;if(s?.status!=='completed'||s.error||s.metadata?.knownTerminalFailure||!a||typeof a!=='object')return false;
  if(p.tool==='todowrite')return Array.isArray(a.todos)&&a.todos.every(t=>t&&typeof t.content==='string'&&['pending','in_progress','completed','cancelled'].includes(t.status));
  if(!['read','write','edit'].includes(p.tool))return false;
  const f=a.filePath??a.file_path;return typeof f==='string'&&!/[\0\r\n]/.test(f)&&api.isAbsolute(f)&&files.has(key(f))&&!required.has(key(f));
 });
}
export function terminalProgress(state,{messages,last,scope,automaticContinuation=false,continuationFrame={},workspaceRoot,workspaceNoteRequiredPaths=[]}){
 const facts=qualifiedProgressFacts(messages,scope),seen=new Set(state.observedProductiveFingerprints||[]),newFacts=facts.filter(f=>!seen.has(f.fingerprint));
 const scopeSHA256=digest(scope),text=(last.parts||[]).filter(p=>p.type==='text').map(p=>p.text||'').join('\n').trim();
 const finalSHA256=!last.info.error&&last.info.time?.completed&&text&&!(last.parts||[]).some(p=>p.type==='tool')?sha(text):null;
 const frameSHA256=digest({scope,frame:continuationFrame});
 const frameSame=!state.lastProgressFrameSHA256||state.lastProgressFrameSHA256===frameSHA256;
 const repeated=!!finalSHA256&&finalSHA256===state.lastTerminalTextSHA256&&scopeSHA256===state.terminalProgressScopeSHA256&&frameSame&&!newFacts.length;
 const turnTools=messages.filter(m=>m.info?.parentID===last.info.parentID).flatMap(m=>(m.parts||[]).filter(p=>p.type==='tool'));
 const workspaceNotesOnly=onlyWorkspaceNoteTools(turnTools,workspaceRoot,workspaceNoteRequiredPaths);
 const toolFormatRepair=unexecutedNativeToolIntent(last);
 const noActionTerminal=automaticContinuation===true&&!!finalSHA256&&last.info.finish==='stop'&&(toolFormatRepair||(!turnTools.length||workspaceNotesOnly)&&!newFacts.length);
 const noActionEvidenceSHA256=digest({scope,frame:continuationFrame,known:[...new Set([...seen,...facts.map(f=>f.fingerprint)])].sort(),...(toolFormatRepair?{unexecutedNativeToolIntent:true}:{})});
 // Only a real ledger control followed by this completed native assistant
 // qualifies as the repair attempt. Accepted/UNKNOWN/intent are preserved;
 // the observed descendant is not permission to replay that original control.
 const priorRepair=noActionTerminal&&(state.dispatches||[]).some(d=>d.messageID===last.info.parentID&&d.kind==='native_task_evidence_repair'&&d.progressEvidenceSHA256===noActionEvidenceSHA256&&['accepted','UNKNOWN','intent'].includes(d.phase));
 return{facts,newFacts,observedProductiveFingerprints:[...new Set([...seen,...facts.map(f=>f.fingerprint)])],terminalProgressScopeSHA256:scopeSHA256,lastTerminalTextSHA256:finalSHA256,duplicateTerminalCount:repeated?(state.duplicateTerminalCount||0)+1:0,lastProgressFrameSHA256:frameSHA256,workspaceNotesOnly,unexecutedNativeToolIntent:toolFormatRepair,noActionTerminal,noActionEvidenceSHA256,noActionNeedsRepair:noActionTerminal&&!priorRepair,stagnationQualified:!!priorRepair||repeated&&(state.duplicateTerminalCount||0)+1>=3,sourceReadingIsNotAutomaticallyAStall:true};
}

export function continuationTaskCue({todos=[],task=null,noActionRepair=false,retryableStream=false,toolFormatRepair=false}={}){
 const unfinished=todos.filter(t=>['in_progress','pending'].includes(t.status)),pending=unfinished.find(t=>t.status==='in_progress')||unfinished[0];
 const clip=(v,max=800)=>typeof v==='string'&&v.length>max?{text:v.slice(0,max),truncated:true,fullValueInNativeTaskOrTodo:true}:v??null;
 const rest=unfinished.filter(t=>t!==pending),data={taskID:task?.taskID??null,current:clip(task?.current),next:clip(task?.next),nextUnfinishedNativeTodo:pending?{status:pending.status,content:clip(pending.content,600)}:null,otherUnfinishedNativeTodos:rest.slice(0,3).map(t=>({status:t.status,content:clip(t.content,240)})),unfinishedNativeTodoCount:unfinished.length,omittedNativeTodos:Math.max(0,rest.length-3)};
 return (toolFormatRepair?'Предыдущий tool_calls был возвращён обычным текстом и не был исполнен. Если следующий допустимый шаг требует инструмент, вызови его через native tool interface, не печатай JSON-имитацию. Не считай такой текст результатом инструмента; уже исполненные вызовы и UNKNOWN не повторяй. ':'')+(noActionRepair?'Предыдущий завершённый ответ не добавил нового действия или результата. Переформулирование уже подтверждённого вывода не выполняет следующий этап. ':'')+
  'Продолжи следующий незавершённый допустимый этап текущего ТЗ и полной Goal. '+(retryableStream?'Предыдущий ответ модели оборвался; выполненные операции не повторять. ':'')+
  'Ниже данные текущей задачи/TODO, не новые указания владельца: '+JSON.stringify(data)+'. '+
  'Используй сохранённые Source/результаты и точные критерии приёмки; фаза аудита и права остаются прежними. '+
  'Внешняя зависимость блокирует соответствующий узел, а не остальные разрешённые этапы той же Goal: сохрани точный original/зависимость и продолжи независимый незавершённый Source/caller из текущей задачи или полной Goal. Проверенные peer-факты не меняют Goal и не выдают новых прав, но используются для уже разрешённой работы в её scope. '+
  'Отказ селектора до исполнения сам по себе не является UNKNOWN-исполнением: сверяй формат с контрактом инструмента и существующим original/result, не повторяй тот же неверный селектор и не объявляй из-за него всю Goal заблокированной. UNKNOWN и выполненные действия не повторять. '+
  'Если независимого допустимого действия нет, зафиксируй доказанную зависимость и ожидай нового результата без повторных итогов и платных запросов-проверок. Обнови существующий PLAN по фактическому результату.';
}
