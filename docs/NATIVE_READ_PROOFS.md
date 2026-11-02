# Native read proofs

`nativeToolLocations(messages, sessionID, wanted)` returns exact native message/part IDs for the supplied assistant messages. A duplicated call ID with distinct locations is ambiguous and gets no hint. The result contains no tool bodies.

The host reads the native store **readonly on its actual owning machine**, using the exact part primary key plus message/session checks. It verifies a completed tool and returns `indexed-native-read-v2` metadata: native identity, tool/input, SHA-256 of the actual original output, the original stored-part digest and the metadata with the output field removed. Database identity columns must be reconstructed when those fields are omitted from stored JSON. Missing or conflicting identities do not authorize a wider scan or a replacement result.

`matchNativeReadProofs` checks this response against the hints, session, allowed tools and an already available original text. It attaches that text only when its digest matches the native output. A local archive or a model assertion cannot substitute for the host's authenticated native-store read. Unproven results stay intact; optional proof IO failure cannot authorize dropping Source or bypass final context admission. A semantically invalid compaction anchor remains a refusal.

`qualifyReadonlyProofRecovery` only classifies the exact local pre-dispatch `READ_BUDGET_NATIVE_PROOF_UNAVAILABLE` failure after the host authenticates the repaired loaded release. It rejects owner Stop/complete, emitted content/tools, unsettled operations, changed Goal or selection, and an existing dispatch from that failed assistant. The existing host controller must still recheck current input/Goal/Stop and durably admit one successor. This helper never sends a model/tool request.

`sharedVerifiedMessageArchive()` keeps a bounded metadata-only archive proof cache in the unchanged helper module. A host window rebind can reuse it; changing the helper itself starts cold. Missing, changed or evicted files still require byte verification. This is local storage optimisation, not provider prompt-cache evidence.

## По-русски

Подсказки содержат только native session/message/part/call ID. Сам хост подтверждает завершённый результат чтением настоящей SQLite в readonly-режиме на машине-владельце. Если ID хранятся в колонках, они восстанавливаются из колонок, а не предполагаются внутри JSON. Через дочерний процесс передаются метаданные и хеш результата; уже имеющийся текст принимается только при точном совпадении SHA-256.

Чужой ID, неоднозначность, незавершённый инструмент, изменённый текст или недоступная проверка не дают права удалить Source либо объявить операцию успешной. Жёсткая проверка размера контекста сохраняется. Исправленный локальный отказ может получить один следующий модельный шаг через существующий контроллер с проверками Goal/input/Stop и журналом dispatch; старые инструменты и UNKNOWN не повторяются.

Эти модули не обновляют ранее выпущенные ZIP, не загружают другую платформу и не гарантируют кэширование у провайдера.
