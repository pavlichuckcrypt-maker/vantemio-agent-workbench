// Local workflow accounting, not a production queue or a model retry loop.
export function nextAttempt(state, {operationID, sourceSHA256, autonomousChangedCandidate=false}) {
  if (state.operations?.[operationID]) {const original=state.operations[operationID];if(original.sourceSHA256!==sourceSHA256)return{action:'conflict',reason:'original_operation_source_payload_changed',result:original};return {action:'original', result:original};}
  if (Object.values(state.operations||{}).some(r=>r.status==='UNKNOWN')) return {action:'hold', reason:'reconcile_original_unknown'};
  if (state.failures >= 3 && !autonomousChangedCandidate) return {action:'arbitration', reason:'three_failed_candidates'};
  if (Object.values(state.operations||{}).some(r=>r.status==='FAIL'&&r.sourceSHA256===sourceSHA256)) return {action:'hold', reason:'unchanged_failed_source'};
  return {action:'run'};
}
export function finishAttempt(state, {operationID,sourceSHA256,status,exitCode,receipt,autonomousChangedCandidate=false}) {
  const prior=state.operations?.[operationID];
  if(prior && prior.sourceSHA256!==sourceSHA256)throw Error('ORIGINAL_SOURCE_CONFLICT');
  if(!['UNKNOWN','PASS','FAIL'].includes(status))throw Error('INVALID_OUTCOME');
  if(prior && prior.status!=='UNKNOWN') return state;
  const operations={...state.operations,[operationID]:{sourceSHA256,status,exitCode,receipt}};
  if(status==='UNKNOWN') return {...state,operations};
  if(status==='PASS') return {...state,operations,failures:0,lastFailedSHA256:null,status:'tests_passed_not_integrated'};
  const failures=(state.failures||0)+1;
  return {...state,operations,failures,lastFailedSHA256:sourceSHA256,status:failures>=3&&!autonomousChangedCandidate?'sol_arbitration_required':'repair_required'};
}
