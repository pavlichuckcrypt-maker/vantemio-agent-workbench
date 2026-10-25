# Bound task context hook Implementation Plan

> **For agentic workers:** Implement in this session; no other developer chats or live profiles are in scope.

**Goal:** Make per-request task document freshness usable through an exported system-transform hook, preserving the full Goal and existing system entries.

**Architecture:** The host resolves an authoritative actor/session/Goal/revision/input binding. The hook reads the existing required documents on each call and revalidates the binding before atomically appending context; it never dispatches requests or tools.

**Tech Stack:** Node.js >=22, standard library only.

**Spec:** Current owner Goal; docs/INTEGRATION.md current task documents contract.

## Global Constraints

- No new services, queues, timers, chat messages, live profile changes or model calls.
- Preserve Stop, original native history, current Goals and native tool results.
- Missing, changed or oversized context rejects without modifying output.

## Review Focus

- Binding changes during asynchronous reads: reject before output mutation.
- Stop appears during a read: reject; never resume it.
- Concurrent calls for different sessions: no shared captured task text.
- Required files fail or context exceeds configured bytes: reject, never truncate the Goal.
- Host passes malformed or mismatched session metadata: reject before document access.

### Task 1: Export the bound transform and exercise it through a model/tool caller

**Files:** src/task-context-hook.mjs, test/task-context-hook.test.mjs, package.json, README.md, docs/README.ru.md, docs/INTEGRATION.md, docs/VALIDATION.md, CHANGELOG.md.

**Interfaces:** createTaskContextTransform({resolveTask, maxContextBytes}) returns async (input, output) => void; resolveTask(input) supplies binding, workspaceRoot, fullGoal, projectContext and ownerStop.

- [ ] Add failing regression tests for each Review Focus condition and for a next model request after a normal tool writes an updated required document.
- [ ] Implement per-call reads and two binding snapshots; append one deterministic context entry only after validation.
- [ ] Run relevant regressions and the complete public suite; document exact integration support and limitations in RU/EN.
- [ ] Verify the same portable package on Windows, review the publication diff, run release scan and publish a verified update with GitHub CI readback.
