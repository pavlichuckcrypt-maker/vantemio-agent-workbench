/** Pure validation of this client's already-developer task-data view; no filesystem or authority grant. */
import{createHash}from'node:crypto';
const sha=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export function qualifyTaskArtifact(message,sessionID){
 const s=message?.source,c=message?.content;
 if(message?.role!=='developer'||s?.kind!=='studio-current-task-artifact-v1'||(s.artifactState!==undefined&&s.artifactState!=='current')||typeof sessionID!=='string'||!sessionID||!digest(s.taskSHA256)||!digest(s.sourceSHA256)||!(s.goalID===null||typeof s.goalID==='string')||typeof s.relativePath!=='string'||typeof s.path!=='string'||!s.path)return null;
 if(/^(?:[/\\]|[a-z]:)/i.test(s.relativePath)||!/\.(?:md|json)$/iu.test(s.relativePath)||s.relativePath.split(/[/\\]/).some(x=>x==='..'||x==='')||/(?:^|[/\\])(?:\.env|[^/\\]*(?:credential|secret|auth|connection\.private)[^/\\]*)(?:$|[/\\])/iu.test(s.relativePath))return null;
 if(s.artifactID!==sha([sessionID,s.taskSHA256,s.goalID,s.relativePath])||!Array.isArray(c)||c.length!==1||c[0]?.type!=='text')return null;
 const text=c[0].text,prefix='[CURRENT DECLARED TASK ARTIFACT]\n';if(typeof text!=='string'||!text.startsWith(prefix))return null;
 const endHeader=text.indexOf('\n',prefix.length);if(endHeader<0)return null;let header;try{header=JSON.parse(text.slice(prefix.length,endHeader));}catch{return null;}
 if(!header||typeof header!=='object'||Array.isArray(header))return null;
 const keys=['artifactID','relativePath','path','sourceSHA256','taskSHA256','goalID'];if(Object.keys(header).length!==keys.length||keys.some(k=>header[k]!==s[k]))return null;
 const fence=/\n(`{3,})text\n/.exec(text.slice(endHeader));if(!fence)return null;const start=endHeader+fence.index+fence[0].length,tail='\n'+fence[1];if(!text.endsWith(tail))return null;
 const body=text.slice(start,-tail.length);if(Buffer.byteLength(body)>32768||sha(body)!==s.sourceSHA256)return null;
 return{path:s.path,relativePath:s.relativePath,sourceSHA256:s.sourceSHA256,taskSHA256:s.taskSHA256,goalID:s.goalID,artifactID:s.artifactID,body};
}
export function stableTaskArtifactPrefix(options,{trustedArtifacts=[],includeMissingNative=false,currentTaskBinding=null}={}){
 const messages=options.messages;if(!Array.isArray(messages)||!['system','developer'].includes(messages[0]?.role))return{options,changed:false,reason:'native_root_not_present'};
 const trusted=new Map(),trustedMessages=[];for(const message of trustedArtifacts){const proof=qualifyTaskArtifact(message,options.sessionId);if(proof){trusted.set(JSON.stringify(message.content),proof);trustedMessages.push({message,proof});}}
 const selected=[];let nativeSessionProvenanceUsed=false;
 for(let i=0;i<messages.length;i++){let proof=qualifyTaskArtifact(messages[i],options.sessionId);
  if(!proof&&messages[i]?.role==='developer'){proof=trusted.get(JSON.stringify(messages[i].content));if(proof)nativeSessionProvenanceUsed=true;}
  if(proof)selected.push({index:i,message:messages[i],proof});
 }
 let insertedNativeArtifactCount=0;
 if(includeMissingNative&&digest(currentTaskBinding?.taskSHA256)&&(currentTaskBinding.goalID===null||typeof currentTaskBinding.goalID==='string')){
  const candidates=trustedMessages.filter(x=>x.proof.taskSHA256===currentTaskBinding.taskSHA256&&x.proof.goalID===currentTaskBinding.goalID);
  if(candidates.length!==trustedMessages.length)return{options,changed:false,reason:'native_current_task_binding_mismatch'};
  for(const x of candidates){
   const same=selected.find(y=>y.proof.relativePath.toLowerCase()===x.proof.relativePath.toLowerCase());
   if(same){if(same.proof.artifactID!==x.proof.artifactID||same.proof.sourceSHA256!==x.proof.sourceSHA256)return{options,changed:false,reason:'wire_native_task_conflict'};continue;}
   selected.push({...x,index:-1});insertedNativeArtifactCount++;
  }
 }
 if(!selected.length)return{options,changed:false,reason:'no_qualified_current_task_artifacts'};
 const binding=sha([selected[0].proof.taskSHA256,selected[0].proof.goalID]);if(selected.some(x=>sha([x.proof.taskSHA256,x.proof.goalID])!==binding))return{options,changed:false,reason:'mixed_task_goal_bindings_delegated'};
 if(new Set(selected.map(x=>x.proof.relativePath.toLowerCase())).size!==selected.length)return{options,changed:false,reason:'duplicate_current_artifact_views_delegated'};
 // Keep the frequently updated progress plan last. No owner/user/tool message is
 // reordered relative to another, and no user/tool content becomes developer data.
 const key=x=>`${/(?:^|[/\\])PLAN\.md$/i.test(x.proof.relativePath)?'1':'0'}:${x.proof.relativePath.toLowerCase()}`;
 const sorted=[...selected].sort((a,b)=>key(a)<key(b)?-1:key(a)>key(b)?1:0),ids=new Set(selected.filter(x=>x.index>=0).map(x=>x.index));let at=0;
 while(at<messages.length&&['system','developer'].includes(messages[at]?.role)&&!ids.has(at))at++;
 const rest=messages.filter((_,i)=>!ids.has(i)),result=[...rest.slice(0,at),...sorted.map(x=>x.message),...rest.slice(at)];
 const changed=result.length!==messages.length||result.some((m,i)=>m!==messages[i]),view=changed?Object.freeze({...options,messages:Object.freeze(result)}):options;
 return{options:view,changed,artifactCount:sorted.length,insertedNativeArtifactCount,taskPrefixSHA256:sha(sorted.map(x=>({path:x.proof.path,sourceSHA256:x.proof.sourceSHA256,content:x.message.content}))),originalArtifactPositions:selected.map(x=>x.index),taskGoalBindingSHA256:binding,nativeSessionProvenanceUsed};
}
