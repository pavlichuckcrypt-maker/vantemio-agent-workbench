import{createHash}from'node:crypto';
const sha=x=>createHash('sha256').update(x).digest('hex');
// The caller must authenticate a completed readonly result, verify its immutable
// archive, and preserve required owner instructions before using this codec.
export function presentVerifiedTextRead(original,reference,visibleRows){
 if(typeof original!=='string'||!reference?.file||!reference.callID||sha(original)!==reference.sha256||!Number.isSafeInteger(visibleRows)||visibleRows<0)return null;
 const m=original.match(/^(<path>([^<]+)<\/path>\r?\n<type>file<\/type>\r?\n<content>\r?\n)((?:\d+: [^\n]*\n)+)([\s\S]*<\/content>[\s\S]*)$/);if(!m)return null;
 const lines=m[3].slice(0,-1).split('\n'),first=Number(lines[0].match(/^\d+/)[0]);
 if(lines.length<1||lines.length>10000||!Number.isSafeInteger(first)||first<1||!Number.isSafeInteger(first+lines.length-1)||lines.some((line,i)=>Number(line.match(/^\d+/)?.[0])!==first+i))return null;
 const n=Math.min(lines.length,visibleRows);if(n===lines.length)return original;
 const head=Math.ceil(n*2/3),tail=n-head,a=first+head,b=first+lines.length-tail-1;
 const ref={kind:'verified_completed_read_presentation',originalCallID:reference.callID,originalResultFile:reference.file,sha256:reference.sha256,originalReadPath:m[2],originalReadLines:[first,first+lines.length-1],archiveSourceFirstLine:4,archiveSourceLineOffset:4-first,omittedLines:[a,b],incompleteSourcePreview:true,noReplayOrFreshCASAuthority:true};
 return JSON.stringify(ref)+'\n'+m[1]+lines.slice(0,head).join('\n')+'\n[Lines '+a+'-'+b+' are not forwarded. They remain verbatim in the verified original above. Read ONLY the needed missing range before changing or approving that code; this is NOT a complete Source review.]\n'+(tail?lines.slice(-tail).join('\n')+'\n':'')+m[4];
}
