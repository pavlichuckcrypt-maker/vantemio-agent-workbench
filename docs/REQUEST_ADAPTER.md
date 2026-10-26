# Common request adapter and provider usage

[Русский](REQUEST_ADAPTER.ru.md). Node.js >=22; no package dependencies or install scripts.

## Ownership

`createAgentRequestAdapter` from `vantemio-agentic-backend/request-adapter` composes the public task/evidence/budget mechanisms. It returns `prepare`, `beforeDispatch` and `observe`. None sends a request, executes a tool, changes an agent Goal/model/TODO, resets a native ledger or creates storage. The existing host remains responsible for authenticated enrollment, native Stop/permissions, durable original intents, fresh Source/CAS proofs and transport. This is a host integration library, not a complete hosted coding agent.

## Configure once in the existing host

```js
import {createAgentRequestAdapter} from 'vantemio-agentic-backend/request-adapter';
import {pacedFetch} from 'vantemio-agentic-backend/pacing';

const adapter = createAgentRequestAdapter({
  policy: host.requestPolicy,
  format: 'chat-completions',
  resolveTask: input => host.currentTask(input.sessionID, input.requestID),
  resolveEvidence: input => host.currentEvidence(input.binding),
  measureInput: input => host.inputTokenUpperBound(input),
  assertSnapshotCurrent: input => host.assertRequestSnapshot(input),
});

export async function runExistingNativeRequest(input) {
  const prepared = await adapter.prepare(input);
  // Existing durable ledger: same request ID + body SHA. Accepted/UNKNOWN are not sent again.
  const admission = await host.admitOriginalOnce(prepared.binding);
  if (admission.action !== 'send') return host.originalOutcome(admission);
  return pacedFetch({
    ...host.pacingPaths,
    sessionID: prepared.binding.sessionID,
    requestID: prepared.binding.requestID,
    dispatch: async (url, init) => {
      await adapter.beforeDispatch(prepared); // After pacing, immediately before native transport.
      return host.nativeTransport(url, {...init, body: prepared.serializedBody});
    },
  }, host.nativeURL, {...host.nativeInit, body: prepared.serializedBody});
}
```

`host` methods in this recipe are required integration contracts, **not** APIs supplied by this package. Native transport must remain bound to the selected provider, credentials and original admission. Its normal response/stream consumer passes a final original usage snapshot to `observe`; do not add a second reader to a live response stream. If dispatch fails after bytes may have been sent, keep the original UNKNOWN. A proven pre-dispatch rejection can be recorded as unsent through the existing ledger; it never authorizes replay of an uncertain send. The adapter does not certify cross-process durability in `pacedFetch`.

## Inputs and lifecycle

`prepare({sessionID, requestID, payload})` accepts an immutable original ID and a JSON-only native request. The payload's `model` must equal the resolved model ID. Non-JSON values, cycles, sparse arrays and accessors reject rather than being silently changed.

