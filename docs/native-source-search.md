# Native source discovery and current Source pages

`defaultNativeSourceSearch(tool, args)` from `./tool-read-boundary` returns `{args, changed}` without mutating caller arguments. For `grep` with no path and no include, it supplies the native ripgrep glob `!**/.opencode-state/**`. Other tools, explicit paths and explicit filters pass through unchanged. Apply it only after existing task-root, host and realpath/junction validation. Keep the original call identity and disclose the effective default in tool help and result metadata. It grants no filesystem permission and does not intercept explicit archive reads.

Native SDK hook adapters should update the existing argument object. Some callers retain that object after the void hook returns; assigning a different `output.args` object is insufficient for those callers:

```js
const search = defaultNativeSourceSearch(input.tool, output.args);
if (search.changed) Object.assign(output.args, search.args);
```

Qualify this with a caller that keeps its original `args` reference, then check the effective native result. A helper test alone does not prove integration.

Generated state can contain large single-line JSON records. Increasing a parser limit or forwarding that archive into the model does not make it useful Source. The real-ripgrep regression keeps ordinary Markdown and Python matches and verifies that intentional archive access still works.

For context projection, preserve the full selected current read whenever it fits the hard budget. If a verified current group overflows, page its optional ranges within the unchanged hard bound and identify omitted archive rows explicitly. Allocate space across selected current files; do not erase one file completely while forwarding a different file in full merely because a normal target cannot be attained. Keep required Goal/Source bytes, native tool outcomes, original SHA and local references intact. A partial page never proves a complete audit, fresh CAS or provider cache hit.

Runtime host adapters still require their own frozen-original regression and normal-consumer verification. The portable helper does not install a watcher, change provider/model selection or perform retries.

## Native long-line repair (0.6.22)

The native 1.19.x parser rejects matching JSON records above 64 KiB before rendering a line preview. `createNativeGrepTool` uses the supported same-name tool override, keeping `grep` rather than adding another search service. It uses native ripgrep regex/glob matching with NUL-separated paths and bounded text previews before transport. Exact files stay exact; missing paths fail without searching their parent. The result distinguishes no matches, partial search and truncated previews. Read complete Source before editing or approving omitted code.

Example global OpenCode plugin:

```js
import {tool} from '@opencode-ai/plugin';
import {createNativeGrepTool} from 'vantemio-agentic-backend/native-grep-tool';
import {workspaceGrepScope} from 'vantemio-agentic-backend/native-grep-scope';
import {defaultNativeSourceSearch} from 'vantemio-agentic-backend/tool-read-boundary';

export default async ctx => ({
  tool: {grep: createNativeGrepTool({
    tool, root: ctx.directory,
    validateScope: workspaceGrepScope(ctx.directory),
    normalizeArgs: args => defaultNativeSourceSearch('grep', args).args,
  })},
});
```

Use an existing stronger host/task validator when available. The factory requires a validator and calls native `grep` and, where applicable, `external_directory` permission before execution. It preserves the native AbortSignal. Binary discovery checks configured PATH entries and OpenCode's existing cache; a host may supply `executable` explicitly. It does not install executables, create model requests or widen filesystem permissions. The low-level execution helper alone is not an authorization layer.

Core previews use 2,000 columns, at most 100 displayed matches and a bounded result size; these are tool output limits, not agent action quotas. An explicit archive query is supported and is never silently changed into an exclusion query. Only a search without path and include uses the generated-state exclusion.

Native reference: https://github.com/anomalyco/opencode/blob/v1.19.3/packages/core/src/ripgrep.ts
Plugin registration: https://opencode.ai/docs/plugins/#custom-tools
