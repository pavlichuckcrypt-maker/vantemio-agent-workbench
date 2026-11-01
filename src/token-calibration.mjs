// Pure calibration policy. No provider calls, cache credit, file reads or replay.
export const TOKEN_CALIBRATION_VERSION=4;
const day=86400000;
const fresh=(at,now)=>Number.isFinite(at)&&at<=now&&now-at<=day;
function retainedSample(s,scope,now){
 return !!(s?.retentionQualified===true&&s.sessionID===scope.sessionID&&s.provider===scope.provider&&s.model===scope.model&&(s.cacheNamespaceSHA256??null)===(scope.cacheNamespaceSHA256??null)&&fresh(s.observedAt,now)&&typeof s.localRequestID==='string'&&s.localRequestID.length>0&&s.localRequestID.length<=200&&/^[a-f0-9]{64}$/.test(s.bodySHA256||'')&&Number.isFinite(s.localEstimatedTextTokens)&&s.localEstimatedTextTokens>=1000&&Number.isFinite(s.actualInputTokens)&&s.actualInputTokens>0&&s.ratio===s.actualInputTokens/s.localEstimatedTextTokens&&s.ratio>=0.5&&s.ratio<=3);
}
// Total-token measurement and cache attribution are independent observations.
// A standard OpenAI prompt/input total remains usable when cached tokens were
// omitted, but no cache hit or uncached count is invented from that omission.
export function reportedCalibrationInputTotal(u,{sessionID,provider,model}){
 if(!/^[a-f0-9]{64}$/.test(u?.bodySHA256||''))return null;
 const n=u?.normalizedUsage,b=n?.binding,t=n?.metrics?.inputTokens;
 if(n?.schema==='agent-provider-usage/v1'&&['known','partial'].includes(n.status)&&b?.sessionID===sessionID&&b.providerID===provider&&b.modelID===model&&b.requestID===u.localRequestID&&b.requestSHA256===u.bodySHA256&&Number.isFinite(t)&&t>=0){
  const key=n.format==='chat-completions'?'prompt_tokens':n.format==='responses'?'input_tokens':null;
  if(key&&n.reportedFields?.[key]===t&&u.usage?.[key]===t)return t;
 }
 const legacy=u?.cacheMetrics?.status==='reported'?u.cacheMetrics.inputTokens:null;
 return Number.isFinite(legacy)&&legacy>=0?legacy:null;
}
export function deriveTokenCalibration({usages,metrics,sessionID,provider,model,now=Date.now(),fallbackEvidence,measure,cacheNamespaceSHA256}){
 const scope={sessionID,provider,model,cacheNamespaceSHA256:cacheNamespaceSHA256??null},samples=[],seen=new Set();
 const add=s=>{const key=s.localRequestID+'|'+s.bodySHA256;if(!seen.has(key)){seen.add(key);samples.push(s);}};
 // The metric journal already retains this small derived observation. Carry
 // only bound same-actor/provider/model/namespace evidence for one day, rather
 // than forgetting the peak when its original large metric leaves the tail.
 for(const m of metrics){
  if(m.sessionID!==sessionID||m.provider!==provider||m.model!==model||m.phase!=='prepared_not_generation_acceptance'||(m.cacheNamespaceSHA256??null)!==scope.cacheNamespaceSHA256||!fresh(Date.parse(m.at),now)||![3,4].includes(m.cachePreparation?.tokenCalibration?.version))continue;
  for(const s of m.cachePreparation.tokenCalibration.samples||[])if(retainedSample(s,scope,now)&&s.observedAt<=Date.parse(m.at))add(s);
 }
 for(const u of usages){
  if(u.provider!==provider||u.completedGeneration!==true||reportedCalibrationInputTotal(u,{sessionID,provider,model})===null||!fresh(Date.parse(u.at),now)||!u.localRequestID||!u.bodySHA256)continue;
  const m=metrics.findLast(m=>m.sessionID===sessionID&&m.provider===provider&&m.model===model&&m.localRequestID===u.localRequestID&&m.bodySHA256===u.bodySHA256&&m.phase==='prepared_not_generation_acceptance'&&(!cacheNamespaceSHA256||(m.cacheNamespaceSHA256===cacheNamespaceSHA256&&u.cacheNamespaceSHA256===cacheNamespaceSHA256)));
  if(!m||m.mediaBytes||!Number.isFinite(m.localEstimatedTextTokens)||m.localEstimatedTextTokens<1000)continue;
  const total=reportedCalibrationInputTotal(u,{sessionID,provider,model}),ratio=total/m.localEstimatedTextTokens;
  if(Number.isFinite(ratio)&&ratio>=0.5&&ratio<=3)add({...scope,localRequestID:u.localRequestID,bodySHA256:u.bodySHA256,observedAt:Date.parse(u.at),ratio,actualInputTokens:total,localEstimatedTextTokens:m.localEstimatedTextTokens,retentionQualified:true});
 }
 if(fallbackEvidence?.originalFullWireUnavailable!==true&&fallbackEvidence?.sessionBound&&fallbackEvidence.actualInputTokens&&fallbackEvidence.body){const local=measure(fallbackEvidence.body),ratio=fallbackEvidence.actualInputTokens/local;if(Number.isFinite(ratio)&&ratio>=0.5&&ratio<=3)add({localRequestID:fallbackEvidence.localRequestID,bodySHA256:fallbackEvidence.bodySHA256,ratio,actualInputTokens:fallbackEvidence.actualInputTokens,localEstimatedTextTokens:local});}
 const factor=samples.length?Math.max(0.9,...samples.map(x=>x.ratio*1.08)):1.1;
 const peak=samples.toSorted((a,b)=>b.ratio-a.ratio)[0],recent=samples.filter(x=>x!==peak).toSorted((a,b)=>(a.observedAt??0)-(b.observedAt??0)).slice(-7),retained=peak?[peak,...recent]:[];
 return{version:TOKEN_CALIBRATION_VERSION,factor,samples:retained,kind:samples.length?'same_actor_reported_usage_and_request_binding':'conservative_unknown_tokenizer_estimate',retainedPeakWindowMs:day,actualUsageStillAuthoritative:true,providerCacheHitNotGuaranteed:true};
}
