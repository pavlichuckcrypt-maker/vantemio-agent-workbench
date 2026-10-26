# Известный native отказ до исполнения

`knownNativeNoEffectFailure(part)` из `vantemio-agentic-backend/native-tool-outcome` распознаёт точный terminal отказ native `edit` при одинаковых аргументах: `No changes to apply: oldString and newString are identical.` Нужны исходный callID, путь, одинаковые строковые аргументы и конечные упорядоченные timestamps начала/окончания. Функция возвращает proof отказа либо `null`, не меняя исходный part. Пример API — в [английском руководстве](NATIVE_TOOL_OUTCOMES.md).

Proof сохраняет исходный call, хеши аргументов/ошибки и время окончания: `known_failed_before_execution`, `operationDispatched:false`, без replay или release approval. Исходный native state остаётся `error`. Отклонённая пустая правка не является изменением кода или успешным тестом.

## Контракт хоста

До использования proof хост проверяет подлинность исходного native результата, actor/session/полную Goal/revision/input и original outcome. Установленная native реализация должна быть отдельно проверена: этот точный отказ обязан происходить до изменения файла. Одинаковые аргументы отклоняются до обработки файла; проверка неоднозначной замены может прочитать файл, но бросает ошибку до записи. Такой текст от произвольного subprocess, модели или удалённого сервиса этого не доказывает.

Сам classifier не проверяет identity, права или живые процессы. Сохраняются owner Stop/complete, live tools, другие UNKNOWN, pending permission, исходный dispatch ledger и ограничения admission/расходов. Известный отказ без исполнения может разблокировать только SAME задачу, прошедшую остальные проверки. Продолжение выполняется существующим durable model-only механизмом после сверки accepted/UNKNOWN. Отклонённый инструмент не повторяется, чужие fences не очищаются.

Также распознаётся точный отказ `Found multiple matches for oldString. Provide more surrounding context to make the match unique.` с кодом `NATIVE_EDIT_AMBIGUOUS_PREWRITE`: oldString непустой, newString отличается, replaceAll отсутствует или false, частичного output нет. Проверка уникальности завершается до записи — [исходник OpenCode v1.19.3](https://github.com/anomalyco/opencode/blob/v1.19.3/packages/opencode/src/tool/edit.ts). Ошибка сохраняется; следующую изменённую правку разработчик выполняет через обычный admission.

Другие аргументы/текст ошибки/инструмент (включая Station edit), отсутствие identity/path/time, running/pending или противоречивые timestamps возвращают `null`. Для остальных ошибок нужно собственное расследование original outcome. Нельзя игнорировать все ошибки edit или считать любой error доказательством отсутствия эффектов.

Чистый модуль хеширует переданные данные, не читает файлы, не вызывает модели/инструменты, не создаёт controller/таймер и не предоставляет Source или publication authority.
