const text=x=>typeof x==='string'&&!!x.trim();
const active=x=>['ready','planning','in_progress','review'].includes(x);
const normalize=x=>{const p=x.replaceAll('\\','/');return /^[a-z]:\//i.test(p)?p.toLowerCase():p;};
// Priority for a SOFT context target only. Source verification and hard token
// admission remain with the existing host/evidence boundary. No I/O or dispatch.
export function prioritizeCurrentTaskSources({binding,task,nativeTask,ownerStop,records,decisions}){
 if(ownerStop!==false||!binding||!text(binding.sessionID)||!text(binding.goalID)||!Number.isSafeInteger(binding.revision)||!text(task?.taskID)||task.taskID!==nativeTask?.taskID||!active(task.status)||!active(nativeTask.status)||task.goalID!==binding.goalID||nativeTask.goalID!==binding.goalID||task.goalRevision!==binding.revision||nativeTask.goalRevision!==binding.revision||!Array.isArray(records)||!Array.isArray(decisions))return[];
 const paths=new Set((Array.isArray(task.sourceHints)?task.sourceHints:[]).filter(x=>text(x)&&!/[\0*?]/.test(x)&&/\.(?:[cm]?js|jsx|tsx?|py|css|sol|sql)$/i.test(x)).map(normalize));
 const current=new Set(decisions.filter(x=>x.status==='current'&&Array.isArray(x.sourceProofIDs)&&x.sourceProofIDs.length).map(x=>x.callID));
 return[...new Set(records.filter(x=>{const r=x?.original,b=r?.binding;return r?.kind==='source-read'&&r.status==='completed'&&current.has(r.callID)&&b?.sessionID===binding.sessionID&&b.actorID===binding.actorID&&b.goalID===binding.goalID&&b.revision===binding.revision&&r.sources?.some(s=>text(s.path)&&paths.has(normalize(s.path)));}).map(x=>x.original.callID))];
}
