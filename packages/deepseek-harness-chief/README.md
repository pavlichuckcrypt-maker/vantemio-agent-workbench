# Vantemio DeepSeek Harness Chief

This package belongs only to DeepSeek Harness Chief. Its target is `deepseek-harness-chief`; its host configuration is the selected native `cordis.patch.yml` profile.

Build from the repository with `npm run pack:harness-chief -- --out-dir /absolute/output`. The artifact is `vantemio-deepseek-harness-chief-0.1.1.tgz`. Its version and installation channel are independent of the OpenCode watch.

The package contains native integration helpers and a pinned copy of the shared library. The host declares its native services and awaits restored-agent initialization. Provider credentials, private adapters, goals and session history stay in the existing host. Use `verifyInstallation` before the existing qualified loader, or `applyPlatformRelease` to guard its callback. The host-owned installation descriptor supplies all destinations; the archive cannot select them.

Do not apply this package to OpenCode. Passing these component checks is separate from verifying a real native assistant/tool consumer after loading.

## Русский

Отдельный пакет backend шефа DeepSeek Harness. У него собственные версия, архив, native-профиль, загрузка и откат. OpenCode-вахта — другое подразделение и другой пакет. Общая библиотека не объединяет runtime-настройки, историю, Goal или указатели релизов. Пакет не создаёт новых агентов, серверов или таймеров.
