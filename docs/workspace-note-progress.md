# Workspace notes and automatic continuation

Pass `workspaceRoot` to `terminalProgress` to recognize completed reads/edits/writes of the exact workspace scratch files PLAN.md, WORK.md, CURRENT_WORK.md, TODO.md and PROJECT_LOCATION.md. Native `todowrite` may accompany those operations. A nested product plan, failed or live tool, unrecognized shell command or other unknown operation does not qualify.

The host must pass current task source paths in `workspaceNoteRequiredPaths`. Explicitly required sources are excluded even when named PLAN.md. This classification changes no Source permissions or Goal.

A note-only automatic turn without new evidence receives one existing task-grounded repair. A completed descendant with the same evidence then waits for a real Source/result or external input. Manual turns, changed input or provider/model and new source evidence remain eligible for normal work. Dispatch identities and uncertain outcomes are preserved; no original tool or control is replayed.

`workspaceNoteShellPrefixes` may contain exact trusted bootstrap strings from the host SDK. Only the two documented, anchored `Get-FileHash` / `Get-Item.Length` or hash/length/line-count templates for those same scratch files are recognized, and only after exit zero. This is historical activity classification, never shell admission or permission to execute. Completed empty automatic stops follow the same repair/wait contract.
