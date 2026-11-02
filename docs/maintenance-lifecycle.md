# Maintenance release and continuation

The host must keep an owned unsent hold active while loading and verifying the new plugin. Publish the verified release before clearing the hold. A startup-only continuation check can otherwise run while held and never receive another idle event.

`reconcileMaintenanceStartup` from `vantemio-agentic-backend/maintenance-hold` bridges that interval using the host-provided inline `wait`, fresh `snapshot`, and existing guarded `resume`. It does not create a background watcher, reset an instance, send a request, or execute a tool itself. It only waits for this one owned maintenance operation, for at most ten minutes. Ordinary development is not paced or limited by this helper.

The snapshot provides current `state`, `binding`, and `disposed`. The host must mark disposed contexts and keep its ordinary controller responsible for provider/model selection, release/PID/manifest qualification, current input, permissions, live tools, CAS and immutable dispatch receipts. A helper result with `resumed: true` means the controller was invoked; it does not prove dispatch, model success or product acceptance.

Active owner Stop, completion, another operation or Goal revision, and disposed contexts prevent continuation. An explicitly inactive historical Stop record remains history. The helper never clears Stop or dispatch entries, and never resends accepted or UNKNOWN work. A pending timeout is not success.

Acceptance requires a new ordinary model/tool/Source consumer after the verified release. Module readiness and unit fixtures support that check; neither substitutes for it.
