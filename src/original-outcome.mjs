import {createHash} from 'node:crypto';

const fields = ['actorID', 'sessionID', 'goalID', 'revision', 'taskID', 'objectiveSHA256'];
const hex = value => /^[a-f0-9]{64}$/.test(value || '');
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\0\r\n]/.test(value);
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;

export const originalInputSHA256 = input => createHash('sha256').update(JSON.stringify(canonical(input))).digest('hex');

function validScope(scope) {
  return scope && fields.filter(key => !['revision', 'objectiveSHA256'].includes(key)).every(key => text(scope[key]))
    && Number.isSafeInteger(scope.revision) && scope.revision > 0 && hex(scope.objectiveSHA256);
}

function sameScope(left, right) {
  return validScope(left) && validScope(right) && fields.every(key => left[key] === right[key]);
}

function currentAllows(current, scope) {
  return current?.ownerStop === false && current.complete === false && sameScope(current.binding, scope);
}

// The host verifier is trusted code, never a model-generated flag. It must read
// and authenticate the SAME original receipt without executing the operation.
// This function performs no network, tool dispatch, claim release or retry.
export async function reconcileVerifiedOriginal({original, readCurrent, verifyOriginal, maxOutputBytes = 1048576}) {
  if (typeof readCurrent !== 'function' || typeof verifyOriginal !== 'function') throw Error('ORIGINAL_HOST_VERIFIER_REQUIRED');
  if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1) throw Error('INVALID_ORIGINAL_OUTPUT_BOUND');
  const source = structuredClone(original);
  const unresolved = reason => ({resolved: false, reason, originalRequestID: source?.requestID,
    noOperationReplay: true, noReleaseApproval: true, claimsReleased: false});
  if (!validScope(source?.binding) || !text(source.requestID) || !text(source.callID) || !text(source.tool)
      || source.input === undefined) return unresolved('invalid_original_binding');
  if (!currentAllows(await readCurrent(), source.binding)) return unresolved('current_scope_or_owner_state_changed');
  const inputSHA256 = originalInputSHA256(source.input);
  const verified = await verifyOriginal(structuredClone({...source, inputSHA256}));
  if (!currentAllows(await readCurrent(), source.binding)) return unresolved('current_scope_or_owner_state_changed');
  if (verified?.qualified !== true || verified.signatureVerified !== true || verified.originalOnly !== true
      || verified.requestID !== source.requestID || verified.callID !== source.callID || verified.tool !== source.tool
      || verified.inputSHA256 !== inputSHA256 || !sameScope(verified.binding, source.binding)
      || !text(verified.receiptID) || !hex(verified.receiptSHA256)
      || !Number.isSafeInteger(verified.originalCompletedAt) || verified.originalCompletedAt <= 0) {
    return unresolved('original_receipt_not_verified');
  }
  const outcome = verified.outcome;
  if (!outcome || outcome.executionOutcome === 'UNKNOWN' || outcome.status === 'UNKNOWN'
      || outcome.kind === 'unknown') return unresolved('original_outcome_unknown');
  const common = {resolved: true, originalRequestID: source.requestID, originalCallID: source.callID,
    binding: source.binding, inputSHA256, receiptID: verified.receiptID, receiptSHA256: verified.receiptSHA256,
    originalCompletedAt: verified.originalCompletedAt, noOperationReplay: true, noReleaseApproval: true,
    claimsReleased: false, sourceSnapshotNotFreshAuthority: true, descendantCompletionNotInferred: true};
  if (outcome.kind === 'completed') {
    if (outcome.dispatched !== true || outcome.executionClosed !== true || outcome.timedOut === true
        || !Number.isSafeInteger(outcome.exitCode) || typeof outcome.output !== 'string'
        || Buffer.byteLength(outcome.output) > maxOutputBytes) return unresolved('execution_completion_not_verified');
    return {...common, kind: outcome.exitCode === 0 ? 'known_execution_succeeded' : 'known_execution_failed',
      operationCompleted: true, exitCode: outcome.exitCode, originalOutput: outcome.output};
  }
  if (outcome.kind === 'rejected_before_execution') {
    if (outcome.dispatched !== false || typeof outcome.error !== 'string' || Buffer.byteLength(outcome.error) > maxOutputBytes) return unresolved('pre_execution_rejection_not_verified');
    return {...common, kind: 'known_rejected_before_execution', operationCompleted: false,
      operationDispatched: false, originalError: outcome.error};
  }
  if (outcome.kind === 'readonly_timeout') {
    if (outcome.dispatched !== true || outcome.readonlyQualified !== true || outcome.usableReadResult !== false
        || typeof outcome.error !== 'string' || Buffer.byteLength(outcome.error) > maxOutputBytes) return unresolved('readonly_timeout_not_qualified');
    return {...common, kind: 'known_readonly_timeout_no_result', operationCompleted: false,
      usableReadResult: false, originalError: outcome.error};
  }
  return unresolved('unsupported_original_outcome');
}
