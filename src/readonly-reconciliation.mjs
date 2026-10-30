const observationTools=new Set(['read','glob','grep','skill','studio_station_read','studio_station_recover','studio_codegraph','studio_peer_status','studio_shared_memory']);
export const isReconciliationObservationTool=name=>observationTools.has(name);
const bindingKeys=['actorID','sessionID','goalID','revision','inputID'];
export function projectReadonlyReconciliation(task,gate){
 if(task?.unknownTools!==true)return{task,proof:null};
 // These independent guards retain their original admission behavior.
 if(['ownerStop','liveTools','pendingPermission','unknownAdmissions'].some(k=>task[k]!==false))return{task,proof:null};
 if(gate?.schema!=='agent.native-readonly-gate/v1'||gate.executionFenceInstalled!==true||gate.localFunctionToolsOnly!==true||gate.originalObserverAvailable!==true||gate.unsettledOriginalsPreserved!==true||!bindingKeys.every(k=>task.binding?.[k]!==undefined&&task.binding[k]===gate.binding?.[k]))throw Error('UNSETTLED_ORIGINAL_REQUIRES_BOUND_READONLY_EXECUTION_GATE');
 const proof={...gate,mode:'readonly_original_reconciliation',noOriginalReplay:true,noReleaseApproval:true};
 return{task:{...task,unknownTools:false},proof};
}
