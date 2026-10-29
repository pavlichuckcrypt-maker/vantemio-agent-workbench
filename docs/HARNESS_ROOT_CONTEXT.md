# Native root context — version0.6.1

The optional `./harness-root-context` plugin preserves a native root instruction contract across a qualified Harness/pi-ai boundary. Some installed SDK combinations build `{systemPrompt, messages}`, while the downstream serializers consume a leading system message in `messages`. The legacy field can disappear from the final body even when user messages, current task data and tool results survive.

`preserveNativeRoot` combines request-level root text and leading native system text in the same order as the SDK. It returns a new frozen request view whose first native developer message becomes a leading pi-ai system message. The original frozen options, history, tool blocks, selected provider/model/reasoning, output budget, signal and authentication remain unchanged. User/tool text is never promoted. Unsupported non-text system content remains the native adapter's validation responsibility.

`installRootCompatibility` qualifies existing native adapter methods by digest, wraps **future** prepare/direct calls and preserves previously prepared calls with their captured route snapshot. The native plugin's `apply` uses the existing adapter registry and `llm/adapters-updated` event for future registrations and cache-evidence invalidation. It creates no actor, request queue, retry loop or server. A matching SDK source/method digest is a compatibility binding, not permission or provider identity evidence.

## Qualify on the actual native host

The core package needs no external dependency. Native integration tests additionally use an already installed compatible SDK and that host's required Node version. The installed SDK qualification used Node24; do not point to another machine's live app directory or guess its SDK path.

```sh
HARNESS_TEST_MODULE_ROOT='<absolute SDK node_modules>' npm run test:native-root
node scripts/qualify-harness-root.mjs '<absolute SDK node_modules>' '<absolute host-owned state directory>'
```

Use the environment syntax appropriate to your shell. The first command exercises the actual SDK and final Responses, Chat Completions and Anthropic serializers with `onPayload` capture before HTTP and a forbidden `fetch`. It also reproduces legacy root loss, checks exact root retention once, paired tools, immutable caller options, future model/provider choice, in-flight snapshot isolation and cleanup. It needs no real key or provider request. The second command prints only roots and SDK/method digests; it does not modify native settings or read credentials.

After the matching SDK tests pass, add this module once through the host's existing plugin manager. For a Harness **patch** profile, a new entry requires `insert`; a plain `id` selector only modifies an existing entry.

```yaml
- insert:
    - id: agent-workbench-root-context
      name: '<absolute package>/src/harness-root-context.mjs'
      config:
        # Use the exact object produced by the qualifier:
        moduleRoot: '<absolute SDK node_modules>'
        stateRoot: '<absolute host-owned state directory>'
        expectedAdapterModuleSHA256: '<qualified module digest>'
        expectedPrepareSHA256: '<qualified prepare method digest>'
        expectedStreamSHA256: '<qualified stream method digest>'
```

Preserve fresh profile bytes and unrelated entries with the host's existing CAS mechanism. Recompose the new entry without unloading the model adapter. Check the actual active plugin, `ROOT_CONTEXT_COMPAT_READY.json`, process identity and the next ordinary same-session assistant/tool consumer. `root-contract-forwarding/<session digest>.json` records only counts, root digest and selected controls before adapter dispatch; it does not store full prompts or credentials and alone is not a successful response receipt. Requalify a changed SDK before using new digests.

Native provider/model/auth selection remains with the SDK. The plugin normalizes context for compatible registered adapters; it does not install providers or make an unsupported model usable.

## Current task artifacts at the provider boundary

Optional `./current-task-artifacts` publishes declared current task documents as byte-bound native developer-data views. The metadata file `CURRENT_TASK_ARTIFACTS.json` binds the exact `TECHNICAL_TASK.md` SHA256, native Goal ID and up to8 declared files. Use `mode: "reference"` for history available on demand. Each inline document and the combined current-document set are bounded to32KiB; an invalid map is not a qualified task source.

The native root plugin can read those views through the same installed artifact producer. This addresses a reproduced boundary where current documents existed in the native Session but were absent from the frozen adapter input. It restores only exact same-session developer views that match the live Goal, current task metadata and physical file bytes. It neither promotes user/tool text nor edits the frozen request/history. The static source map precedes a mutable `PLAN.md`, preserving the other messages' relative order. Local storage is not provider cache usage.

Enable the current artifact producer through the existing host plugin manager and add these optional root config fields:

```yaml
        currentArtifactsModule: '<absolute package>/src/current-task-artifacts.mjs'
        currentArtifactsModuleSHA256: '<SHA256 of that exact installed file>'
```

The producer takes the same `moduleRoot` and `stateRoot`; it uses the native Session's own workspace. The restoration requires its currently active native Goal and matching metadata. A task, Goal or Source change is requalified. Missing/unqualified data is not invented. The ready/forwarding records report artifact version/count/digests, not product acceptance. Verify the next ordinary same-session consumer after loading.

Cleanup belongs to the native Cordis scoped `ctx.effect` lifecycle. Removing the plugin releases its own wrappers, leaves foreign replacements untouched and preserves already-prepared calls. A missing scoped lifecycle is rejected before adapter mutation. An old leaked wrapper is not blindly unwrapped: optional predecessor migration requires exact prior module/method hashes, the expected native prototype and an idle native agent set.

## Stable owner scope

`./scope-policy` exports `qualifyOwnerScopeClause`. A trusted host extractor selects exactly one owner-authorized directive. Whitespace is normalized, path case is preserved, and the clause digest is checked independently of unrelated document/cache fields. Missing, ambiguous, changed or oversized clauses stay unqualified. The host retains its actor/Goal/source binding and enforcement policy; a matching clause alone grants no authority. This prevents an unrelated settings edit from silently disabling a host's scope guard.

Necessary Source can remain inline or be recovered by exact local reference. Allowing a larger cache does not create cache hits. Keep measured provider usage, necessary fresh-input admission, total physical context and full-history compaction separate. The example policy targets15k fresh and permits at most50k necessary fresh/70k cached/80k total; none is a filling target or a guarantee of future cache coverage.
