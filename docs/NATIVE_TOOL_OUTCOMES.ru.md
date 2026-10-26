# Известный native отказ до исполнения

`knownNativeNoEffectFailure(part)` из `vantemio-agentic-backend/native-tool-outcome` распознаёт один точный terminal отказ native `edit`: `No changes to apply: oldString and newString are identical.` Нужны исходный callID, путь, одинаковые строковые аргументы и конечные упорядоченные timestamps начала/окончания. Функция возвращает proof отказа либо `null`, не меняя исходный part. Пример API — в [английском руководстве](NATIVE_TOOL_OUTCOMES.md).

Proof сохраняет исходный call, хеши аргументов/ошибки и время окончания: `known_failed_before_execution`, `operationDispatched:false`, без replay или release approval. Исходный native state остаётся `error`. Отклонённая пустая правка не является изменением кода или успешным тестом.

## Контракт хоста

До использования proof хост проверяет подлинность исходного native результата, actor/session/полную Goal/revision/input и original outcome. Установленная native реализация должна быть отдельно проверена: этот точный отказ обязан происходить до context/path/permission/filesystem execution. Такой текст от произвольного subprocess, модели или удалённого сервиса этого не доказывает.

Сам classifier не проверяет identity, права или живые процессы. Сохраняются owner Stop/complete, live tools, другие UNKNOWN, pending permission, исходный dispatch ledger и ограничения admission/расходов. Известный отказ без исполнения может разблокировать только SAME задачу, прошедшую остальные проверки. Продолжение выполняется существующим durable model-only механизмом после сверки accepted/UNKNOWN. Отклонённый инструмент не повторяется, чужие fences не очищаются.

Другие аргументы/текст ошибки/инструмент (включая Station edit), отсутствие identity/path/time, running/pending или противоречивые timestamps возвращают `null`. Для остальных ошибок нужно собственное расследование original outcome. Нельзя игнорировать все ошибки edit или считать любой error доказательством отсутствия эффектов.

Чистый модуль хеширует переданные данные, не читает файлы, не вызывает модели/инструменты, не создаёт controller/таймер и не предоставляет Source или publication authority.