`resolveTask({sessionID, requestID})` returns the task-context fields described in [INTEGRATION.md](INTEGRATION.md#bound-system-transform), plus `providerID`, `modelID` and explicit booleans `ownerStop`, `busy`, `pendingPermission`, `liveTools`, `unknownTools`, `unknownAdmissions`. Missing lifecycle evidence rejects; any true flag holds the request except a proven SAME owned unsent request: `busy:true` may include `activeRequestID === requestID` with `activeRequestPhase: preparing` or `waiting_unsent`. This allows the normal native pre-step while its UI is already Busy. Dispatched/UNKNOWN or another request ID remains held; UI Busy alone is not ownership evidence. The binding remains actor/session/Goal/revision/input. No title-based or basename-based enrollment is inferred.

`resolveEvidence({binding})` returns `{records, originalResults, currentSources}` under the [evidence contract](INTEGRATION.md#source-and-result-continuity). Return empty arrays when no selected evidence is needed. Reuse stable version/receipt IDs while valid; edits must invalidate them. The adapter does not copy all history or perform Source file discovery.

`measureInput({serializedBody, providerID, modelID})` returns `{inputTokenUpperBound, method}` for the **complete exact native payload**, including tools and modality overhead. Supply a qualified model tokenizer or conservative bound through the existing host. A text-length heuristic is not a universally valid tokenizer. Missing/changed measurements hold. The library checks the configured total-token and UTF-8 body limits without lowering output or reasoning settings.

`assertSnapshotCurrent({task, evidence, prepared, dispatchBoundary?})` must verify the host's current Source/document versions, native lifecycle and original admission. It runs during preparation and again at the dispatch boundary. Stop and task state are checked again after asynchronous callbacks. The hook does not hold an external filesystem or lifecycle lock: native transport must use the host's existing final fence/lease.

## Large necessary cached contexts

Past usage is not a cache guarantee for the next request. Preparation applies **zero automatic historical cache credit**. If the host-supplied total bound exceeds `maxFreshInputTokens`, both snapshot checks must return:

```js
{cacheAdmission: {
  qualified: true,
  receiptID: 'original-host-cache-admission',
  binding: prepared.binding,
  expectedFreshInputTokens: 15000,
  observationKind: 'bound_prefix_estimate' // or 'provider_admission'
}}
```

The binding must exactly match this actor/provider/model/Goal/input/request/body SHA, and expected fresh input must fit the configured fresh limit. The host must qualify the necessary prefix, actual matching usage/protocol, freshness and spend policy. A no-op callback, another actor's hit or an unbound number cannot admit a large request. An estimate can still miss after eviction or changed upstream routing: this receipt makes that risk explicit, not guaranteed away. No padding or paid availability/prewarm probes are installed. `observe` reports actual fresh/cache/total overflows, including cold misses; it never hides a breach or authorizes an automatic retry.

## Protocol serializers

Default request projection supports `chat-completions` and `deepseek-chat`. It keeps native initial system/developer entries, appends the complete trusted task context and restores selected content under original tool roles. Native history remains unchanged.

For `responses` or `anthropic-messages`, supply a qualified `projectRequest({binding, format, payload, taskContext, evidence, maxEvidenceBytes})` returning `{payload, evidenceDecisions}`. Nonempty native evidence requires an independently qualified projection; do not reinterpret native records as Chat Completions. Keep native reasoning IDs, encrypted blocks/signatures, tool calls/results and ordering intact. The core permits edits only to context fields (`input`/`instructions`, `messages`/`system`, or `messages`); changing model, output budget, reasoning or any other option rejects. The full task block must remain in a trusted system/developer location. Custom serializer tests do not attest every installed provider/version.

Prepared output includes exact serialized bytes and SHA, bound native IDs, snapshot digests, measurement provenance, host cache admission and evidence decisions. It is frozen in memory. Before dispatch the adapter checks the SHA, lifecycle, task/evidence/documents and token bound again. Persist the prepared record in an authenticated existing ledger; a hash is not a signature or an admission grant.

## Original provider usage

`normalizeProviderUsage` from `./usage` takes `{format, binding, receiptID, observedAt, stage, usage}`. Binding includes actor/session/Goal/revision/input/provider/model/request ID and `requestSHA256`; `observedAt` is the original observation's Unix milliseconds. `stage` is `partial` or `final`. Pass raw original provider counters, not default-zero native database summaries. A requested/reported model alias does not attest a physical model behind a proxy.

| Explicit format | Input and cache semantics |
|---|---|
| `chat-completions` | `prompt_tokens` is inclusive input; reads are `prompt_tokens_details.cached_tokens`. Uncached = total minus reads. |
| `responses` | Inclusive `input_tokens`; reads/writes are under `input_tokens_details`. Writes remain fresh processing; ordinary input excludes reads and writes. |
| `deepseek-chat` | Explicit `prompt_cache_hit_tokens` and `prompt_cache_miss_tokens`; their sum can supply a missing total. A missing hit field stays UNKNOWN. |
| `anthropic-messages` | Ordinary `input_tokens`, `cache_creation_input_tokens` and `cache_read_input_tokens` are separate. Total is their sum; uncached includes ordinary input plus writes. Never subtract reads again from already uncached input. |

Field semantics: [OpenAI Chat Completions example](https://developers.openai.com/cookbook/examples/prompt_caching_201), [OpenAI read/write breakdown](https://developers.openai.com/api/docs/guides/prompt-caching), [DeepSeek counters](https://api-docs.deepseek.com/guides/kv_cache/), [Anthropic counters](https://platform.claude.com/docs/en/build-with-claude/prompt-caching).

Absent counters remain `null`/UNKNOWN; explicit zero is measured zero. Invalid, unsafe or contradictory counters produce `invalid` with no plausible cache fraction. `reportedFields` and a usage SHA preserve provenance without retaining a prompt. This API normalizes counters; it does not enable cache controls, attest billing or infer success from HTTP200.

`adapter.observe(prepared, {binding, receiptID, observedAt, stage, usage})` verifies the exact original binding and returns normalized observation plus nullable total/fresh/cache budget findings. Missing usage stays unknown. It does not consult the new current task to relabel a late result, reset failure accounting, change models or authorize retries.

`aggregateProviderUsage(observations)` counts final original snapshots once, excludes partial stream snapshots from totals, and rejects changed finals under the same original request. Fractions are token-weighted. A mixed UNKNOWN/invalid sample has no claimed all-sample fraction; the known subset's ratio and coverage are reported separately. These statistics are not admission evidence for another request.
