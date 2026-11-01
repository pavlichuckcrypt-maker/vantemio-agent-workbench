# Token calibration from original observations

`./token-calibration` is a pure estimate policy. It reads no files, sends no requests and chooses no provider or model. The host supplies trusted original usage and prepared-body metrics for the currently selected session, provider, model and deployment namespace.

```js
import { deriveTokenCalibration } from 'vantemio-agentic-backend/token-calibration';

const calibration = deriveTokenCalibration({
  sessionID,
  provider: selectedProviderID,
  model: selectedModelID,
  cacheNamespaceSHA256,
  usages: originalUsageEnvelopes,
  metrics: verifiedPreparedMetrics,
  now: Date.now(),
});
```

Each usage envelope contains `at`, `provider`, `completedGeneration`, `localRequestID`, `bodySHA256`, `cacheNamespaceSHA256`, the original `usage` object and its bound `normalizedUsage` from `./usage`. The prepared metric has matching session/provider/model/request/body/namespace fields, `phase: 'prepared_not_generation_acceptance'`, `localEstimatedTextTokens` and `mediaBytes: 0`. Count the complete final serialized body, including necessary Source, system messages and tools. Verify file, original-response and request bindings in the host before supplying these records. Legacy envelopes may supply a complete reported `cacheMetrics.inputTokens` total.

A normalized Chat Completions or Responses total can remain known while cached and uncached attribution is unknown. The policy uses that total only when the original counter, normalized reported field and session/provider/model/request/body binding agree. It does not turn missing cache fields or SDK numeric defaults into zero, a cache hit or fresh-token counts.

The policy retains the highest qualified ratio plus up to seven recent observations for one day. Later smaller requests do not erase a measured undercount. Store the returned object in `metric.cachePreparation.tokenCalibration` within the existing verified metric archive; hydrate that archive when a compact journal omits nested samples. This is bounded observation retention, not an agent action quota or another memory service.

The returned `factor` includes the existing eight-percent margin. It remains an estimate, not an exact provider-token upper bound, cache credit, model identity proof or release acceptance. Continue using the host's normal admission, lifecycle, Source preservation and original usage accounting. A new provider/model/namespace uses its own evidence; this policy does not pin the selection.
