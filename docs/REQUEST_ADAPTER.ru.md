# Общий адаптер запросов и usage провайдера

[English](REQUEST_ADAPTER.md). Node.js >=22; npm-зависимостей и install-скриптов нет.

## Граница работы

`createAgentRequestAdapter` из `vantemio-agentic-backend/request-adapter` возвращает `prepare`, `beforeDispatch`, `observe`. Он объединяет актуальную цель и документы, сохранённые результаты, проверку тела запроса и учёт исходного usage. Он не создаёт сервер, очередь, хранилище, планировщик или цикл повторов; не отправляет сообщения разработчикам и не меняет их цели, модели, TODO и историю.

Авторизация, реестр агентов, физический Source, CAS, нативный Stop, долговечный журнал исходных допусков и транспорт остаются в существующем host. Это библиотека интеграции, а не готовый hosted агент или замена всего OpenCode.

## Один раз подключить к существующему пути

```js
import {createAgentRequestAdapter} from 'vantemio-agentic-backend/request-adapter';
import {pacedFetch} from 'vantemio-agentic-backend/pacing';

const adapter = createAgentRequestAdapter({
  policy: host.requestPolicy,
  format: 'chat-completions',
  resolveTask: input => host.currentTask(input.sessionID, input.requestID),
  resolveEvidence: input => host.currentEvidence(input.binding),
  measureInput: input => host.inputTokenUpperBound(input),
  assertSnapshotCurrent: input => host.assertRequestSnapshot(input),
});

export async function runExistingNativeRequest(input) {
  const prepared = await adapter.prepare(input);
  const admission = await host.admitOriginalOnce(prepared.binding);
  if (admission.action !== 'send') return host.originalOutcome(admission);
  return pacedFetch({
    ...host.pacingPaths,
    sessionID: prepared.binding.sessionID,
    requestID: prepared.binding.requestID,
    dispatch: async (url, init) => {
      await adapter.beforeDispatch(prepared);
      return host.nativeTransport(url, {...init, body: prepared.serializedBody});
    },
  }, host.nativeURL, {...host.nativeInit, body: prepared.serializedBody});
}
```

Методы `host` — ваш существующий контракт, не API этой библиотеки. Допуск сохраняется до отправки с SAME request ID и SHA тела. Accepted/UNKNOWN возвращают исходный результат и не отправляются повторно. Ошибка после возможной передачи байтов остаётся UNKNOWN; доказанный отказ до отправки фиксируется как unsent в существующем журнале. Не повторять неопределённую отправку под новым ID. `beforeDispatch` вызывается после ожидания pacing, прямо у штатного транспорта. Один и тот же ID передаётся в pacing и учёт usage: нельзя выдавать независимый ID наблюдения за ID исходного запроса.

Результат и usage читает обычный нативный потребитель ответа/стрима. Не добавлять второго читателя живого стрима ради этой библиотеки. `pacedFetch` сам по себе не даёт межпроцессной транзакционной очереди.

## Входы и проверки

`prepare({sessionID, requestID, payload})` принимает исходный JSON-запрос. Его `model` должен совпадать с текущей нативной моделью. Функции, циклы, NaN/Infinity, sparse arrays, getters и другие не-JSON значения отклоняются вместо молчаливого изменения.

