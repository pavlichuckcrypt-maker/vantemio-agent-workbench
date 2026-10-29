import {prioritizeCurrentTaskSources} from './task-source-priority.mjs';
import {createHash} from 'node:crypto';

const sha = value => createHash('sha256').update(value).digest('hex');
const text = value => typeof value === 'string' && value.trim() && !value.includes('\0');
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function binding(value) {
  if (!value || !['actorID','sessionID','goalID','inputID'].every(k => text(value[k])) ||
      !Number.isSafeInteger(value.revision) || value.revision < 0) throw Error('EVIDENCE_INVALID_BINDING');
  return Object.fromEntries(['actorID','sessionID','goalID','revision','inputID'].map(k => [k,value[k]]));
}

function sameTask(a, b) {
  return ['actorID','sessionID','goalID','revision'].every(k => a[k] === b[k]);
}

function invocation(call) {
  if (!text(call?.id) || call.type !== 'function' || !text(call.function?.name) ||
      typeof call.function.arguments !== 'string') throw Error('EVIDENCE_INVALID_TOOL_CALL');
  return {callID:call.id, invocationSHA256:sha(JSON.stringify([call.function.name,call.function.arguments]))};
}

function sourceBinding(source) {
  if (!text(source?.path) || !digest(source.sha256)) throw Error('EVIDENCE_INVALID_SOURCE');
  const out = {path:source.path, sha256:source.sha256};
  if (source.range !== undefined) {
    const {startLine,endLine} = source.range ?? {};
    if (!Number.isSafeInteger(startLine) || startLine < 1 ||
        !Number.isSafeInteger(endLine) || endLine < startLine) throw Error('EVIDENCE_INVALID_RANGE');
    out.range = {startLine,endLine};
  }
  return out;
}

function original(value) {
  if (!text(value?.receiptID) || !text(value.callID) || !digest(value.invocationSHA256) ||
      !digest(value.contentSHA256) || !['source-read','tool-result'].includes(value.kind) ||
      !['completed','error','UNKNOWN','pending','running'].includes(value.status) ||
      !Array.isArray(value.sources) || !value.sources.length) throw Error('EVIDENCE_INVALID_ORIGINAL');
  const sources = value.sources.map(sourceBinding);
  if (value.kind === 'source-read' && (sources.length !== 1 || !sources[0].range)) {
    throw Error('EVIDENCE_INVALID_READ_SOURCES');
  }
  if (new Set(sources.map(s => s.path)).size !== sources.length) throw Error('EVIDENCE_DUPLICATE_BOUND_SOURCE');
  return {binding:binding(value.binding), receiptID:value.receiptID, callID:value.callID,
    invocationSHA256:value.invocationSHA256, kind:value.kind, status:value.status,
    contentSHA256:value.contentSHA256, sources};
}

export function captureToolResultEvidence({binding:scope, toolCall, receiptID, content, status, sources}) {
  if (typeof content !== 'string') throw Error('EVIDENCE_INVALID_CONTENT');
  return {original:original({binding:scope, ...invocation(toolCall), receiptID,
    kind:'tool-result', status, contentSHA256:sha(content), sources}), content};
}

// The existing read adapter supplies bytes it actually read. This function opens no path.
export function captureSourceReadEvidence({binding:scope, toolCall, receiptID, sourcePath, sourceBytes, range}) {
  if (!(sourceBytes instanceof Uint8Array)) throw Error('EVIDENCE_SOURCE_BYTES_REQUIRED');
  const bytes = Buffer.from(sourceBytes);
  const source = sourceBinding({path:sourcePath, sha256:sha(bytes), range});
  if (!source.range) throw Error('EVIDENCE_INVALID_RANGE');
  const decoded = new TextDecoder('utf-8', {fatal:true, ignoreBOM:true}).decode(bytes);
  if (decoded.includes('\0')) throw Error('EVIDENCE_BINARY_SOURCE');
  // One-based inclusive lines; preserve actual CRLF/LF terminators and raw-byte file SHA.
  const lines = decoded.split(/(?<=\n)/u);
  if (source.range.endLine > lines.length) throw Error('EVIDENCE_RANGE_OUT_OF_BOUNDS');
  const content = lines.slice(source.range.startLine - 1, source.range.endLine).join('');
  const result = captureToolResultEvidence({binding:scope, toolCall, receiptID, content,
    status:'completed', sources:[source]});
  result.original.kind = 'source-read';
  return result;
}

