import path from'node:path';import{createHash}from'node:crypto';
const sha=x=>createHash('sha256').update(x).digest('hex'),canon=x=>path.resolve(x).toLowerCase();
export function qualifyCompletedMaintenanceHold({state,binding,sessionID,root,nativePID,release,manifestSHA256}){
 if(typeof root!=='string'||!root||typeof binding?.root!=='string'||!Number.isSafeInteger(nativePID)||nativePID<1||!(/^[a-f0-9]{64}$/).test(manifestSHA256||'')||typeof release?.actors?.[sessionID]?.root!=='string')return false;
 const h=state?.clientMaintenance,g=binding?.goal,o=binding?.sourceGoal,a=release?.actors?.[sessionID];
 return !!(h?.holdNewUnsentOnly===true&&h.owner==='shared_backend_maintenance'&&typeof h.operationID==='string'&&h.operationID&&h.operationID===release?.operationID&&h.sourceManifestSHA256===manifestSHA256&&release.sourceManifestSHA256===manifestSHA256&&release.phase==='runtime_loaded_not_product_acceptance'&&release.nativePID===nativePID&&binding?.enabled&&!binding.ownerStopped&&state.enabled!==false&&!state.ownerAbort&&!state.ownerStop&&!state.accepted&&!['paused','stopped','complete','completed'].includes(o?.phase)&&g?.id===o?.id&&g?.revision===o?.revision&&sha(o?.objective||'')===g?.objectiveSHA256&&a?.goalID===g.id&&a.goalRevision===g.revision&&canon(a.root)===canon(root)&&canon(binding.root)===canon(root));
}
