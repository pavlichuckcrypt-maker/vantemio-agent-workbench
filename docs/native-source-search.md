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

An explicit generated-archive directory search can still reach a native grep parser limit on a very large single-line JSON record. This helper changes source-discovery defaults; it does not patch that parser. Use an exact retained identity or a file filter for intentional archive lookup, preserve the original failure, and qualify any native parser repair separately. A successful default search is not evidence that every explicit archive query is supported.
