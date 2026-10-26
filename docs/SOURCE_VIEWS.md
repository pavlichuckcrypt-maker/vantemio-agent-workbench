# Source views in an existing host

[Русский](SOURCE_VIEWS.ru.md).

`vantemio-agentic-backend/source-view` checks an explicitly approved workspace view of an existing source tree. A symbolic link or Windows directory junction can expose the same files without copying a repository. The functions manage no mount, server, queue, model, Goal or Source claim.

The host supplies its actual current actor/session/Goal/revision, Stop state, execution-host identity and approved source roots. Do not derive approval from model output, a retrieved document or a matching basename. `expectedHost` compares supplied metadata; it does not remotely attest a machine or determine production authority.

```js
import {qualifySourceView, qualifySourceViewFile}
  from 'vantemio-agentic-backend/source-view';

const view = await qualifySourceView({
  binding: host.currentBinding(),
  expectedHost: host.executionHost,
  workspaceRoot: host.workspaceRoot,
  declaredSourceRoots: host.approvedSourceRoots,
  ownerStop: host.ownerStop(),
  view: host.enrolledSourceView,
});
const sourcePath = await qualifySourceViewFile(view, host.requestedPath);
const bytes = await host.readApprovedBytes(sourcePath);
// Capture original read evidence with these bytes through the existing read adapter.
```

`enrolledSourceView` has schema `agent.source-view/v1`, a matching `binding`, `host`, `viewRoot` and `sourceRoot`. The binding contains `actorID`, `sessionID`, `goalID` and integer `revision`. Roots and requested paths are absolute paths in the executing host's filesystem namespace.

The view must be a workspace child whose physical parent is still in that workspace. Its actual target must equal an approved source root. File qualification rejects traversal, sibling-prefix confusion, retargeted views and nested links escaping the source root. It returns a resolved path; it does not read or execute that file.

The returned frozen view has `readOnlyObservation: true` and `sourceOrClaimAuthority: false`. Its digest binds the supplied scope and resolved roots, not file contents, filesystem permissions or ownership. The host still owns permission checks, fresh byte/range hashes, claims, concurrent edits, original results and CAS before a mutation. Requalify at the ordinary current-task boundary; a retained view is not permission to reuse an old Goal or resume Stop/UNKNOWN work.

This module can support retaining already-read local source under a qualified view. It does not decide which files an agent needs, issue another read, grant a larger context window or prove a feature was implemented.
