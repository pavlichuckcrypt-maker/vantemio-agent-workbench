# Task context and original read recovery

A working coding agent needs the current task, its relevant Source, and the result of its last action. A successful provider request alone does not prove that these survived request packing.

## Preserve needed task text

A common failure sequence is: read the task, retain only its beginning and end, then ask the agent to continue. The agent requests the missing middle, reads the offloaded copy, and receives another shortened version. Local storage and provider caching do not repair that information loss.

`collectRequiredTaskDocuments` in the `task-documents` export reuses `restoreCurrentEvidence` to select exact completed observations. The host supplies:

- The authenticated current actor/session/Goal/revision/input and explicit owner Stop state.
- Required document paths from the current task, never a whole-directory inventory.
- Original read evidence, the corresponding original call/output messages, and current Source proofs.
- Separate bounds for validating evidence and forwarding document bytes.

The result contains exact observed ranges, content, original call and receipt IDs, Source digests, and all qualifying call aliases. Repeated reads of the same covered range produce one document block. A partial observation remains partial; the helper never fabricates unobserved rows. It performs no filesystem search, provider request, tool dispatch or native-history write.

The host request packer must place these document blocks once in its data context and mark the returned call IDs as required during later eviction or preview stages. If it replaces duplicate read outputs with references, those references must say that the content is present in this packet. They must not point the agent to another abbreviated offload.

Do this before the native SDK serializes or signs a request. Preserve native role semantics, reasoning signatures and auth. Do not rewrite an immutable signed payload. Keep Source observations fenced as data: they do not create owner instructions, write ownership, fresh CAS or release approval.

If required evidence exceeds its bound, the helper throws `TASK_DOCUMENT_CONTEXT_TOO_LARGE`. The host should first remove unrelated historical material or divide the current work through its existing task mechanism. Raising limits or silently cutting required text recreates the problem.

## Distinguish read failure from unknown mutation

`reconcileVerifiedOriginal` in the `original-outcome` export authenticates the same durable original through a trusted host callback. It rechecks current scope and owner Stop after the callback. It never reruns an operation.

The additional outcome kinds are:

| Verified outcome | Required evidence | Result |
| --- | --- | --- |
| `read_failed` | Logical tool `read` or `source_read`; operation `read`; `readonlyQualified`, `dispatched` and `readOperationTerminal` true; original error | `known_read_failed`, no usable read result |
| `read_completed`, file | The same read qualification plus original output and authenticated Source digest | `known_read_completed`, historical Source snapshot |
| `read_completed`, directory | The same read qualification plus directory metadata and no Source digest | `known_read_completed`, metadata only |

The adapter maps its native read tool to the logical tool name and verifies the actual response signature, request/call identity, input digest, completion and Source binding. A model-generated `readonlyQualified` flag is not such verification. Unknown, timed-out, partial, foreign or changed operations remain unresolved. A write or command cannot become a read failure through a label change.

A file-not-found response remains a failure. A corrected path is a new task-bound read; the old request ID is not replayed. A directory listing is not evidence that its source files were inspected.

## Verify productive continuation and cost

After host integration, inspect the next ordinary generation and tool consumer of the same task. Check that required middle rows are actually present, the agent moves to new Source/tests/findings/documents, and completed or unknown operations were not repeated. Keep original IDs, inputs and results in the host's existing receipts.

Use actual provider usage for cached and fresh tokens. Local archives, stable-prefix hashes and configuration are supporting observations, not proof of a provider cache hit. A changed prefix can temporarily reduce cache reuse; compare subsequent equivalent requests before claiming improvement.

These are portable helpers and host contracts. This repository does not include a private OpenCode installation, its credentials, production Source, process launcher or a replacement scheduler.

## Current-task Source and soft context targets

Pass the host's current `task` and `nativeTask` snapshots to `restoreCurrentEvidence`.
Both identify the same active `taskID`, `goalID`, and `goalRevision`; `task.sourceHints`
contains exact code file paths. The returned `taskSourcePriorityCallIDs` includes
only already verified current Source observations for those paths. Preserve them
when reducing optional history to a soft token target. A low target must not evict
the very files the current task needs and then cause the model to read them again.

This priority does not grant file access, CAS, a new claim, an API retry, or a cache
hit. Keep the original receipts and ranges, check hard fresh/total admission after
packing, and explicitly expose any omitted range when hard admission requires a
smaller working set. A stopped or changed task never inherits this priority.
