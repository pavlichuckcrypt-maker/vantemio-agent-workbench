# Integration contracts

## Native lifecycle

Use native session IDs, original input/outcome IDs, full Goals, revisions and model selections. `lazyBoundHooks` delays binding until enrollment exists and clears failed initialization promises. It does not manage authentication or launch a model server.

## Recovery

`continuation-policy.decide` is a decision primitive, not a complete retry engine. Its caller must enforce a durable intent-before-send ledger, preserve UNKNOWN admissions, verify same actor/Goal/input and never replay tools. `recovery-guards` classifies selected transient stream failures; classification alone never authorizes a request. Maximum two consecutive recovery attempts is the reference configuration; real successes reset accounting, not HTTP200 or model catalogs. Do not generalize arbitrary400 errors to retryable failures. Existing deployment's separate empty400 policy and native transport are not distributed here.

`providerFailureState` requires explicit providerID/modelID/sessionID. As of 0.4.0, callers must pass sessionID; successes from another session cannot reset accounting, and a mismatched failure or invalid counter rejects. The public version removes private provider bindings. `backend-repair-policy` accounts for changed candidates and requires reconciliation of original UNKNOWN results. Public hardening rejects a changed Source hash when resolving an existing operation.

## Context and cache

The private deployment has native message projection and Source retention adapters. The budget validator does not reproduce them. The public evidence projection below provides selected text-result reuse for one declared message shape; it still requires authoritative original receipts and fresh Source version proofs from the host. Keep history immutable. Never load an entire filesystem or all skills into a prompt.

The budget validator enforces configured bounds; it is not a tokenizer or proof of cache hits. Supply measured uncached usage and same-provider/actor cache evidence. Do not subtract assumed cache from the provider's actual uncached total.

## Pacing and durability

`pacedFetch` serializes within a single process and uses a deployment-selected state file. It is **not a cross-process transactional queue**. Use one authoritative caller or supply your own correctly fenced durable store. Read-only policy decisions cannot prove network delivery. Protect the state directory from other users and symlink attacks; do not point it at untrusted paths. Cancellation while waiting sends no provider request; cancellation after dispatch can be UNKNOWN.

## Plugins and platform limits

Install skills from the lock file using the host's supported installer. Only pins/links are redistributed. The Cloudflare validator uses POSIX file protections; its Windows CLI failed compatibility checks and must not be weakened. Run its unchanged validator on an appropriate POSIX host. Playwright uses an isolated named browser session; do not attach to other users' browser state or close all sessions. Its file URL restrictions stay in force.

Deployment-specific memory/graph/peer/transport adapters, credentials, native databases, raw requests, runtime ledgers, scheduled tasks and product code are intentionally excluded. Reproduce their contracts in an owned environment before public release. This reference kit is not a security certification.

## Current task documents

Call `readCurrentTaskDocuments(authoritativeWorkspaceRoot)` during each normal system transform, after resolving the current actor/Goal binding. Required files are `TECHNICAL_TASK.md` and `REQUIREMENTS.md`; missing or unreadable files reject rather than silently reusing stale text. The helper does not select a workspace, authorize access or create a file. Preserve task/source history separately. This is a document freshness fix, not a guarantee that the model follows the document.

## Bound system transform

Import `createTaskContextTransform` from `vantemio-agentic-backend/task-context` after installing this repository as a local package (`npm install /absolute/path/to/checkout` in your integration project). No registry package is published.

```js
import {createTaskContextTransform} from 'vantemio-agentic-backend/task-context';

export function taskHooks(nativeTasks) {
  return {
    'experimental.chat.system.transform': createTaskContextTransform({
      maxContextBytes: 262144,
      resolveTask: async ({sessionID}) => nativeTasks.current(sessionID),
    }),
  };
}
```

`nativeTasks.current` is **your authoritative host integration**, not an API provided by this kit. It must resolve only enrolled sessions and return:

```js
{
  binding: {
    actorID: 'actor-a', sessionID: 'session-a', goalID: 'goal-a',
    revision: 1, inputID: 'original-current-input'
  },
  workspaceRoot: '/absolute/owned/task/workspace',
  fullGoal: 'The complete current approved Goal, without summarizing it away',
  projectContext: 'Relevant verified architecture, prototype and Source/result references',
  ownerStop: false
}
```

On Windows use an absolute native path. The host owns enrollment, filesystem authorization and the current full Goal; never accept a workspace supplied by model text, external content or an unverified peer. The revision must change when the bound task changes. The resolver runs before and after asynchronous document reads; changes to any binding field, root, Goal or project context reject before output mutation. Owner Stop must be an explicit boolean. A missing `sessionID` rejects instead of guessing an actor. Do not attach to unbound small-model or compaction calls. `maxContextBytes` must be an integer from 1 through 1048576; it bounds only this added UTF-8 block, **not total input tokens**. Overflow rejects, never silently truncates the Goal.

