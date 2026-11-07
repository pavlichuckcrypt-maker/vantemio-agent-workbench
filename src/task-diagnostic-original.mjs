/**
 * Pick a locator for the host's existing exact-original lookup. The locator
 * carries no outcome proof, permission, replay authority or Source authority.
 */
export function selectTaskDiagnosticOriginal({sessionID, current, messages = [], taskStart = 0, recentFailures = []} = {}) {
  const valid = value => typeof value === 'string' && /^call_[A-Za-z0-9_-]{1,100}$/u.test(value);
  if (typeof sessionID !== 'string' || !sessionID || typeof current !== 'string' ||
      !Array.isArray(messages) || !Array.isArray(recentFailures) ||
      !Number.isSafeInteger(taskStart) || taskStart < 0 ||
      !/(?:fail|error|repair|ошиб|провал|упав|сбо)/iu.test(current)) return null;

  const explicit = [...new Set(current.match(/\bcall_[A-Za-z0-9_-]{1,100}\b/gu) ?? [])];
  if (explicit.length) return explicit.length === 1 ? explicit[0] : null;

  // A later graph or shell error can displace the relevant failed test from
  // the failure tail. Prefer the exact error field the actor just requested.
  const start = Math.max(taskStart, messages.length - 48);
  for (let i = messages.length - 1; i >= start; i--) {
    const message = messages[i];
    if (message?.info?.sessionID !== sessionID || message.info.role !== 'assistant' || !Array.isArray(message.parts)) continue;
    const recovery = message.parts.findLast(part => part?.type === 'tool' &&
      part.tool === 'studio_station_recover' && part.state?.status === 'completed' &&
      part.state.input?.field === 'error' && valid(part.state.input.nativeCallID));
    if (recovery) return recovery.state.input.nativeCallID;
  }

  const recent = recentFailures.findLast(entry => entry?.tool === 'studio_station_exec' && valid(entry.callID));
  return recent?.callID ?? null;
}
