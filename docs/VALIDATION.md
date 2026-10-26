# Validation and limitations

Verification date: 2026-10-25.

## Private deployment evidence (summarized, no private artifacts published)

- 47 Node test cases passed across14 isolated test files;0 failures/skips.
- 171 backend JavaScript modules passed syntax checks.
- Six existing native chats each completed a new assistant response and tool after one guarded module load.
- Exact Goal-bound local Source was observed in the auditor's outgoing context.
- Original Cloudflare validator suites:65 passed on POSIX; native Windows had seven CLI compatibility failures (not ignored or relabelled).
- Playwright0.1.22 passed an isolated Chrome fixture; this was not a website security audit.

These checks do not cover every possible failure. One historical projection script requires a private captured request and was excluded from the isolated regression suite. Remote provider reliability, private transport behavior, production release, hostile public load and model identity are not certified by these tests.

## Public package

Run `npm test` and `npm run check:release`. Public adaptations remove machine defaults and provider-specific identity and add standalone stop/unknown guards and source-conflict rejection. The release scanner checks the allowlisted source tree for common secrets and deployment identifiers; manual review is still required. No public compatibility claim is made for the full private Studio runtime.

## Model quality

A requested/reported model name and reasoning setting do not attest the underlying model behind a proxy. Judge quality by correct implemented changes, independent tests, adherence to scope and actual consumer behavior. Private reasoning transcripts, internal paths, chat history and model credentials are not published here.

## 0.2.0 task hook

Fourteen new offline regression cases exercise a model-step/tool-step/model-step caller, changed files without recreating the hook, stable unchanged prefix, all five binding fields changing during a read, root/Goal/project-context changes, Stop at both boundaries, missing/oversized documents, invalid sessions and concurrent actor isolation. The caller is an isolated integration fixture; it does not claim a paid provider run or installation of the new hook in live chats. The earlier native deployment evidence belongs to the deployed document reader, not this newly exported wrapper.

## 0.3.0 evidence projection

Twenty-one additional cases cover exact Source-range reuse through an offline model/tool caller, changed Source invalidation, raw CRLF/Unicode SHA/ranges, binary/invalid reads, four task identity changes, current-input proofs, changed original receipts/content/call arguments, unresolved/live/error outcomes, missing messages, duplicate identities, multiple tested Source versions, Stop, byte overflow and preserving untrusted tool data outside system instructions. The caller counts owned reads: unchanged projections reuse the original result without another read; a changed version stops claiming that evidence is current. This is isolated integration evidence, not a live provider or universal protocol-compatibility claim.

`npm run smoke:install` packs the real release tree, installs that archive into a temporary consumer using an empty npm cache and offline/no-scripts flags, and imports the public exports by package name. The installed consumer runs task refresh plus Source reuse across a local tool step, with no provider requests or developer-chat changes. Temporary installation files are removed afterwards.

## 0.3.1 native deadline recovery

The exact typed native deadline previously fell through the transient classifier. The repaired native callback passed isolated deadline/abort/quota checks and admitted only one continuation for the same failed original. After guarded loading at proven idle/unsent boundaries, the affected worker completed a new Source read and a following ordinary step under the same Goal/model. Dispatched model requests and tools were preserved. This qualifies the exact deadline case, not arbitrary timeout strings or permanent provider availability.

## 0.4.0 common host adapter and usage

The installed-package consumer now imports the composed request adapter and usage exports. It prepares a complete task, retains an original read, checks the dispatch boundary, consumes a provider-format usage fixture and preserves missing cache metadata. No provider requests are made by this installation test.

Regression coverage includes all six lifecycle flags (including UNKNOWN model admissions and distinguishing a SAME owned unsent request from another live model), asynchronous task/Source/document changes, post-pacing tokenizer changes, exact body/outcome binding, generation-setting preservation, required full context, qualified native serializer extension points, cache-admission receipts, all four usage shapes, cold/write/unknown/invalid counters, final snapshot deduplication and session-bound failure accounting. The full public suite has 96 cases.

A separate read-only diagnostic checked 40 original natural provider usage records against the new counter normalizer: 30 reported cache counters and 10 missing-cache records matched the existing observer. No paid probes or chat settings changes were performed. This qualifies counter semantics only: diagnostic Goal/input bindings were explicitly synthetic, and no claim of full native admission/Goal attestation is made from that sample.

The new composed adapter is verified through ordinary installed-package model/tool callers with fixture model outcomes, not a new live installation in all six chats. Existing live native document/recovery evidence above remains separate. Native transport, durable ledger fencing, final Source authority, credential access and any custom serializer must be qualified by the integrator; neither offline CI nor this package certifies a complete hosted agent or uninterrupted external services.
