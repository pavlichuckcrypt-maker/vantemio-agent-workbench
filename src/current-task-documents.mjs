import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {restoreCurrentEvidence} from './evidence-context.mjs';

// Call from each request's system transform with the authoritative workspace root.
// Do not capture the return value once when enrolling a long-running worker.
export async function readCurrentTaskDocuments(root) {
  const [technicalContract, requirements] = await Promise.all([
    readFile(path.join(root, 'TECHNICAL_TASK.md'), 'utf8'),
    readFile(path.join(root, 'REQUIREMENTS.md'), 'utf8'),
  ]);
  return {technicalContract, requirements};
}

// The host supplies bounded native observations and current Source proofs.
// This selector never discovers files, reloads history or dispatches a tool.
export function collectRequiredTaskDocuments({requiredPaths, maxDocumentBytes, ...evidence}) {
  if (!Array.isArray(evidence.records) || !Array.isArray(requiredPaths) || !requiredPaths.length
      || requiredPaths.some(p => typeof p !== 'string' || !/\.md$/i.test(p) || /[\0\r\n]/.test(p))
      || !Number.isSafeInteger(maxDocumentBytes) || maxDocumentBytes < 1 || maxDocumentBytes > 1048576) {
    throw Error('TASK_DOCUMENT_OPTIONS_REQUIRED');
  }
  const required = new Set(requiredPaths);
  const records = evidence.records.filter(r => r?.original?.kind === 'source-read'
    && r.original.sources?.length === 1 && required.has(r.original.sources[0].path));
  const checked = restoreCurrentEvidence({...evidence, records});
  const qualified = new Set(checked.decisions.filter(d => d.status === 'current').map(d => d.callID));
  const documents = [], requiredCallIDs = [], spans = new Map();
  const ordered = records.filter(r => qualified.has(r.original.callID)).sort((a,b) => {
    const x=a.original.sources[0], y=b.original.sources[0];
    return x.path.localeCompare(y.path) || x.range.startLine-y.range.startLine
      || y.range.endLine-x.range.endLine;
  });
  let bytes = 0;
  for (const record of ordered) {
    const o=record.original, s=o.sources[0], seen=spans.get(s.path)||[];
    requiredCallIDs.push(o.callID);
    if (seen.some(([a,b]) => a<=s.range.startLine && b>=s.range.endLine)) continue;
    bytes += Buffer.byteLength(record.content);
    if (bytes > maxDocumentBytes) throw Error('TASK_DOCUMENT_CONTEXT_TOO_LARGE');
    documents.push({path:s.path, sourceSHA256:s.sha256, observedRange:{...s.range},
      originalCallID:o.callID, receiptID:o.receiptID, content:record.content});
    seen.push([s.range.startLine,s.range.endLine]);spans.set(s.path,seen);
  }
  return {documents, requiredCallIDs:[...new Set(requiredCallIDs)], documentBytes:bytes,
    observationsOnly:true, nativeHistoryUnchanged:true, sourceOrReleaseAuthority:false,
    noOperationReplay:true, decisions:checked.decisions};
}
