# Changelog

## 0.3.0 — 2026-10-25

Add portable Source/result capture and projection for existing Chat Completions text tool messages. Preserve exact original invocation/receipt and Source versions; changed/unresolved evidence remains historical without tool replay. Add 21 regression cases and RU/EN host integration contracts. No new storage authority, reader, watcher or live chat settings.

## 0.2.0 — 2026-10-25

Add an exported bound system-transform hook around the per-request document reader. It preserves the full Goal/project context and existing system entries, checks actor/session/Goal/revision/input before and after reads, and rejects Stop or inconsistent/oversized context without dispatching. Add a host-adapter recipe and offline model/tool caller regressions. No live agent settings or tasks are changed.

## 0.1.1 — 2026-10-25

Read required task documents for each system transform, avoiding stale initialization snapshots. Filesystem regression checks cover updates, missing/unreadable documents and separate workspaces.

## 0.1.0 — 2026-10-25

Initial public policy/configuration reference. Seven reusable modules, credential-free profiles, ten pinned upstream skills, offline tests and RU/EN documentation. Private runtime adapters and product code excluded.
