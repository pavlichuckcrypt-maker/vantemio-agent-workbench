# Представление исходников в существующем host

[English](SOURCE_VIEWS.md).

`vantemio-agentic-backend/source-view` проверяет явно допущенное представление существующего дерева исходников в рабочем пространстве. Symbolic link или Windows directory junction позволяет работать с теми же файлами без копирования репозитория. Функции не управляют mount, сервером, очередью, моделью, Goal или Source claims.

Host передаёт текущие actor/session/Goal/revision, Stop, идентичность исполнителя и разрешённые корни. Ответ модели, retrieved документ или совпавшее имя файла не являются разрешением. `expectedHost` сверяет переданные метаданные; он не аттестует удалённую машину и не определяет production authority.

```js
import {qualifySourceView, qualifySourceViewFile}
  from 'vantemio-agentic-backend/source-view';

const view = await qualifySourceView({
  binding: host.currentBinding(),
  expectedHost: host.executionHost,
  workspaceRoot: host.workspaceRoot,
  declaredSourceRoots: host.approvedSourceRoots,
  ownerStop: host.ownerStop(),
  view: host.enrolledSourceView,
});
const sourcePath = await qualifySourceViewFile(view, host.requestedPath);
const bytes = await host.readApprovedBytes(sourcePath);
// Существующий read adapter связывает эти байты с исходным вызовом и результатом.
```

`enrolledSourceView` содержит schema `agent.source-view/v1`, совпадающий `binding`, `host`, `viewRoot` и `sourceRoot`. В binding входят `actorID`, `sessionID`, `goalID` и целочисленный `revision`. Корни и запрошенный файл — абсолютные пути в файловом пространстве машины-исполнителя.

Представление должно быть дочерним путём workspace, причём его физический родитель остаётся внутри workspace. Реальная цель должна совпадать с разрешённым корнем. Проверка файла отвергает traversal, похожий соседний префикс, изменённую цель представления и вложенные ссылки за пределы исходников. Она возвращает разрешённый физический путь, не читает и не исполняет файл.

Замороженный результат имеет `readOnlyObservation: true` и `sourceOrClaimAuthority: false`. Digest связывает scope и разрешённые корни, но не содержимое файлов, разрешения ОС или владение. Проверки прав, актуальные хеши байтов/диапазонов, claims, конкурентные правки, исходные результаты и CAS перед изменением остаются за host. Повторно квалифицируйте данные на обычной границе текущей задачи; сохранённое представление не разрешает старую Goal или возобновление Stop/UNKNOWN.

Модуль подходит для сохранения уже прочитанных локальных исходников через квалифицированное представление. Он не выбирает нужные файлы за агента, не запускает повторное чтение, не увеличивает окно контекста и не доказывает внедрение функции.