// Projection only: never writes native history, reads Source, dispatches or retries a tool.
export function restoreCurrentEvidence({binding:scope, ownerStop, records, originalResults,
  currentSources, messages, maxEvidenceBytes, task, nativeTask}) {
  const current = binding(scope);
  if (typeof ownerStop !== 'boolean') throw Error('EVIDENCE_STOP_STATE_REQUIRED');
  if (ownerStop) throw Error('EVIDENCE_OWNER_STOP');
  if (![records,originalResults,currentSources,messages].every(Array.isArray) ||
      !Number.isSafeInteger(maxEvidenceBytes) || maxEvidenceBytes < 1 || maxEvidenceBytes > 1048576) {
    throw Error('EVIDENCE_INVALID_OPTIONS');
  }
  const originals = new Map(), versions = new Map(), selected = new Map();
  for (const result of originalResults) {
    const value = original(result);
    if (originals.has(value.callID)) throw Error('EVIDENCE_DUPLICATE_ORIGINAL');
    originals.set(value.callID,value);
  }
  for (const proof of currentSources) {
    const source = sourceBinding(proof);
    if (!text(proof.proofID) || !same(binding(proof.binding), current)) throw Error('EVIDENCE_INVALID_CURRENT_PROOF');
    if (versions.has(source.path)) throw Error('EVIDENCE_DUPLICATE_SOURCE_PROOF');
    versions.set(source.path,{...source,proofID:proof.proofID});
  }
  for (const record of records) {
    const value = {original:original(record?.original), content:record?.content};
    if (typeof value.content !== 'string') throw Error('EVIDENCE_INVALID_CONTENT');
    const prior = selected.get(value.original.callID);
    if (prior && !same(prior,value)) throw Error('EVIDENCE_ORIGINAL_CONFLICT');
    selected.set(value.original.callID,value);
  }
  const calls = new Map(), outputs = new Map();
  for (let i=0; i<messages.length; i++) {
    const m = messages[i];
    if (m?.role === 'assistant') for (const call of m.tool_calls ?? []) {
      const value = invocation(call);
      if (calls.has(value.callID)) throw Error('EVIDENCE_DUPLICATE_TOOL_CALL');
      calls.set(value.callID,{...value,index:i});
    }
    if (m?.role === 'tool') {
      if (!text(m.tool_call_id) || outputs.has(m.tool_call_id)) throw Error('EVIDENCE_DUPLICATE_TOOL_OUTPUT');
      outputs.set(m.tool_call_id,i);
    }
  }
  const decisions = [], replacements = new Map();
  let bytes = 0;
  for (const [callID, record] of selected) {
    const r = record.original, native = originals.get(callID), call = calls.get(callID), at = outputs.get(callID);
    let reason;
    if (!sameTask(r.binding,current)) reason = 'different_task';
    else if (!native || !same(r,native)) reason = 'original_result_changed_or_missing';
    else if (r.status !== 'completed') reason = 'original_not_completed';
    else if (sha(record.content) !== r.contentSHA256) reason = 'content_digest_mismatch';
    else if (!call || at === undefined || call.index >= at) reason = 'original_message_missing';
    else if (call.invocationSHA256 !== r.invocationSHA256) reason = 'original_invocation_changed';
    else if (r.sources.some(s => !versions.has(s.path))) reason = 'current_source_unknown';
    else if (r.sources.some(s => versions.get(s.path).sha256 !== s.sha256)) reason = 'source_changed';
    if (reason) { decisions.push({callID,status:'historical_only',reason}); continue; }
    bytes += Buffer.byteLength(record.content, 'utf8');
    if (bytes > maxEvidenceBytes) throw Error('EVIDENCE_CONTEXT_TOO_LARGE');
    replacements.set(at,record.content);
    decisions.push({callID,status:'current',receiptID:r.receiptID,originInputID:r.binding.inputID,
      sourceProofIDs:r.sources.map(s => versions.get(s.path).proofID)});
  }
  const projected = structuredClone(messages);
  for (const [at, content] of replacements) projected[at].content = content;
  return {messages:projected, decisions, evidenceBytes:bytes,
    taskSourcePriorityCallIDs:prioritizeCurrentTaskSources({binding:current,task,nativeTask,ownerStop,records,decisions})};
}
