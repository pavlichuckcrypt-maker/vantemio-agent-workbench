# Vantemio Agent Workbench

**Reliability toolkit for autonomous development in OpenCode and other coding-agent hosts.** Provider-neutral policies, tested integration contracts and configuration examples. [Русский](docs/README.ru.md).

Use this toolkit to connect task context, controlled recovery and original-result accounting to an existing agent runtime. This repository shares the reusable parts of our development infrastructure: bounded continuation, original-outcome accounting, provider failure guards, lazy plugin enrollment, request pacing, fresh/cache budget validation, and a pinned catalog of ten upstream engineering/audit skills.

**Scope:** this is not a complete hosted agent, a drop-in OpenCode server, or the private Studio production system. The kit includes common task/context preparation, selected tool-result projection and usage accounting. Native authentication, enrollment, durable admission/storage, transport, peer identity and qualified provider-specific serializers still belong to the host. The policy library does not grant write authority or independently dispatch model requests. Do not deploy it as a replacement backend without testing those integrations.

## Quick start

Node.js 22 or newer. No npm dependencies or install scripts.

```sh
git clone https://github.com/pavlichuckcrypt-maker/vantemio-agent-workbench.git
cd vantemio-agent-workbench
npm test
npm run check:release
npm run smoke:install
```

Import the modules from `src/`, or install this repository as a local package. Configure a copy of `config/request-policy.example.json`. `loadClientRequestBudget(path)` requires an explicit file. `config/agent-profile.example.json` is a reference schema for your adapter, **not** an OpenCode configuration file to paste blindly.

## Principles

- Keep the full current Goal and revision. Bind necessary Source to path, SHA and range; load relevant skills on demand.
- Preserve original request IDs, outcomes, Stop and live tools. Never replay UNKNOWN writes or model admissions.
- Recover only qualified transient failures after the caller checks identity, permissions, live tools, unresolved outcomes and spend limits. Do not retry quota, key or unsupported-model errors.
- A helper wait must not hide an interrupted qualified model request. The shared guard keeps ordinary helper waits intact.
- Measure provider-reported uncached/cached usage. No padding, assumed cache credit, or guaranteed cache percentage.
- Tests, a running process and a completion message are not production acceptance. Verify the normal consumer.

## Contents

| Path | Purpose |
|---|---|
| `src/` | Reusable policies and host integration adapters |
| `config/` | Credential-free request/profile examples and exact upstream skill pins |
| `test/` | Offline isolated regression tests |
| `docs/INTEGRATION.md` | Runtime contracts and what remains deployment-specific |
| `docs/VALIDATION.md` | Verification scope and limitations |
| `THIRD_PARTY.md` | Upstream links and redistribution boundaries |

## Task context hook

