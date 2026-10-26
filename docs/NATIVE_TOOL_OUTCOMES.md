# Known native tool rejection before execution

`knownNativeNoEffectFailure(part)` from `vantemio-agentic-backend/native-tool-outcome` identifies one precise terminal native `edit` rejection: `No changes to apply: oldString and newString are identical.` The native call must have a valid original callID, file path, identical string arguments and finite ordered start/end timestamps. It returns a bound failure proof or `null`. It never changes the input part.

```js
import {knownNativeNoEffectFailure} from 'vantemio-agentic-backend/native-tool-outcome';
const proof = knownNativeNoEffectFailure(authenticatedOriginalNativePart);
// proof may distinguish this known rejection from an unresolved mutation.
// Continue through the host's existing lifecycle/admission checks.
```

The proof records the original call, input/error hashes and completion time, with `known_failed_before_execution`, `operationDispatched:false`, no replay and no release approval. The original native state remains `error`. A rejected no-op is not a completed code change or a successful test.

## Host contract

Before using the proof, authenticate the original native result and verify actor/session/full Goal/revision/input and original outcome. Qualify the installed native implementation: this exact rejection must occur before context/path/permission/filesystem execution. Error text from an arbitrary subprocess, model or remote service does not establish that guarantee.

The classifier does not observe identity, permissions or process liveness itself. Preserve owner Stop/complete, live tools, all other UNKNOWN outcomes, pending permission, original dispatch ledger and spend/admission limits. A known no-effect failure can unblock only an otherwise qualified SAME task. Use the existing durable model-only continuation after checking accepted/UNKNOWN admissions. Never replay the rejected tool or clear unrelated fences.

Different arguments or error text, another tool (including a Station edit), missing identity/path/time, running/pending state or inconsistent timestamps return `null`. Other errors require their own original-outcome investigation. Do not ignore all edit errors or infer no effects merely from an error status.

This pure module hashes supplied data. It reads no files, dispatches no model/tool, creates no controller or timer, and grants no Source or publication authority.
