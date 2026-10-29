import{createHash}from'node:crypto';
const hash=x=>createHash('sha256').update(x).digest('hex');
function numbered(text){
 const m=text.match(/^(<path>([^<]+)<\/path>\r?\n<type>file<\/type>\r?\n<content>\r?\n)((?:\d+: [^\n]*\n)+)([\s\S]*<\/content>[\s\S]*)$/);if(!m)return null;
 const lines=m[3].slice(0,-1).split('\n'),first=Number(lines[0].match(/^\d+/)[0]);
 if(lines.length<32||lines.length>10000||!Number.isSafeInteger(first)||first<1||lines.some((l,i)=>Number(l.match(/^\d+/)?.[0])!==first+i))return null;
 return{prefix:m[1],file:m[2],lines,first,suffix:m[4]};
}
// This is a presentation of a verified completed READ, never a substitute
// Source or an operation retry. Omitted lines remain explicit and retrievable.
export function formatReadPreview(original,{file,sha256,callID},visibleRows){
 if(typeof original!=='string'||typeof file!=='string'||!file||/[\r\n\0]/.test(file)||!(/^[a-f0-9]{64}$/).test(sha256||'')||hash(original)!==sha256)throw Error('ORIGINAL_READ_DIGEST_REQUIRED');
 if(typeof callID!=='string'||!callID||!Number.isSafeInteger(visibleRows)||visibleRows<0)throw Error('INVALID_READ_PREVIEW');
 const parsed=numbered(original);if(!parsed)return null;
 const n=Math.max(0,Math.min(parsed.lines.length,visibleRows)),head=Math.ceil(n*2/3),tail=n-head;
 if(n>=parsed.lines.length)return original;
 const a=parsed.first+head,b=parsed.first+parsed.lines.length-tail-1;
 const ref={kind:'archived_completed_read_preview',originalCallID:callID,originalResultFile:file,sha256,originalReadPath:parsed.file,originalReadLines:[parsed.first,parsed.first+parsed.lines.length-1],archiveSourceFirstLine:4,archiveSourceLineOffset:4-parsed.first,omittedLines:[a,b],incompleteSourcePreview:true,noReplayOrFreshCASAuthority:true};
 return JSON.stringify(ref)+'\n'+parsed.prefix+parsed.lines.slice(0,head).join('\n')+'\n[Lines '+a+'-'+b+' are not forwarded. They remain verbatim in the verified original above. Read ONLY the needed missing range before changing or approving that code; this is NOT a complete Source review.]\n'+(tail?parsed.lines.slice(-tail).join('\n')+'\n':'')+parsed.suffix;
}
