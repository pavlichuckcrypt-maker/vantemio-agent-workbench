# Known native tool rejection before execution

`knownNativeNoEffectFailure(part)` from `vantemio-agentic-backend/native-tool-outcome` identifies a precise terminal native `edit` rejection for identical input: `No changes to apply: oldString and newString are identical.` The native call must have a valid original callID, file path, identical string arguments and finite ordered start/end timestamps. It returns a bound failure proof or `null`. It never changes the input part.

```js
import {knownNativeNoEffectFailure} from 'vantemio-agentic-backend/native-tool-outcome';
const proof = knownNativeNoEffectFailure(authenticatedOriginalNativePart);
// proof may distinguish this known rejection from an unresolved mutation.
// Continue through the host's existing lifecycle/admission checks.
```

The proof records the original call, input/error hashes and completion time, with `known_failed_before_execution`, `operationDispatched:false`, no replay and no release approval. The original native state remains `error`. A rejected no-op is not a completed code change or a successful test.

## Host contract

Before using the proof, authenticate the original native result and verify actor/session/full Goal/revision/input and original outcome. Qualify the installed native implementation: this exact rejection must occur before file mutation. Identical-input rejection precedes file processing; ambiguous replacement validation may read the file, but throws before writing it. Error text from an arbitrary subprocess, model or remote service does not establish that guarantee.

The classifier does not observe identity, permissions or process liveness itself. Preserve owner Stop/complete, live tools, all other UNKNOWN outcomes, pending permission, original dispatch ledger and spend/admission limits. A known no-effect failure can unblock only an otherwise qualified SAME task. Use the existing durable model-only continuation after checking accepted/UNKNOWN admissions. Never replay the rejected tool or clear unrelated fences.

In addition, the exact `Found multiple matches for oldString. Provide more surrounding context to make the match unique.` rejection produces `NATIVE_EDIT_AMBIGUOUS_PREWRITE`. It requires a nonempty old string, different new string, omitted or false `replaceAll`, and no partial output. The native unique-match validation throws before writing. See [OpenCode v1.19.3 edit implementation](https://github.com/anomalyco/opencode/blob/v1.19.3/packages/opencode/src/tool/edit.ts). This is a failed edit; a later changed edit belongs to the developer and needs normal admission.

Other arguments or error text, another tool (including a Station edit), missing identity/path/time, running/pending state or inconsistent timestamps return `null`. Other errors require their own original-outcome investigation. Do not ignore all edit errors or infer no effects merely from an error status.

This pure module hashes supplied data. It reads no files, dispatches no model/tool, creates no controller or timer, and grants no Source or publication authority.
