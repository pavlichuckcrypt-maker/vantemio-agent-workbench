import {createHash} from 'node:crypto';

const formats = new Set(['chat-completions','responses','deepseek-chat','anthropic-messages']);
const keys = ['actorID','sessionID','goalID','inputID','providerID','modelID','requestID'];
const text = x => typeof x === 'string' && x.trim().length > 0;
const hash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const sum = (...values) => values.every(x => x !== null) ? values.reduce((a,b) => a+b,0) : null;

export function usageBinding(value) {
  if (!value || !keys.every(k => text(value[k])) || !Number.isSafeInteger(value.revision) || value.revision < 0 ||
      typeof value.requestSHA256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.requestSHA256)) throw Error('USAGE_INVALID_BINDING');
  return {...Object.fromEntries(keys.map(k => [k,value[k]])), revision:value.revision, requestSHA256:value.requestSHA256};
}

// Input is an original provider usage snapshot, never a native DB's default-zero projection.
export function normalizeProviderUsage({format,binding,receiptID,observedAt,stage,usage}) {
  if (!formats.has(format) || !text(receiptID) || !Number.isSafeInteger(observedAt) || observedAt < 0 ||
      !['final','partial'].includes(stage)) throw Error('USAGE_INVALID_OBSERVATION');
  const scope = usageBinding(binding), issues = [], fields = {};
  if (usage !== undefined && usage !== null && (typeof usage !== 'object' || Array.isArray(usage))) issues.push('usage:not_object');
  const raw = usage && typeof usage === 'object' && !Array.isArray(usage) ? usage : {};
  function read(name) {
    let value=raw;
    for (const part of name.split('.')) value=value?.[part];
    if (value === undefined || value === null) return null;
    if (!Number.isSafeInteger(value) || value < 0) {issues.push(name+':invalid_counter'); return null;}
    fields[name]=value;
    return value;
  }
  let inputTokens=null, cachedInputTokens=null, uncachedInputTokens=null;
  let cacheWriteInputTokens=null, ordinaryInputTokens=null, outputTokens=null;
  if (format === 'anthropic-messages') {
    ordinaryInputTokens=read('input_tokens');
    cachedInputTokens=read('cache_read_input_tokens');
    cacheWriteInputTokens=read('cache_creation_input_tokens');
    uncachedInputTokens=sum(ordinaryInputTokens,cacheWriteInputTokens);
    inputTokens=sum(uncachedInputTokens,cachedInputTokens);
    outputTokens=read('output_tokens');
    const writes=sum(read('cache_creation.ephemeral_5m_input_tokens'),read('cache_creation.ephemeral_1h_input_tokens'));
    if (writes !== null && cacheWriteInputTokens !== null && writes !== cacheWriteInputTokens) issues.push('cache_write_breakdown_conflict');
  } else {
    const responses=format === 'responses';
    inputTokens=read(responses?'input_tokens':'prompt_tokens');
    outputTokens=read(responses?'output_tokens':'completion_tokens');
    if (format === 'deepseek-chat') {
      cachedInputTokens=read('prompt_cache_hit_tokens');
      const misses=read('prompt_cache_miss_tokens');
      if (inputTokens === null) inputTokens=sum(cachedInputTokens,misses);
      uncachedInputTokens=misses;
      if (inputTokens !== null && cachedInputTokens !== null && misses !== null &&
          cachedInputTokens+misses !== inputTokens) issues.push('hit_miss_total_conflict');
    } else {
      const details=responses?'input_tokens_details':'prompt_tokens_details';
      cachedInputTokens=read(details+'.cached_tokens');
      cacheWriteInputTokens=read(details+'.cache_write_tokens');
      if (responses) {
        const writes=sum(read(details+'.cache_write_tokens_details.ttl_30m_tokens'),read(details+'.cache_write_tokens_details.ttl_12h_tokens'));
        if (writes !== null && cacheWriteInputTokens !== null && writes !== cacheWriteInputTokens) issues.push('cache_write_breakdown_conflict');
      }
    }
    if (inputTokens !== null && cachedInputTokens !== null) {
      const derived=inputTokens-cachedInputTokens;
      if (uncachedInputTokens !== null && uncachedInputTokens !== derived) issues.push('uncached_total_conflict');
      uncachedInputTokens=derived;
    }
    if (uncachedInputTokens !== null && cacheWriteInputTokens !== null) ordinaryInputTokens=uncachedInputTokens-cacheWriteInputTokens;
  }
  const counts={inputTokens,cachedInputTokens,uncachedInputTokens,cacheWriteInputTokens,ordinaryInputTokens,outputTokens};
  if (Object.values(counts).some(x => x !== null && (!Number.isSafeInteger(x) || x < 0))) issues.push('inconsistent_or_unsafe_totals');
  if (inputTokens !== null && [cachedInputTokens,uncachedInputTokens,cacheWriteInputTokens].some(x => x !== null && x > inputTokens)) issues.push('component_exceeds_total');
  // Invalid counters never produce a plausible hit rate or cache credit.
  const invalid=issues.length>0;
  const metrics=invalid ? Object.fromEntries(Object.keys(counts).map(k => [k,null])) : counts;
  const cacheHitFraction=!invalid && inputTokens > 0 && cachedInputTokens !== null ? cachedInputTokens/inputTokens : null;
  return {schema:'agent-provider-usage/v1',binding:scope,format,receiptID,observedAt,stage,
    usageSHA256:hash(usage ?? null),status:invalid?'invalid':inputTokens !== null && cachedInputTokens !== null && uncachedInputTokens !== null?'known':Object.values(counts).some(x => x !== null)?'partial':'unknown',
    metrics:{...metrics,cacheHitFraction},reportedFields:fields,issues,cacheHitGuarantee:false};
}

