import path from'node:path';import{createHash}from'node:crypto';
const sha=x=>createHash('sha256').update(x).digest('hex'),canon=x=>path.resolve(x).toLowerCase();
export function qualifyCompletedMaintenanceHold({state,binding,sessionID,root,nativePID,release,manifestSHA256}){
 if(typeof root!=='string'||!root||typeof binding?.root!=='string'||!Number.isSafeInteger(nativePID)||nativePID<1||!(/^[a-f0-9]{64}$/).test(manifestSHA256||'')||typeof release?.actors?.[sessionID]?.root!=='string')return false;
 const h=state?.clientMaintenance,g=binding?.goal,o=binding?.sourceGoal,a=release?.actors?.[sessionID];
 return !!(h?.holdNewUnsentOnly===true&&h.owner==='shared_backend_maintenance'&&typeof h.operationID==='string'&&h.operationID&&h.operationID===release?.operationID&&h.sourceManifestSHA256===manifestSHA256&&release.sourceManifestSHA256===manifestSHA256&&release.phase==='runtime_loaded_not_product_acceptance'&&release.nativePID===nativePID&&binding?.enabled&&!binding.ownerStopped&&state.enabled!==false&&!state.ownerAbort&&!state.ownerStop&&!state.accepted&&!['paused','stopped','complete','completed'].includes(o?.phase)&&g?.id===o?.id&&g?.revision===o?.revision&&sha(o?.objective||'')===g?.objectiveSHA256&&a?.goalID===g.id&&a.goalRevision===g.revision&&canon(a.root)===canon(root)&&canon(binding.root)===canon(root));
}

// Reuse the host's existing inline wait only while one owned maintenance is
// active. This is not a recurring watchdog and never sends a model/tool call.
// `resume` must remain the host's ordinary, CAS/Stop/UNKNOWN-guarded controller.
export async function reconcileMaintenanceStartup({snapshot,resume,wait,clock=Date.now,maxWaitMs=600000,intervalMs=1000}){
 if([snapshot,resume,wait,clock].some(fn=>typeof fn!=='function')||!Number.isFinite(maxWaitMs)||maxWaitMs<1||maxWaitMs>600000||!Number.isFinite(intervalMs)||intervalMs<1||intervalMs>60000)throw Error('INVALID_MAINTENANCE_STARTUP_HOST');
 const started=clock();let original;
 for(;;){
  const {state,binding,disposed}=await snapshot(),h=state?.clientMaintenance,g=binding?.goal,o=binding?.sourceGoal;
  if(disposed||state?.enabled===false||(state?.ownerStop&&state.ownerStop.active!==false)||state?.ownerAbort||state?.accepted||!binding?.enabled||binding.ownerStopped||!g?.id||g.id!==o?.id||g.revision!==o?.revision||['complete','completed','paused','stopped'].includes(o?.status)||['complete','completed','paused','stopped'].includes(o?.phase))return{resumed:false,reason:'current_owner_or_context_changed'};
  if(original&&(h?.operationID!==original.operationID||g.id!==original.goalID||g.revision!==original.goalRevision||h?.sessionID!==original.sessionID))return{resumed:false,reason:'maintenance_scope_changed'};
  if(h?.holdNewUnsentOnly!==true){await resume('native_terminal_error_reconcile_on_load');return{resumed:true,reason:original?'released':'ordinary_startup'};}
  if(h.schema!=='studio.shared-maintenance-admission/v1'||h.owner!=='shared_backend_maintenance'||typeof h.operationID!=='string'||!h.operationID||h.goalID!==g.id||h.goalRevision!==g.revision)return{resumed:false,reason:'unqualified_maintenance_preserved'};
  original??={operationID:h.operationID,goalID:g.id,goalRevision:g.revision,sessionID:h.sessionID};
  const remaining=maxWaitMs-(clock()-started);if(remaining<=0)return{resumed:false,reason:'maintenance_release_pending'};
  await wait(Math.min(intervalMs,remaining));
 }
}
