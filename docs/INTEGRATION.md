# Integration contracts

## Native lifecycle

Use native session IDs, original input/outcome IDs, full Goals, revisions and model selections. `lazyBoundHooks` delays binding until enrollment exists and clears failed initialization promises. It does not manage authentication or launch a model server.

## Recovery

`continuation-policy.decide` is a decision primitive, not a complete retry engine. Its caller must enforce a durable intent-before-send ledger, preserve UNKNOWN admissions, verify same actor/Goal/input and never replay tools. `recovery-guards` classifies selected transient stream failures; classification alone never authorizes a request. Maximum two consecutive recovery attempts is the reference configuration; real successes reset accounting, not HTTP200 or model catalogs. Do not generalize arbitrary400 errors to retryable failures. Existing deployment's separate empty400 policy and native transport are not distributed here.

`providerFailureState` requires explicit providerID/modelID. The public version removes private provider bindings. `backend-repair-policy` accounts for changed candidates and requires reconciliation of original UNKNOWN results. Public hardening rejects a changed Source hash when resolving an existing operation.

## Context and cache

The private deployment has native message projection and Source retention adapters. Those adapters are not reproduced by the budget validator. Implement source retention with exact actor/Goal/revision/path/SHA/range, current bytes, read-result identity, bounded size and stale-read rejection. Keep history immutable. Never load an entire filesystem or all skills into a prompt.

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
