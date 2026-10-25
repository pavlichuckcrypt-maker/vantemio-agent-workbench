export function decide(state, snapshot) {
  if (!state.enabled || state.accepted || state.ownerAbort) return {action:'none'};
  if (snapshot.busy || snapshot.pendingPermission || snapshot.liveTools || snapshot.unknownTools) return {action:'none'};
  const last = snapshot.last;
  if (!last || last.role !== 'assistant' || !last.completed) return {action:'none'};
  if (last.error) return {action:'pause',reason:'backend_or_user_abort',error:last.error};
  if (last.finish !== 'stop') return {action:'pause',reason:'unexpected_finish_'+last.finish};
  if (state.lastDispatchedFrom === last.id) return {action:'none'};
  if (snapshot.noProgress >= 3) return {action:'pause',reason:'three_continuations_without_source_or_evidence_change'};
  return {action:'continue',from:last.id};
}

