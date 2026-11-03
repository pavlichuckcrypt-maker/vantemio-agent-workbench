# Two platform backends

OpenCode Watch0.1.3 explicitly adopts shared core0.6.31. Harness0.1.1 remains on core0.6.29. The build checks its previously published dependency closure and entire payload against `config/platform-core-locks/deepseek-harness-chief-0.1.1.json`; it cannot silently substitute changed core files or rebuild a changed payload under the old version. This is a public build provenance check, not an activation of the installed Harness runtime. Each platform still has its own native loader, install root and current-release pointer.

OpenCode Watch and DeepSeek Harness Chief are separate subdivisions. They can reuse pure libraries without sharing mutable runtime configuration or release state.

| Boundary | OpenCode Watch | DeepSeek Harness Chief |
|---|---|---|
| Repository subdivision | `packages/opencode-watch` | `packages/deepseek-harness-chief` |
| Package name | `vantemio-opencode-watch` | `vantemio-deepseek-harness-chief` |
| Manifest target | `opencode-watch` | `deepseek-harness-chief` |
| Initial published package version | `0.1.1` | `0.1.1` |
| Native profile | OpenCode JSON/JSONC | native Cordis YAML |
| Mutable release root | dedicated OpenCode directory | dedicated Harness directory |

Build either independently:

```sh
npm run pack:opencode -- --out-dir /absolute/output/opencode-watch
npm run pack:harness-chief -- --out-dir /absolute/output/deepseek-harness-chief
```

The builder requires an explicit target. It includes the target's entry point and its shared-library dependency closure, not the other platform's SDK adapters. An existing version with different archive bytes is refused: bump that platform package's own version instead of overwriting it. A library update is not automatic permission to deploy both backends.

Each platform package pins `workbenchCoreVersion`. If the repository's shared library changes version, building that platform is refused until its dependency is explicitly adopted. Updating one target does not silently rebuild or install the other with a different core. The target identifies the host application, not a model or provider: native provider/model/reasoning selection remains independent.

A supervisor running in Harness may deliberately maintain the OpenCode watch, but must select the OpenCode updater and OpenCode package for that operation. The caller's own platform never changes the package's installation target.

An installation descriptor is owned by the host, never supplied by the archive. It records `runtimeTarget`, `host`, `installRoot`, `currentReleaseFile` and `configFile`. `assertRuntimeTarget` checks target/package identity, host and native configuration kind. `assertSeparateRuntimeInstallations` rejects shared or nested mutable roots and shared profile/pointer paths. Destination fields in a release manifest are refused.

`stageRuntimePackage` verifies every payload path/hash before writing, including actual root separation and destination junctions. It creates a version directory and `STAGED_RELEASE.json` under only the selected root. **It does not modify the native profile, change CURRENT_RELEASE.json or activate/restart a runtime.** The existing host loader performs its normal Source/CAS, Stop/live/UNKNOWN and callback/ordinary-consumer qualification before activation. Integrate the target's `verifyInstallation` or guarded `applyPlatformRelease` at the start of that loader. A pure target check is not an OS sandbox against unrelated arbitrary shell writes.

Shared source is versioned inside each package. There is no single mutable shared `CURRENT` release or ZIP that can select either platform implicitly. Keep legacy receipts as historical provenance; annotate an old locator with its actual platform rather than moving live source, profiles or histories.

## Русский

Два подразделения — два пакета, два канала установки и две native-конфигурации. OpenCode-пакет нельзя применять к Harness, Harness-пакет нельзя применять к OpenCode. Общий корневой пакет — библиотека, не универсальный backend-установщик. У каждого подразделения независимая версия; общий код находится в его собственном версионированном пакете.

Проверка target выполняется до записи. Подготовка релиза пишет только в выделенный каталог выбранного подразделения; рабочий профиль, CURRENT_RELEASE и другой runtime не меняются. Активация и откат выполняются существующим загрузчиком этой платформы с сохранением Goal/history/Stop/live/UNKNOWN. Не копируйте готовые профили, ключи или историю между подразделениями и не называйте staging доказательством загрузки.
