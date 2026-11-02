# Native session restoration

An enabled plugin can start before a persisted agent and its session history have entered the native registry. Reading the agent scope or validating historical usage at plugin import time can fail even though the saved session is healthy.

`bindRestoredNativeAgent` is exported by `vantemio-agentic-backend/enrollment`. It initializes an existing plugin after the exact session is published. It uses the native `agent/created` event and the ordinary `agent/pre-step` boundary, including a warm-load check. Concurrent callbacks share one initialization; a failed initialization retains its original rejection rather than repeating work on each request. Foreign sessions, unpublished agents and aborted restoration cannot initialize the binding.

```js
export const inject = ['agents']; // Also declare services used by installExistingTools.
export async function apply(ctx, config) {
  await bindRestoredNativeAgent(ctx, {
    sessionID: config.sessionID,
    install: agent => installExistingTools(ctx, config, agent),
  });
}
```

The plugin entry must return the host's expected void/disposer result. Do not return the helper's diagnostic status object from `apply`: Cordis rejects it as an invalid effect. Keep normal plugin dependencies declared so native services exist before registering this binding.

The helper creates no session, message, Goal, model request, timer or retry controller. It does not arm a stopped Goal or alter provider selection. The host remains responsible for restoration, tool disposal, original usage verification and its existing schedule. Test the host's creation-event payload and a normal assistant/tool consumer; passing helper fixtures is not a whole-runtime acceptance.

## Русский

Плагин может загружаться раньше сохранённого агента и его истории. Подключайте существующие инструменты и проверку исторического usage через `bindRestoredNativeAgent`, после публикации той же сессии native SDK. Из `apply` нужно вернуть допустимый результат native-плагина, обычно `undefined`; служебный объект helper возвращать нельзя. Механизм не создаёт чаты, запросы, таймеры и цели, не отменяет Stop и не меняет выбранную модель. Исправность подтверждается обычным выполнением агента после загрузки, а не только тестами helper.
