import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {normalizeProviderUsage} from '../src/provider-usage.mjs';

const now=1_800_000_000_000;
const sha=value=>createHash('sha256').update(value).digest('hex');
const scope={sessionID:'session-example',provider:'provider-example',model:'model-example',cacheNamespaceSHA256:sha('namespace')};
function observation(id,total=4000,at=now-1000){
  const requestSHA256=sha(id),binding={actorID:'actor-example',sessionID:scope.sessionID,goalID:'goal-example',inputID:'input-example',providerID:scope.provider,modelID:scope.model,requestID:id,revision:1,requestSHA256};
  const usage={prompt_tokens:total,completion_tokens:10};
  return {usage:{at:new Date(at).toISOString(),provider:scope.provider,cacheNamespaceSHA256:scope.cacheNamespaceSHA256,localRequestID:id,bodySHA256:requestSHA256,completedGeneration:true,usage,cacheMetrics:{status:'unknown'},normalizedUsage:normalizeProviderUsage({format:'chat-completions',binding,receiptID:'receipt-'+id,observedAt:at,stage:'final',usage})},metric:{...scope,at:new Date(at).toISOString(),phase:'prepared_not_generation_acceptance',localRequestID:id,bodySHA256:requestSHA256,localEstimatedTextTokens:2000,mediaBytes:0}};
}
async function api(){const m=await import('../src/token-calibration.mjs').catch(()=>null);assert.equal(typeof m?.deriveTokenCalibration,'function','portable calibration API must exist');return m;}

test('reported total calibrates input when provider omits cache counts',async()=>{
  const m=await api(),x=observation('request-example'),before=JSON.stringify(x),r=m.deriveTokenCalibration({...scope,now,usages:[x.usage],metrics:[x.metric]});
  assert.equal(r.factor,2.16);
  assert.equal(r.samples.length,1);
  assert.equal(x.usage.normalizedUsage.status,'partial');
  assert.equal(x.usage.normalizedUsage.metrics.cachedInputTokens,null);
  assert.equal(x.usage.normalizedUsage.metrics.uncachedInputTokens,null);
  assert.equal(r.providerCacheHitNotGuaranteed,true);
  assert.equal(JSON.stringify(x),before);
});

test('same-scope high-water observation survives thirty later smaller totals',async()=>{
  const m=await api(),rows=[observation('peak'),...Array.from({length:30},(_,i)=>observation('later-'+i,2200))];
  const r=m.deriveTokenCalibration({...scope,now,usages:rows.map(x=>x.usage),metrics:rows.map(x=>x.metric)});
  assert.equal(r.factor,2.16);
  assert.equal(r.samples[0].localRequestID,'peak');
  assert.ok(r.samples.length<=8);
});

test('archived bound sample survives compact journals without a new request',async()=>{
  const m=await api(),x=observation('archived'),first=m.deriveTokenCalibration({...scope,now,usages:[x.usage],metrics:[x.metric]});
  const metric={...x.metric,cachePreparation:{tokenCalibration:first}};
  const second=m.deriveTokenCalibration({...scope,now:now+1,usages:[],metrics:[metric]});
  assert.equal(second.factor,2.16);
});

test('foreign or expired retained observations never influence the estimate',async()=>{
  const m=await api(),x=observation('bound'),first=m.deriveTokenCalibration({...scope,now,usages:[x.usage],metrics:[x.metric]});
  for(const edit of [s=>s.sessionID='foreign',s=>s.provider='foreign',s=>s.model='foreign',s=>s.cacheNamespaceSHA256=sha('foreign'),s=>s.observedAt=now-86400001,s=>s.ratio=2.1]){
    const saved=structuredClone(first);edit(saved.samples[0]);
    assert.equal(m.deriveTokenCalibration({...scope,now,usages:[],metrics:[{...x.metric,cachePreparation:{tokenCalibration:saved}}]}).factor,1.1);
  }
});

test('partial input needs original request, scope and raw-counter agreement',async()=>{
  const m=await api(),x=observation('original');
  for(const edit of [u=>u.normalizedUsage.binding.requestID='other',u=>u.normalizedUsage.binding.sessionID='other',u=>u.normalizedUsage.binding.modelID='other',u=>u.normalizedUsage.binding.providerID='other',u=>u.normalizedUsage.reportedFields.prompt_tokens++,u=>u.usage.prompt_tokens++,u=>u.bodySHA256='invalid']){
    const u=structuredClone(x.usage);edit(u);
    assert.equal(m.deriveTokenCalibration({...scope,now,usages:[u],metrics:[x.metric]}).samples.length,0);
  }
});
