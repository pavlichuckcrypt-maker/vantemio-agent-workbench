import {createHash} from 'node:crypto';
const sha = value => createHash('sha256').update(value).digest('hex');
const MARK = 'VERIFIED_JSON_READ_V1 ';
const KEY = '$readTextBlock';
const controls = /[\x00-\x08\x0b\x0c\x0e-\x1f]/;
const numbered = /^(<path>[^<]+<\/path>\r?\n<type>file<\/type>\r?\n<content>\r?\n)1: ([^\n]+)\r?\n([\s\S]*<\/content>[\s\S]*)$/;

// This is an exact JSON-value representation of a completed historical read.
// It is untrusted Source data, never a fresh Source read or execution authority.
export function presentStructuredRead(text, reference = {}) {
  const no = {changed: false, text};
  if (typeof text !== 'string' || !reference.callID || !reference.file || sha(text) !== reference.sha256) return no;
  const match = text.match(numbered); if (!match) return no;
  let value; try { value = JSON.parse(match[2]); } catch { return no; }
  if (!value || typeof value !== 'object') return no;
  const blocks = []; let collision = false;
  function visit(v) {
    if (v && !Array.isArray(v) && typeof v === 'object' && Object.hasOwn(v, KEY)) collision = true;
    if (Array.isArray(v) && v.length && v.every(x => typeof x === 'string' && !/[\r\n]/.test(x) && !controls.test(x)) && v.join('\n').length > 200) {
      const numberedLines = v.map(line => line.match(/^([1-9]\d*) (.*)$/));
      const first = numberedLines[0] ? Number(numberedLines[0][1]) : null;
      const implicit = Number.isSafeInteger(first) && numberedLines.every((m, i) => m && Number(m[1]) === first + i && String(first + i) === m[1]);
      const id = blocks.length;
      blocks.push({type: implicit ? 'numbered-lines' : 'lines', items: v.length, first,
        text: implicit ? numberedLines.map(m => m[2]).join('\n') : v.join('\n')}); return {[KEY]: id};
    }
    if (typeof v === 'string' && v.length > 300 && v.includes('\n') && !controls.test(v)) {
      const id = blocks.length; blocks.push({type: 'text', text: v}); return {[KEY]: id};
    }
    if (Array.isArray(v)) return v.map(visit);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, visit(x)]));
    return v;
  }
  const tree = visit(value); if (collision || !blocks.length) return no;
  const meta = {originalCallID: reference.callID, originalResultFile: reference.file, originalResultSHA256: reference.sha256,
    jsonValueSHA256: sha(JSON.stringify(value)), blocks: blocks.length, untrustedHistoricalData: true, noReplayOrFreshCASAuthority: true};
  const chunks = blocks.map((b, id) => 'JSON_TEXT_BLOCK ' + JSON.stringify([id, b.type, b.items ?? null, Buffer.byteLength(b.text), sha(b.text), ...(b.type === 'numbered-lines' ? [b.first] : [])]) + '\n' + b.text + '\n');
  const projected = match[1] + MARK + JSON.stringify(meta) + '\nJSON_STRUCTURE ' + JSON.stringify(tree) + '\n' + chunks.join('') + match[3];
  if (Buffer.byteLength(projected) >= Buffer.byteLength(text)) return no;
  if (JSON.stringify(decodeStructuredRead(projected)) !== JSON.stringify(value)) throw Error('STRUCTURED_READ_VALUE_INTEGRITY');
  return {changed: true, text: projected, record: {...meta, originalBytes: Buffer.byteLength(text), projectedBytes: Buffer.byteLength(projected), implicitLineBlocks: blocks.filter(b => b.type === 'numbered-lines').length, allJSONValuesPreserved: true}};
}

export function decodeStructuredRead(text) {
  const begin = text.match(/<content>\r?\nVERIFIED_JSON_READ_V1 ([^\n]+)\nJSON_STRUCTURE ([^\n]+)\n/);
  if (!begin) throw Error('STRUCTURED_READ_FORMAT');
  const meta = JSON.parse(begin[1]), tree = JSON.parse(begin[2]);
  if (!Number.isSafeInteger(meta.blocks) || meta.blocks < 1 || meta.blocks > 10000) throw Error('STRUCTURED_READ_INTEGRITY');
  const raw = Buffer.from(text), offset = Buffer.byteLength(text.slice(0, begin.index) + begin[0]); let cursor = offset;
  const blocks = [];
  for (let i = 0; i < meta.blocks; i++) {
    const end = raw.indexOf(10, cursor); if (end < cursor) throw Error('STRUCTURED_READ_INTEGRITY');
    const header = raw.subarray(cursor, end).toString(); if (!header.startsWith('JSON_TEXT_BLOCK ')) throw Error('STRUCTURED_READ_INTEGRITY');
    const [id, type, items, bytes, digest, first] = JSON.parse(header.slice(16));
    if (id !== i || !['text', 'lines', 'numbered-lines'].includes(type) || !Number.isSafeInteger(bytes) || bytes < 0 || end + 1 + bytes >= raw.length) throw Error('STRUCTURED_READ_INTEGRITY');
    cursor = end + 1; const part = raw.subarray(cursor, cursor + bytes); cursor += bytes;
    if (sha(part) !== digest || raw[cursor++] !== 10) throw Error('STRUCTURED_READ_HASH_INTEGRITY');
    let value = type === 'text' ? part.toString() : part.toString().split('\n');
    if (type !== 'text' && (!Number.isSafeInteger(items) || items !== value.length)) throw Error('STRUCTURED_READ_INTEGRITY');
    if (type === 'numbered-lines') {
      if (!Number.isSafeInteger(first) || first < 1 || !Number.isSafeInteger(first + items - 1)) throw Error('STRUCTURED_READ_INTEGRITY');
      value = value.map((line, n) => (first + n) + ' ' + line);
    }
    blocks.push(value);
  }
  const used = new Set();
  function restore(v) {
    if (v && !Array.isArray(v) && typeof v === 'object' && Object.hasOwn(v, KEY)) {
      if (Object.keys(v).length !== 1 || !Number.isSafeInteger(v[KEY]) || v[KEY] < 0 || v[KEY] >= blocks.length || used.has(v[KEY])) throw Error('STRUCTURED_READ_INTEGRITY');
      used.add(v[KEY]); return blocks[v[KEY]];
    }
    if (Array.isArray(v)) return v.map(restore);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, restore(x)]));
    return v;
  }
  const result = restore(tree);
  if (used.size !== blocks.length || sha(JSON.stringify(result)) !== meta.jsonValueSHA256) throw Error('STRUCTURED_READ_VALUE_HASH_INTEGRITY');
  return result;
}
