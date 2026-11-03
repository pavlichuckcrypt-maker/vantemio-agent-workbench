# Vantemio OpenCode Watch

This package belongs only to the OpenCode watch. Its target is `opencode-watch`; its host configuration is `opencode.json` or `opencode.jsonc`.

Build from the repository with `npm run pack:opencode -- --out-dir /absolute/output`. The artifact is `vantemio-opencode-watch-0.1.3.tgz`, with shared core0.6.31. Its version and installation channel are independent of DeepSeek Harness Chief.

The entry exports the request adapter, native grep integration, Station read-envelope parser, native read metadata matcher and verified local archive cache. The host authenticates native rows and current task/Goal, supplies scoped original readers and owns final provider serialization and admission. Use the shared envelope parser for cache lineage too: a valid coverage trailer follows the receipt. Keep actually requested cache ranges for selected dependencies of the same task, then check their presence after SDK pruning and final composition. A local cache or HTTP200 is not provider-cache evidence or product acceptance.

The package contains integration code and a pinned copy of the shared library. It does not contain provider keys, private adapters, chat history or a ready-to-copy live host profile. Use `verifyInstallation` before the existing host's qualified loader, or `applyPlatformRelease` to guard that loader callback. Resolve the installation descriptor from the host-owned registry; the archive cannot choose a destination. Wrong target, host, profile kind or release pointer is rejected before the callback.

Do not apply this package to a DeepSeek Harness profile. Shared code does not imply shared settings, lifecycle, release state or rollback.

## Русский

Инструменты надёжной работы команды OpenCode: контекст, проверка результатов чтения, локальный кэш, grep и безопасное продолжение. У пакета собственные версия, архив, конфигурация и канал установки. Пакет DeepSeek Harness Chief сюда не устанавливается. Общая библиотека включена как версионированная зависимость, без общих изменяемых настроек и указателя релиза. Активацию выполняет существующий host loader после проверок Source/CAS, Stop и живых операций. Проверяйте сохранность нужных фрагментов кода в конечном запросе, включая чтения из кэша; локальное хранение не доказывает кэширование у провайдера.

Verified cached Source is presented as one code range with original Source coordinates. Nested read wrappers and duplicate original representations can be omitted only when native output hashes, Source SHA and full observed coverage agree. The full original responses remain available locally. This is request presentation, not fresh CAS or an assertion of a provider cache hit.
