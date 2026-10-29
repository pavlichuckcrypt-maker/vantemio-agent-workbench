# Runtime continuity — version 0.6.0

These exports are portable parts of a shared agent runtime repair. They do not install themselves into OpenCode, provide authentication or execute a recovery request. Enroll them once in the host's existing lifecycle, then check the same ordinary assistant/tool consumer. Keep native provider/model/reasoning selection with the native SDK.

## Original outcomes

`reconcileVerifiedOriginal` (`./original-outcome`) accepts an original invocation, `readCurrent` and `verifyOriginal`. Both callbacks are trusted host code, never model-supplied booleans. `readCurrent` returns `{binding, ownerStop:false, complete:false}`. The binding contains actor/session/Goal/revision/task/objective digest; provider/model are deliberately not pins. The verifier must authenticate the same immutable original request/call/tool/input digest and completion receipt, without dispatching anything. Use `originalInputSHA256` to produce the canonical JSON input digest; only JSON tool inputs are supported.

A qualified verifier result has `qualified`, `signatureVerified`, `originalOnly`, original binding/requestID/callID/tool/inputSHA256, receiptID/receiptSHA256, positive originalCompletedAt and an outcome. The outcome is one of:

- `completed`: dispatched=true, executionClosed=true, integer exitCode and bounded output. Nonzero means known failure, not PASS.
- `rejected_before_execution`: dispatched=false and bounded original error.
- `readonly_timeout`: dispatched=true, readonlyQualified=true, usableReadResult=false and original error. This proves no usable read result, not process/descendant completion or success.

The caller rechecks current scope and Stop after verification. An UNKNOWN execution stays unresolved. Results grant no replay, claim release, fresh Source authority or publication approval. Authentication and readonly-command qualification remain host responsibilities. The library performs no retry, tool dispatch or provider request.

`./proof-cache` provides a byte/count bounded LRU of immutable JSON proof copies. Eviction means re-verification, never re-execution. `stableOriginalTransportResult` removes named delivery/ACK observations before comparison; preserve original receipts separately. Do not remove fields that describe execution or its uncertainty.

## Continuation transaction

`./control-state` qualifies a superseding native input only after a known pre-dispatch refusal with no assistant output or tools. It does not resolve unknown tools by itself; the caller must first settle originals and apply all normal admission guards. The original accepted input is never resent. A technical peer handoff preserves the prior reasoning variant only for the same native model/provider; explicit user choice wins.

Use `qualifyContinuationSnapshot` after asynchronous checks and immediately before dispatch. Bind current Goal/revision/objective, latest assistant/input, native idle state, permissions and absence of live tools. A paged assistant-only snapshot is allowed only when every row belongs to that same original input. It is not a substitute for checking the native current input ID.

`mergeContinuationState` preserves fresh owner/ledger state. `commitContinuationIntent` performs a synchronous predecessor check and atomic replacement of an explicitly owned absolute state file. **Its contract requires a single exclusive host writer/event loop; it is not a multi-process locking primitive.** Other writers must use the host's existing serialized transaction mechanism. Do not accept arbitrary model-selected state paths. Commit a durable intent before the host dispatches; recheck the native snapshot at that boundary. `settleContinuationIntent` writes an immutable control receipt and updates only that dispatch entry, preserving a later Stop. Accepted/UNKNOWN receipts must be reconciled, never resent.

`./maintenance-hold` qualifies release of only the matching completed maintenance operation, manifest, current PID, enrolled actor/root and unchanged Goal. It returns a predicate; the host still owns the atomic mutation. A later maintenance operation or owner Stop cannot be cleared by an old release receipt.

## Source presentation and progress

`formatReadPreview` (`./source-presentation`) requires a digest-matching original numbered text read. The host must already have saved and authenticated the original at the given archive reference. The formatter does not verify the filesystem or create that archive. It keeps explicit missing line ranges, original call/hash and original-to-archive line mapping. Read required missing ranges before editing/reviewing; a preview is not a full Source review or fresh CAS proof.

The host must exclude required Goal/task instructions, PROJECT/AGENTS/SKILL documents, active work, mutation outputs and unresolved outcomes from shortening. Apply this only to qualified completed reads. Preserve required evidence and physical model output capacity. A50k necessary-fresh maximum is a ceiling, never a filling target; local storage is not provider cache.

`qualifiedProgressFacts` and `terminalProgress` (`./runtime-progress`) distinguish new Source/graph observations, candidate writes and test invocations. Identical returned Source bytes remain the same observation even if call IDs, requested limits or trailing compaction markers change. New Source/ranges/tasks remain meaningful. Repeated unchanged terminal text can qualify stagnation; ordinary reading has no arbitrary round quota. These signals are not a complete shell-write detector, proof of test success, implementation acceptance or justification to stop an agent automatically. Reconcile actual artifacts, tests and subsequent consumers.

## Verification

Offline regressions cover original scope/signature/Stop, known failures versus UNKNOWN, missing Source ranges, cache byte bounds, stale maintenance, changed inputs and control receipt conflicts. Packed-package consumer checks validate installed exports. These tests do not prove a provider's identity, cache hit rate, mainnet readiness or uninterrupted service. Deployment acceptance requires your own current source/callback binding and subsequent normal consumers for every enrolled role.

## Keep the active read across requests

`retainActiveWorkingReadContext` (`./active-read-context`) takes the host's current derived state, authenticated working view and original read results. It marks current working Source call IDs as needed by subsequent read-retention/budget passes. It checks the current input/latest action, enrolled read tool/path and original result hashes. Old budget demotions must not override that current need. It does not restore arbitrary archives, pin an entire past task, change limits or grant fresh Source authority. The host must run it **before** historical read eviction; its current task/native boundary still owns admission. This adapter accepts the explicit CLIENT CURRENT STATE envelope used in the recipe; other hosts must supply a qualified serializer/working-view adapter.
