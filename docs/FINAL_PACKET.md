# Final request packing and native outcome recovery

These modules extend an existing agent host. They do not install providers, select models, change permissions, own production, or add a scheduler.

Use one common host integration for current and future enrolled chats. The native SDK retains provider, model, variant and authentication selection. Role defaults are not model pins.

Before allowing a continuation, initialize the actual native plugin and inspect its registered tools and required context/header hooks. A successful skill-catalog read is insufficient: skills may be available even when the request plugin did not load.

At the existing provider transport, `assertGenerationBinding(input, init, {headerName})` rejects unbound generation shapes before dispatch. Apply it at the native provider boundary; the existing verifier must still authenticate any supplied binding and enforce lifecycle, budget and permissions. The helper accepts a header's presence, not its truth. It performs no network request and does not replay a tool.

Pack in this order:

1. Bind the current native Goal/task/revision, owner input, Stop, required documents and actual original Source/results.
2. Keep explicit necessary Source and current task dependencies. A changed-SHA observation is not the declared Source version: retain that difference and original receipt, but do not promote every old overlapping Goal hint into an unlimited hard pin. Exact task/Goal/source bindings and unfinished operations remain the host's responsibility.
3. Reduce optional historical observations and duplicate metadata. `presentSkillCatalogOnDemand(body)` understands the native XML and compact JSON catalogs, defers only locations, and preserves every advertised name and full description. Installed skill files and tool schemas are untouched; resolve a location through the native skill tool when needed.
4. For an authenticated completed read of a structured JSON snapshot, call `presentStructuredRead(originalText, {callID, file, sha256})`. It checks the exact result digest. Source arrays and multiline strings become length-bound text blocks; `decodeStructuredRead` reconstructs every JSON value and checks integrity. Statuses, paths, ranges and original references remain data, not execution or review authority. Archive the exact original in the existing local result store before forwarding the presentation. The helper itself reads and writes no files.
5. Measure the fully composed serialized body after every representation stage. Apply the current host fresh/total limits and calibrated provider evidence. Do not assume a cache hit, lower calibration or raise limits to hide excess context. Never resend an unchanged rejected packet as though another retry would make it smaller.
6. Dispatch once under the existing ledger. Verify the next ordinary generation and tool/result consumer; configuration, import success and HTTP200 alone are insufficient.

`normalizeGraphToolInput` repairs only an exact supported argument-envelope representation. It never infers a project, symbol or permission. `planClientRead` recognizes a small static read grammar and returns a plan for an existing authorized adapter; it does not execute commands. Compound syntax, writes, traversal, sensitive paths and ambiguous graph roots are not silently routed to another host.

Classify tool outcomes from authenticated original native records. Known prewrite edit validation failures remain FAIL and can permit model-only continuation after host checks. Genuine unknown writes/exec, live tools, owner Stop/complete and accepted/UNKNOWN delivery IDs remain protected. See [native outcomes](NATIVE_TOOL_OUTCOMES.md).

Inspect original provider usage for actual cached/fresh input. Stable local storage and successful packing do not attest a provider cache hit, physical upstream model identity, lower cost, or uninterrupted service.