export function aggregateProviderUsage(observations) {
  if (!Array.isArray(observations)) throw Error('USAGE_OBSERVATIONS_REQUIRED');
  const originals=new Map();
  let partialSnapshots=0;
  for (const observation of observations) {
    if (observation?.schema !== 'agent-provider-usage/v1' || !formats.has(observation.format) ||
        !text(observation.receiptID) || !Number.isSafeInteger(observation.observedAt) || observation.observedAt < 0 ||
        !/^[a-f0-9]{64}$/.test(observation.usageSHA256 ?? '') ||
        !['known','partial','unknown','invalid'].includes(observation.status)) throw Error('USAGE_INVALID_NORMALIZED_RECORD');
    const m=observation.metrics;
    const counts=['inputTokens','cachedInputTokens','uncachedInputTokens','cacheWriteInputTokens','ordinaryInputTokens','outputTokens'];
    if (!m || counts.some(k => m[k] !== null && (!Number.isSafeInteger(m[k]) || m[k] < 0)) ||
        (m.inputTokens !== null && ['cachedInputTokens','uncachedInputTokens','cacheWriteInputTokens'].some(k => m[k] !== null && m[k] > m.inputTokens)) ||
        (m.inputTokens !== null && m.cachedInputTokens !== null && m.uncachedInputTokens !== null && m.cachedInputTokens+m.uncachedInputTokens !== m.inputTokens) ||
        (observation.status === 'invalid' && (counts.some(k => m[k] !== null) || m.cacheHitFraction !== null)) ||
        m.cacheHitFraction !== (observation.status !== 'invalid' && m.inputTokens > 0 && m.cachedInputTokens !== null ? m.cachedInputTokens/m.inputTokens:null)) {
      throw Error('USAGE_INVALID_NORMALIZED_RECORD');
    }
    const scope=usageBinding(observation.binding);
    if (observation.stage === 'partial') {partialSnapshots++; continue;}
    if (observation.stage !== 'final') throw Error('USAGE_INVALID_NORMALIZED_RECORD');
    const key=JSON.stringify([scope.providerID,scope.actorID,scope.sessionID,scope.requestID]);
    const prior=originals.get(key);
    if (prior && JSON.stringify(prior) !== JSON.stringify(observation)) throw Error('USAGE_ORIGINAL_REQUEST_CONFLICT');
    originals.set(key,observation);
  }
  const final=[...originals.values()], measured=final.filter(x => x.status !== 'invalid' &&
    x.metrics.inputTokens !== null && x.metrics.cachedInputTokens !== null);
  const inputTokens=measured.reduce((s,x) => s+x.metrics.inputTokens,0);
  const cachedInputTokens=measured.reduce((s,x) => s+x.metrics.cachedInputTokens,0);
  if (!Number.isSafeInteger(inputTokens) || !Number.isSafeInteger(cachedInputTokens)) throw Error('USAGE_AGGREGATE_OVERFLOW');
  const reportedSubsetCacheHitFraction=inputTokens>0?cachedInputTokens/inputTokens:null;
  return {finalRequests:final.length,reportedCacheRequests:measured.length,
    unknownCacheRequests:final.filter(x => x.status !== 'invalid' && (x.metrics.inputTokens === null || x.metrics.cachedInputTokens === null)).length,
    invalidRequests:final.filter(x => x.status === 'invalid').length,partialSnapshots,
    measuredSubset:{inputTokens,cachedInputTokens},reportedSubsetCacheHitFraction,
    cacheHitFraction:measured.length === final.length?reportedSubsetCacheHitFraction:null,
    cacheHitGuarantee:false};
}