`resolveTask({sessionID, requestID})` возвращает [полный task contract](INTEGRATION.md#bound-system-transform): binding actor/session/Goal/revision/input, разрешённый абсолютный корень, полную цель и проверенный архитектурный контекст. Дополнительно нужны `providerID`, `modelID` и явные boolean-поля `ownerStop`, `busy`, `pendingPermission`, `liveTools`, `unknownTools`, `unknownAdmissions`. Нет поля — состояние неизвестно, запрос удерживается. Любое true также удерживает запрос, кроме доказанного SAME запроса в unsent-фазе: при `busy:true` host должен вернуть `activeRequestID === requestID` и `activeRequestPhase: preparing` либо `waiting_unsent`. Это позволяет готовить собственный нативный шаг, когда UI уже показывает Busy. `dispatched`, UNKNOWN и чужой request ID блокируются; UI Busy сам по себе не является доказательством владения.

`resolveEvidence({binding})` возвращает `{records, originalResults, currentSources}` по [контракту сохранения результатов](INTEGRATION.md#source-and-result-continuity). Если они сейчас не нужны, вернуть пустые массивы. Оригинальные квитанции читаются независимо из доверенного журнала; актуальные версии берутся из существующего Source/CAS. Версия изменилась — прошлый результат остаётся историей. Текст исходника не становится системной инструкцией.

`measureInput({serializedBody, providerID, modelID})` возвращает `{inputTokenUpperBound, method}` для всего точного тела, включая инструменты и накладные расходы модальностей. Нужен проверенный tokenizer/консервативная граница host для данной модели. Подсчёт символов или байтов не является универсальным tokenizer. Без измерения или при его изменении отправка удерживается. Библиотека проверяет общий предел токенов и UTF-8 байтов; output/reasoning параметры не уменьшаются.

`assertSnapshotCurrent({task, evidence, prepared, dispatchBoundary?})` проверяет текущие версии Source/документов, допуск и нативный lifecycle. Callback вызывается при подготовке и перед отправкой; после async-операций снова проверяются Stop и задача. Перед транспортом повторно проверяются SHA тела, цель, контекст, документы, версии и граница токенов. Внешнюю файловую систему/процессы эта функция не блокирует: существующий host сохраняет окончательный fence/lease на границе отправки.

## Большой необходимый кэш

Исторический cache hit не гарантирует следующий. Автоматический исторический cache credit равен нулю. Когда общий token bound превышает `maxFreshInputTokens`, оба вызова проверки host обязаны вернуть:

```js
{cacheAdmission: {
  qualified: true,
  receiptID: 'original-host-cache-admission',
  binding: prepared.binding,
  expectedFreshInputTokens: 15000,
  observationKind: 'bound_prefix_estimate' // либо 'provider_admission'
}}
```

Квитанция относится к точному actor/provider/model/Goal/input/request/body SHA. Ожидаемый свежий ввод должен укладываться в выбранный предел. Host проверяет необходимый префикс, фактический usage соответствующего протокола, актуальность и политику расходов. Пустой callback, чужой cache hit или число без привязки большой запрос не допускают.

Оценка префикса всё равно может промахнуться при вытеснении кэша или изменении upstream-маршрута. Квитанция делает это явным и не обещает процент кэша. Не добавлять мусор ради hit rate, не запускать платный prewarm/probe. `observe` покажет фактическое превышение свежего/общего/кэшированного лимита, включая холодный промах; превышение не скрывается и не запускает автоматический retry.

## Разные протоколы

Встроенная проекция поддерживает Chat Completions и DeepSeek chat. Сохраняются исходные system/developer записи и tool identities; полный доверенный task context добавляется стабильно, нужные сохранённые результаты возвращаются в исходные tool messages.

Для Responses/native Anthropic передать проверенный `projectRequest({binding, format, payload, taskContext, evidence, maxEvidenceBytes})`, возвращающий `{payload, evidenceDecisions}`. Непустые native evidence требуют отдельной проверенной проекции. Нельзя автоматически переименовывать поля thinking/signature/encrypted reasoning или превращать native blocks в Chat Completions. Сохранять IDs, подписи, call/result и порядок. Общий код разрешает менять только контекстные поля; модель, output budget, reasoning и остальные настройки сохраняются. Полный task block должен оставаться в system/developer-контексте. Тестовый сериализатор не подтверждает совместимость всех версий чужого API.

Prepared record заморожен в памяти и содержит точные байты/SHA, binding, хэши снимков, измерение, квитанцию кэш-допуска и решения по evidence. Сохранять его в существующем аутентифицированном журнале. SHA — контроль целостности, а не подпись или право на отправку.

## Уже подготовленный native-контекст и оценки токенов

Проверенный custom projector может вернуть `contextRepresentation: 'native-values'`, когда штатный сериализатор уже передаёт полные `fullGoal`, `projectContext`, `technicalContract`, `requirements`. Адаптер проверяет каждое значение в доверенном system/developer-тексте, обычном или JSON-escaped, и не добавляет второй блок. User/tool-текст этой проверке не соответствует. Режим сохраняет native-пакет, но не аттестует чужой сериализатор или Source.

По умолчанию требуется верхняя граница токенов. Host с существующим калиброванным оценщиком может явно включить `allowHostEstimatedInput: true` и вернуть из `measureInput` `{inputTokenUpperBound: null, estimatedInputTokens, method}`. Оба snapshot callback тогда обязаны вернуть:

```js
{inputAdmission: {
  qualified: true, receiptID: 'existing-native-budget-receipt',
  binding: prepared.binding,
  expectedTotalInputTokens: 25000, expectedFreshInputTokens: 15000,
  observationKind: 'calibrated_estimate' // либо 'native_estimate'
}}
```

Оценки fresh/cache/total должны укладываться в политику. `preflight.inputTokenUpperBound` остаётся `null`, `hostInputAdmission.hardTokenBoundKnown` — `false`: локальная оценка не становится жёсткой границей провайдера. Режим не даёт автоматического исторического cache credit и не заменяет обязательный `cacheAdmission`. Окончательные native fences и фактический usage остаются обязательными.

## Стрим, префиксы команд и локальные Source aliases

`observeUsageStream(response, {onUsage, onObserverError})` из `./usage-stream` наблюдает Chat/Responses SSE в том же потребляемом стриме. Байты, status и headers сохраняются; сбой учёта не ломает генерацию. Callback получает `(snapshot, completed)` с исходными usage/model/response ID. Нормализовать по исходному prepared binding; final допустим только при `completed: true`. Terminal error сохраняется и после позднего usage/`[DONE]`. Не-SSE ответы не меняются. Агрегация раздельных native Anthropic events в этот контракт не входит.

`prefixCommandOnce(command, ownedExactPrefix)` из `./command-prefix` оставляет один точный ведущий host-префикс. Вхождения внутри команды не меняются. Это не shell parser и не разрешение на выполнение; перед подключением проверить существующие original-action fences.

`./source-view` проверяет явно зарегистрированный локальный filesystem alias для сохранения прочитанного контекста. Проверяются binding/host metadata, realpath корней и файлов. Прав на Source/write или аттестации машины это не даёт. См. [контракт Source views](SOURCE_VIEWS.ru.md).

## Исходный usage

`normalizeProviderUsage` из `./usage` принимает `{format, binding, receiptID, observedAt, stage, usage}`. Binding дополнительно содержит provider/model/request ID и SHA фактического тела. `observedAt` — Unix milliseconds исходного наблюдения; `stage` — `partial` или `final`. Передавать исходные поля провайдера, а не нулевые default-поля базы. Имя модели от proxy само по себе не подтверждает физическую модель.

| Протокол | Семантика |
|---|---|
| Chat Completions | `prompt_tokens` включает кэш; read — `prompt_tokens_details.cached_tokens`. |
| Responses | `input_tokens` включает read/write; cache writes входят в свежую обработку. |
| DeepSeek chat | Явные hit/miss; сумма может дать отсутствующий total. Отсутствующий hit не выводится как выдуманный факт. |
| Native Anthropic | Отдельно ordinary `input_tokens`, cache creation и cache read. Total — сумма; свежий ввод — ordinary плюс write. Из already uncached поля кэш повторно не вычитать. |

Первоисточники полей: [OpenAI Chat](https://developers.openai.com/cookbook/examples/prompt_caching_201), [OpenAI cache read/write](https://developers.openai.com/api/docs/guides/prompt-caching), [DeepSeek](https://api-docs.deepseek.com/guides/kv_cache/), [Anthropic](https://platform.claude.com/docs/en/build-with-claude/prompt-caching).

Отсутствующее поле остаётся `null`/UNKNOWN, явный ноль — измеренный ноль. Противоречивые и небезопасные числа дают `invalid`, без правдоподобного процента кэша. Это нормализация, а не включение cache options, гарантия цены или доказательство восстановления по HTTP200.

`adapter.observe(prepared, {binding, receiptID, observedAt, stage, usage})` проверяет SAME исходный binding и возвращает наблюдение плюс nullable-флаги превышений. Поздний результат не перепривязывается к новой текущей задаче; retry не разрешается.

`aggregateProviderUsage` считает финальный исходный snapshot один раз, не суммирует промежуточные stream-счётчики и отклоняет изменённый финал того же запроса. Процент взвешивается по токенам. Если часть выборки UNKNOWN/invalid, общий процент отсутствует; отдельно показываются покрытие и доля известной части. Статистика не даёт допуска другому запросу.

С версии 0.4.0 `providerFailureState` требует provider/model/**sessionID**: чужой успешный чат не сбрасывает ваш счётчик и чужая ошибка не расходует его.
