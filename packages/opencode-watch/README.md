# Vantemio OpenCode Watch

This package belongs only to the OpenCode watch. Its target is `opencode-watch`; its host configuration is `opencode.json` or `opencode.jsonc`.

Build from the repository with `npm run pack:opencode -- --out-dir /absolute/output`. The artifact is `vantemio-opencode-watch-0.1.1.tgz`. Its version and installation channel are independent of DeepSeek Harness Chief.

The package contains integration code and a pinned copy of the shared library. It does not contain provider keys, private adapters, chat history or a ready-to-copy live host profile. Use `verifyInstallation` before the existing host's qualified loader, or `applyPlatformRelease` to guard that loader callback. Resolve the installation descriptor from the host-owned registry; the archive cannot choose a destination. Wrong target, host, profile kind or release pointer is rejected before the callback.

Do not apply this package to a DeepSeek Harness profile. Shared code does not imply shared settings, lifecycle, release state or rollback.

## Русский

Отдельный пакет backend OpenCode-вахты. У него собственные версия, архив, конфигурация и канал установки. Пакет DeepSeek Harness Chief сюда не устанавливается. Общая библиотека включена как версионированная зависимость, без общих изменяемых настроек и указателя релиза. Активацию выполняет существующий host loader после проверок Source/CAS, Stop и живых операций.
