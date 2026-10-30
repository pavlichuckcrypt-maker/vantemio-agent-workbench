# Service metadata and verified text reads

A context packer can correctly bound code while leaving its own SDK help, catalog locations or a recent documentary read outside the budget. Measure the fully composed request with the actual provider calibration. A previous cache hit does not increase hard cold-cache admission.

Use this order in the existing host:

1. Preserve current owner instructions, full Goal/task and explicitly required Source. Keep native provider/model/variant/auth and execution policy unchanged.
2. Normalize the SDK skill catalog with `presentSkillCatalogOnDemand`. Its locations are resolved by the native skill tool; malformed or unknown catalog fields stay unchanged.
3. Call `compactServiceDescriptions` with a common, qualified SDK descriptor fingerprint table. Only an exact name/description fingerprint can use the host's concise help. Optional schema-help deferral additionally requires an exact schema fingerprint. Validation keywords, defaults, enum data, required arguments and native execution remain unchanged.
4. Persist and verify the returned archive before dispatch. It retains complete help and original descriptions; load an official skill through the native skill tool before applying it. Unknown or customized metadata is not silently rewritten.
5. Apply the same host proof and admission policy to every completed textual read, including documentation. `presentVerifiedTextRead` can represent numbered native read output with exact remaining ranges and a hash-bound local original. Its file extension is not an admission rule. Binary/unframed results and failed/mismatched reads are not presented as verified reads.
6. Measure again and apply the unchanged hard admission before provider dispatch. The host decides which reads are optional and preserves required owner/Goal/Source. A partial preview is never complete review, current Source/CAS authority, release acceptance or permission to replay an operation.

```js
import { compactServiceDescriptions, restoreServiceDescriptions }
  from 'vantemio-agentic-backend/service-description-budget';
import { presentVerifiedTextRead }
  from 'vantemio-agentic-backend/verified-text-read-presentation';

const prepared = compactServiceDescriptions(request, {
  knownDescriptions: qualifiedSdkHelp,
  compactQualifiedSchemas: true,
});
// Persist prepared.archive and verify its digest in the existing host.
// Exact restoration is available for integrity tests and local diagnostics.
const original = restoreServiceDescriptions(prepared.body, prepared.archive);
const preview = presentVerifiedTextRead(completedReadText, {
  file: immutableOriginalFile,
  sha256: immutableOriginalTextSHA256,
  callID: originalReadCallID,
}, visibleRows);
```

The archive's whole-body binding hashes belong in receipts. For stable prompt references, store a metadata-only content-addressed archive separately; do not insert timestamps or per-request body hashes before otherwise reusable prompt content. Neither local storage nor a common prefix proves provider caching. Use original, format-bound provider usage and preserve missing fields as UNKNOWN.

OpenCode supports a common native [agent prompt configuration](https://opencode.ai/docs/agents/#prompt). A lean base can remove repeated generic examples while the host retains appended project/owner instructions. Do not replace task-specific requirements or pin a model as a side effect of changing the base prompt.

These are pure helpers, not a hosted agent or deployment adapter. Authentication, official package verification, original read/result proof, owner Stop, unknown side effects, immutable storage, safe loading, admission and the next ordinary consumer remain the host's responsibility. No model calls, paid probes or filesystem writes are performed by these modules.

## Historical readonly shell observations

`readonlyShellObservation(command, {scopeRoots, workdir})` recognizes a deliberately limited grammar of standard read commands, literal directory changes, and read pipelines. It requires explicit roots and never runs the command. Use it only after authenticating the original worker/result and exact arguments. Host-qualified executables, environment and signed operation identity remain prerequisites; path scope is lexical. A true result is not scan permission, successful Source output, proof that timeout descendants ended, or an authorization to replay. Arbitrary interpreters, mutators, writable redirects, dynamic expansions and unsupported grammar remain unqualified.