`createTaskContextTransform` from `vantemio-agentic-backend/task-context` connects the required-document reader to the host system-transform hook. Each call resolves the current task, reads its documents and rechecks actor/session/Goal/revision/input before appending the full Goal and project context. It preserves existing system entries and rejects Stop, changed bindings, missing documents or oversized context. See the runnable local adapter recipe in [INTEGRATION.md](docs/INTEGRATION.md#bound-system-transform). No provider request is dispatched by this hook.

## Source and result continuity

The `./evidence-context` export restores selected necessary Source/test output to the **same original tool message** after a host compactor replaces it with a reference. It checks original call arguments and receipt/content digests, task binding and current Source proofs. Changed Source or unresolved outcomes remain historical; nothing is rerun or promoted into system instructions. This adapter supports text tool results in the Chat Completions message shape, not every provider protocol. See [the integration contract](docs/INTEGRATION.md#source-and-result-continuity).

## Common request adapter

`./request-adapter` composes task freshness, Source/result continuity, full-body token/byte checks, lifecycle guards and original usage accounting. Integrate its `prepare`, `beforeDispatch` and `observe` methods once in the existing host request path. It creates no controller, model server or retry loop. The default serializer supports Chat Completions/DeepSeek chat; Responses and native Anthropic require an explicitly qualified host serializer, preserving native reasoning/tool blocks and generation settings.

See [the host contract and recipe](docs/REQUEST_ADAPTER.md) or [русское руководство](docs/REQUEST_ADAPTER.ru.md). `./usage` normalizes four explicit usage shapes and reports cache coverage without inventing missing counters or guaranteed percentages.

`./usage-stream` observes Chat/Responses SSE while preserving the consumed provider bytes. `./command-prefix` removes repeated exact leading host prefixes. `./source-view` verifies an explicitly enrolled local alias for read retention without granting Source ownership; see [Source views](docs/SOURCE_VIEWS.md). Native serializers can preserve an already complete trusted context, and an explicit host-estimate mode keeps an unknown hard token bound labelled unknown. These remain host integration contracts, not automatic cache-hit guarantees.

## Known native failures before execution

`./native-tool-outcome` identifies exact terminal native edit validation rejections: identical old/new strings or an ambiguous unique-match replacement before file mutation. It preserves the failed result and binds its original call/input/error/time. The host may use that proof in its existing admission/recovery decision, while retaining all other lifecycle guards. See [the host contract](docs/NATIVE_TOOL_OUTCOMES.md) and [русское руководство](docs/NATIVE_TOOL_OUTCOMES.ru.md). It does not replay a tool or treat failures as successful changes.

## Shared runtime continuity

Version0.6.0 adds authenticated original-result reconciliation, a byte-bounded proof cache, Stop-safe continuation transactions, completed maintenance qualification, explicit Source previews and progress signals. These host integration components preserve native model/provider choice and never replay UNKNOWN operations. See [the integration contract](docs/RUNTIME_CONTINUITY.md) and [русское руководство](docs/RUNTIME_CONTINUITY.ru.md).

## Native root context

Version0.6.1 includes a qualified Harness/pi-ai context plugin that keeps the root contract in the final provider body, preserves frozen/native controls and leaves already prepared calls untouched. Current native task documents can be restored at the provider boundary with exact task/Goal/file bindings; scoped cleanup preserves prepared calls. A separate owner-scope proof avoids disabling a guard when unrelated cache/document settings change. See [the host contract](docs/HARNESS_ROOT_CONTEXT.md) or [русское руководство](docs/HARNESS_ROOT_CONTEXT.ru.md). Optional installed-SDK tests capture three protocol payloads before HTTP; no real key is needed.

Version0.6.2 adds selection of complete observed task-document ranges and authenticated terminal read outcomes. It also returns verified current-task Source priority so a soft context target does not discard necessary code and cause another read. Hard admission and owner Stop remain enforced. It addresses excerpt/offload reread loops without treating file-not-found failures or directory metadata as successful code review. See [task context and read recovery](docs/CONTEXT-AND-READ-RECOVERY.md) and [русское руководство](docs/CONTEXT-AND-READ-RECOVERY.ru.md).

Version0.6.3 adds integrity-preserving structured Source-read presentation, XML/JSON skill metadata deferral, an unbound-generation transport guard and exact native edit no-match classification. Host integration is required; installing a package does not prove a live context hook or provider cache hit. See [final packet integration](docs/FINAL_PACKET.md) and [русское руководство](docs/FINAL_PACKET.ru.md).

## Skills

`config/skills.lock.json` pins Cloudflare Security Audit/Workers Best Practices, Trail of Bits Differential Review/Sharp Edges, Anthropic Doc Coauthoring, Microsoft Playwright CLI, and four Superpowers engineering skills. Use the official installer for your agent, with the exact commit/path from the lock file. These are instruction packages, not correctness guarantees. Do not inject all their text into every request.

## Autonomous operation

Assign one infrastructure maintainer in your existing agent host. It owns shared policy improvements, fleet regression checks and reviewed public updates; product agents keep their own tasks. Load changes at a verified idle boundary, reconcile every maintenance interruption and confirm a normal assistant/tool step afterward. Do not leave agents in a maintenance hold or treat an accepted resume as completed recovery. See the [operating guide](docs/OPERATIONS.md) and [русское руководство](docs/OPERATIONS.ru.md).

The technical package identifier remains `vantemio-agentic-backend` for compatibility with existing imports. The product and repository name is **Vantemio Agent Workbench**.

## Updates

Submit changes on a branch, include behavioral regression tests and update `CHANGELOG.md`. Review the exact publication diff and run the release scan before pushing. Never sync a live agent directory into this repository. No automatic export of private runtime state is installed.

## Security and license

Report suspected vulnerabilities privately through GitHub's private reporting facility when enabled; otherwise contact the repository owner privately. Do not include credentials or private request bodies in issues. This project's code is MIT licensed. Upstream skills retain their own licenses and are linked, not vendored.

Native recovery details and RU/EN guidance: [docs/NATIVE_RECOVERY.md](docs/NATIVE_RECOVERY.md).
