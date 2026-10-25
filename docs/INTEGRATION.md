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
