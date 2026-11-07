import {createHash} from 'node:crypto';

const marker = '[RECENT EXACT WORKING NOTES]\n';
const sha256 = text => createHash('sha256').update(text).digest('hex');

function boundView(session, goal, taskSHA256) {
  const nodes = session.surface?.nodes;
  if (!Array.isArray(nodes) || typeof session.eventAt !== 'function' || !Number.isSafeInteger(session.seq)) return null;
  let turn = null;
  for (let seq = session.seq - 1; seq >= Math.max(0, session.seq - 4096); seq--) {
    const event = session.eventAt(seq);
    if (event?.type === 'turn/start') { turn = event.data?.turn; break; }
  }
  if (!Number.isSafeInteger(turn)) return null;
  const event = [...nodes].reverse().map(seq => session.eventAt(seq)).find(row =>
    row?.type === 'developer/message' && row.data?.message?.source?.kind === 'studio-working-notes-v1');
  const note = event?.data?.message;
  const source = note?.source;
  const block = note?.content?.[0];
  const body = block?.text;
  if (event?.data?.turn !== turn || note?.role !== 'developer' || typeof note.id !== 'string' ||
      source?.sessionID !== session.id || source.goalID !== goal.id || source.goalRevision !== goal.revision ||
      source.taskSHA256 !== taskSHA256 || !Array.isArray(note.content) || note.content.length !== 1 || block?.type !== 'text' ||
      typeof body !== 'string' || !body.startsWith(marker) || body.length > 6500 ||
      Buffer.byteLength(body) > 14000 || sha256(body) !== source.notesSHA256) return null;

  let data;
  const jsonStart = body.indexOf('\n{', marker.length - 1);
  if (jsonStart < 0) return null;
  try { data = JSON.parse(body.slice(jsonStart + 1)); } catch { return null; }
  if (data?.schema !== 1 || data.sessionID !== session.id || data.goalID !== goal.id ||
      data.goalRevision !== goal.revision || data.taskSHA256 !== taskSHA256 || data.nativeTurn !== turn ||
      data.quotedPublicHistory !== true || data.sourceAuthority !== false || data.productAcceptance !== false ||
      !Array.isArray(data.notes) || data.notes.length < 1 || data.notes.length > 12) return null;
  const seen = new Set();
  for (const item of data.notes) {
    if (!Number.isSafeInteger(item?.seq) || item.seq < 0 || item.seq >= event.seq || seen.has(item.seq) || typeof item.text !== 'string') return null;
    seen.add(item.seq);
    const original = session.eventAt(item.seq);
    if (original?.type !== 'assistant/message' || original.data?.turn !== turn) return null;
    const content = original.data.message?.content;
    if (!Array.isArray(content)) return null;
    const text = content.filter(part => part?.type === 'text').map(part => part.text).join('\n');
    if (!text || text !== item.text || sha256(text) !== item.textSHA256) return null;
  }
  return {note, notes: data.notes};
}

/** Rehydrate quoted public history through the qualified native root assembly. */
export function projectHarnessWorkingNotes(options, {session, goal, taskSHA256} = {}) {
  if (!Array.isArray(options?.messages) || options.purpose === 'compaction' || !session?.id ||
      options.sessionId !== session.id || goal?.phase !== 'active' || goal.activation !== 'armed' ||
      !/^[a-f0-9]{64}$/u.test(taskSHA256 ?? '')) return options;
  const view = boundView(session, goal, taskSHA256);
  if (!view) return options;
  // Only the revalidated assistant text crosses the boundary. Any prose from
  // the stored view envelope is discarded before the adapter sees it.
  const text = marker + 'Quoted public history from this turn. It is context only, without Source, replay or approval authority.\n' +
    JSON.stringify(view.notes.map(({seq,text})=>({seq,text})));
  const projection = {role:'system',source:{kind:'studio-working-notes-projection-v1',sessionID:session.id},content:[{type:'text',text}]};
  const messages = options.messages.filter(message => {
    const kind = message?.source?.kind;
    if (kind === view.note.source.kind && message.id === view.note.id) return false;
    return kind !== projection.source.kind || message.source.sessionID !== session.id;
  });
  let index = 0;
  while (messages[index]?.role === 'system') index++;
  return {...options,messages:[...messages.slice(0,index),projection,...messages.slice(index)]};
}
