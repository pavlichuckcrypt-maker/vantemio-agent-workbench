# Vantemio Agentic Backend

Provider-neutral **backend policy kit and configuration reference** for autonomous coding agents. [Русский](docs/README.ru.md).

This repository shares the reusable parts of our development backend: bounded continuation, original-outcome accounting, provider failure guards, lazy plugin enrollment, request pacing, fresh/cache budget validation, and a pinned catalog of ten upstream engineering/audit skills.

**Scope:** this is not a complete hosted agent, a drop-in OpenCode server, or the private Studio production system. Transport, native authentication, durable storage, context projection, model-specific serialization, peer identity and real execution adapters must be supplied by the integrator. The policy library does not grant write authority or independently dispatch model requests. Do not deploy it as a replacement backend without testing those integrations.

## Quick start

Node.js 22 or newer. No npm dependencies or install scripts.

```sh
git clone https://github.com/pavlichuckcrypt-maker/vantemio-agentic-backend.git
cd vantemio-agentic-backend
npm test
npm run check:release
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
| `src/` | Nine reusable policy/integration modules extracted/adapted from deployed code |
| `config/` | Credential-free request/profile examples and exact upstream skill pins |
| `test/` | Offline isolated regression tests |
| `docs/INTEGRATION.md` | Runtime contracts and what remains deployment-specific |
| `docs/VALIDATION.md` | Verification scope and limitations |
| `THIRD_PARTY.md` | Upstream links and redistribution boundaries |

## Task context hook

`createTaskContextTransform` from `vantemio-agentic-backend/task-context` connects the required-document reader to the host system-transform hook. Each call resolves the current task, reads its documents and rechecks actor/session/Goal/revision/input before appending the full Goal and project context. It preserves existing system entries and rejects Stop, changed bindings, missing documents or oversized context. See the runnable local adapter recipe in [INTEGRATION.md](docs/INTEGRATION.md#bound-system-transform). No provider request is dispatched by this hook.

## Skills

`config/skills.lock.json` pins Cloudflare Security Audit/Workers Best Practices, Trail of Bits Differential Review/Sharp Edges, Anthropic Doc Coauthoring, Microsoft Playwright CLI, and four Superpowers engineering skills. Use the official installer for your agent, with the exact commit/path from the lock file. These are instruction packages, not correctness guarantees. Do not inject all their text into every request.

## Updates

Submit changes on a branch, include behavioral regression tests and update `CHANGELOG.md`. Review the exact publication diff and run the release scan before pushing. Never sync a live agent directory into this repository. No automatic export of private runtime state is installed.

## Security and license

Report suspected vulnerabilities privately through GitHub's private reporting facility when enabled; otherwise contact the repository owner privately. Do not include credentials or private request bodies in issues. This project's code is MIT licensed. Upstream skills retain their own licenses and are linked, not vendored.