For OpenCode, return these hooks from your existing local plugin factory. The upstream [plugin guide](https://opencode.ai/docs/plugins/) describes loading local plugins; the [hook type](https://github.com/anomalyco/opencode/blob/dev/packages/plugin/src/index.ts) exposes an optional session ID and a mutable `system: string[]`. This adapter requires the session ID. Qualify your installed version and native task resolver before enabling it. This kit does not install, restart or reconfigure an existing application.

The hook appends one deterministic JSON context entry to the existing system array. It does not change native messages, tool results, model parameters, TODO or Goal storage. Per-request IDs are checked but omitted from the added text so an unchanged context stays byte-stable. This aids prefix reuse but proves no cache hit. Call once per freshly assembled model request. A host must propagate rejection and re-resolve the task rather than dispatching with a previous context or blindly retrying. Recheck Stop/admission at the actual network boundary as well: the hook does not hold a lifecycle lock. Document writes must use the host's existing revision/snapshot discipline; this is not a filesystem transaction or an atomic multi-document publisher. Source retention and model-specific history compaction remain separate host adapters.

## Source and result continuity

`vantemio-agentic-backend/evidence-context` exports three functions:

- `captureSourceReadEvidence({binding, toolCall, receiptID, sourcePath, sourceBytes, range})` derives an exact UTF-8 range and a full raw-byte file SHA from bytes already returned by an owned reader. `range` is one-based, inclusive, with line terminators preserved. Invalid UTF-8, NUL bytes and out-of-bounds ranges reject. This helper opens no file and authorizes no path.
- `captureToolResultEvidence({binding, toolCall, receiptID, content, status, sources})` captures a text result, such as a negative test's original output, bound to **all** relevant Source versions. `sources` is a nonempty array of `{path, sha256}`. Source ranges may also be supplied. `status` is `completed`, `error`, `UNKNOWN`, `pending` or `running`. A completed result can report a failed test: completion is not PASS, integration or release acceptance.
- `restoreCurrentEvidence({binding, ownerStop, records, originalResults, currentSources, messages, maxEvidenceBytes})` returns a cloned `{messages, decisions, evidenceBytes}` without modifying its inputs. It restores only completed, verified records to their existing original tool messages. It never dispatches or retries anything.

`binding` has the same actor/session/Goal/revision/input fields used by the task hook. Capture keeps the original input ID; reuse is permitted on a later input of the **same actor/session/Goal/revision**. Changing any task field invalidates reuse. `ownerStop` must explicitly be false. The host must select only needed records, never send an entire history to this function.

`toolCall` uses the Chat Completions shape `{id, type:'function', function:{name, arguments}}`; arguments is the exact serialized string sent originally. Both name and argument bytes are hashed. The capture result is `{original, content}`. Persist `original` through the host's existing authenticated receipt store, and the returned content through the owned tool-result store. Do **not** reconstruct authoritative `originalResults` from an untrusted cached record when projecting: load the native original outcomes independently. For a plain-text read adapter the captured content is the returned read result. For framed/native read formats retain the original output with `captureToolResultEvidence` and the verified Source binding; do not pretend a reformatted string was the original tool result.

Each `currentSources` entry is `{binding, path, sha256, proofID}`. Its binding must exactly match the **current input**, and `proofID` references the host's existing verified current-byte/version result. Paths are opaque exact identities: no basename matching or implicit aliases. A host-owned version/CAS mechanism can reuse a proof while its version is unchanged and invalidate it on edit; this library does not start a watcher, read a filesystem or infer freshness from a filename, timestamp or merely matching digest string. A forged or stale host proof cannot be detected by this pure projection. If current bytes cannot be verified, omit that proof and retain UNKNOWN. Ensure Source/version/Stop consistency at the existing dispatch boundary; this function does not lock an external filesystem or hold a lifecycle lease.

Outgoing `messages` use the Chat Completions array shape: the original assistant `tool_calls` entry must precede exactly one `role:'tool', tool_call_id:...` message. Missing messages are **not recreated**, changed invocations are not rebound, and duplicate IDs/conflicting records reject. Content is restored only under the original tool role; files and tool results are untrusted data, never system instructions. Native history, reasoning fields, call IDs and unrelated metadata are preserved in the cloned projection. Responses API/native Anthropic messages and attachment results require their own qualified serializer; do not feed them into this adapter.

A compact host-side request assembly (the host functions below are your existing adapters):

```js
import {restoreCurrentEvidence} from 'vantemio-agentic-backend/evidence-context';

export async function assembleMessages(host, sessionID, nativeMessages) {
  const before = await host.evidenceSnapshot(sessionID);
  const projected = restoreCurrentEvidence({
    ...before, messages: nativeMessages, maxEvidenceBytes: 262144,
  });
  // Reconcile SAME current task/Stop, original receipts and Source versions after async work.
  await host.assertSnapshotStillCurrent(before);
  // Trusted status metadata may be exposed by the host; contents stay in tool messages.
  host.recordProjectionDecisions(projected.decisions);
  return projected.messages;
}
```

`decisions` are `current` with the original receipt/input and current proof IDs, or `historical_only` with a reason. Historical output must not be labelled as current Source/test evidence. This does not prohibit the model from reading necessary changed Source through the normal tools. Do not turn a stale-evidence decision into a retry of the original write/test/API call. Original `UNKNOWN`/live/error outcomes are retained as historical and remain subject to the host's existing unresolved-outcome guards. A context projection cannot release claims or authorize continuation.

`maxEvidenceBytes` is an integer from 1 through 1048576. It bounds the sum of unique restored UTF-8 contents only, not the complete prompt or tokenizer estimate. Exceeding it rejects before output is changed; a host must select the necessary range/results explicitly, never pad for cache or silently truncate Source.

## Common host request path

The composed `./request-adapter` API and exact usage shapes are documented in [REQUEST_ADAPTER.md](REQUEST_ADAPTER.md) and [REQUEST_ADAPTER.ru.md](REQUEST_ADAPTER.ru.md). This adds one reusable host request boundary; it does not replace existing admission, authentication, native tools or production authority. The standalone policies above remain usable independently.
