// A single pass over native Chat Completions/Responses SSE. Never changes model bytes.
export function observeUsageStream(response,{onUsage,onObserverError=()=>{}}={}) {
  if (typeof onUsage!=='function'||typeof onObserverError!=='function') throw Error('USAGE_STREAM_CALLBACK_REQUIRED');
  if (!response.body||response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='text/event-stream') return response;
  const decoder=new TextDecoder();
  let buffer='',completed=false,failed=false,pending=null,lastConfirmed=null;
  async function emit(row,done) {
    const identity=JSON.stringify([row.responseID,row.usage,done]);
    if (done&&identity===lastConfirmed) return;
    if (done) lastConfirmed=identity;
    try {await onUsage(structuredClone(row),done);} catch (error) {
      // Derivative accounting must not convert a delivered provider response into a failed generation.
      try {await onObserverError(error);} catch {}
    }
  }
  async function capture(line) {
    if (!line.startsWith('data:')) return;
    const raw=line.slice(5).trim();
    if (!raw) return;
    if (raw==='[DONE]') {completed=!failed;if(pending&&!failed)await emit(pending,true);return;}
    let data;
    try {data=JSON.parse(raw);} catch {return;}
    if (!data || typeof data!=='object' || Array.isArray(data)) return;
    if (data.type==='response.failed'||data.error) {failed=true;completed=false;pending=null;return;}
    if (!failed&&(data.type==='response.completed'||(Array.isArray(data.choices)&&data.choices.some(x=>['stop','tool_calls','length'].includes(x?.finish_reason))))) completed=true;
    const usage=data.response?.usage||data.usage;
    if (!usage) return;
    pending={usage,eventType:data.type||null,model:data.response?.model||data.model||null,responseID:data.response?.id||data.id||null};
    await emit(pending,completed);
  }
  const stream=response.body.pipeThrough(new TransformStream({
    async transform(chunk,controller) {
      controller.enqueue(chunk);
      buffer+=decoder.decode(chunk,{stream:true});
      let end;
      while ((end=buffer.indexOf('\n'))>=0) {
        const line=buffer.slice(0,end).replace(/\r$/,'');buffer=buffer.slice(end+1);await capture(line);
      }
      if (buffer.length>1048576) buffer=''; // Bound observer state only; all original bytes were forwarded.
    },
    async flush() {buffer+=decoder.decode();if(buffer)await capture(buffer);},
  }));
  return new Response(stream,{status:response.status,statusText:response.statusText,headers:response.headers});
}
