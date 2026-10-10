# Импорт MIDI и MusicXML: план реализации

Дата: 2026-10-09. Статус: **реализация локально выполнена; focused проверки пройдены, итоговая независимая приёмка отдельно**.

Этот документ сохраняет исходный план и предложенные решения. После пользовательского продолжения реализованы адаптеры `src/import/scoreFile.ts`, `src/import/mxl.ts`, построитель `src/import/importedProject.ts`, UI `src/ui/projects/ScoreFileImport.tsx` и интеграция в `src/app/App.tsx` / ProjectController. Ниже приведены точные результаты локальной проверки, а не статус полного release gate. Существующие локальные изменения и защищённые изображения сохранены. Commit, push и deployment не выполнялись.

## Подтверждённые требования

- Импортировать MIDI и MusicXML из локального файла.
- Создавать **новый проект** из выбранного инструмента. Исходный текущий проект сохраняется отдельно и остаётся доступен во вкладках.
- Если в файле больше одного инструмента с нотами, предложить пользователю выбрать **один** инструмент. Не импортировать все партии автоматически.
- При одном доступном инструменте отдельный выбор не нужен.

## Предлагаемые решения, которые пока не утверждены

Архитектурная рекомендация: не придумывать гармонию; основа нового проекта — RestStep с authored melody, без автоматически добавленных аккордов. Пользователь подтвердил новый проект и выбор одного инструмента. Представление выбранной партии как authored melody — архитектурная рекомендация, а не отдельное подтверждённое требование.

| Вопрос | Рекомендация для первой версии | Почему |
| --- | --- | --- |
| Форматы | MIDI type 0/1 с PPQ; `.mid`, `.midi`; MusicXML `.xml`, `.musicxml`, compressed `.mxl` | Покрывает обычные экспорты редакторов; type 2 и SMPTE отклоняются с понятной причиной |
| Изменения tempo/meter | Сохранять единственный tempo/meter; переменные tempo/meter отклонять с понятной причиной до создания проекта | Project сейчас содержит только один глобальный tempo и meter; точная поддержка карты изменений требует отдельной задачи |
| Ударные / unpitched | Показывать такие партии в списке как disabled с причиной; выбирать можно только поддерживаемую партию; если все партии неподдерживаемые — отказ без создания проекта | Существующая melody — звуковысотная; исполнение номера барабана на фортепиано меняет смысл |
| Звук инструмента | Сохранять GM program, если есть точное соответствие каталогу; иначе использовать piano с видимым предупреждением | Название исходной партии и выбранный звук не должны вводить в заблуждение |
| Повторы и grace notes | Импортировать написанные такты в порядке файла, без разворачивания repeats / DC / DS; предупредить при их наличии. При grace notes отклонять выбранную партию с понятной причиной; не пропускать их молча | Разворачивание повторов и нетактовые события требуют отдельного контракта времени |
| Динамика / pedal | Первая версия переносит высоты и записанные длительности, не обещает точное воспроизведение velocity, articulation, sustain или automation | У authored melody нет индивидуальной velocity, а pedal может менять фактическую длительность звучания |
| Тональность | Сохранить tonic/key при однозначно поддерживаемом значении; иначе оставить C и предупредить, не транспонируя ноты | Фактическая высота нот должна сохраниться независимо от гармонической панели |

Все обнаруженные ограничения собираются в одно окно предупреждений. При одном инструменте это окно всё равно появляется, если требуется согласиться с преобразованиями. При нескольких — предупреждения включаются в окно выбора. Неподдерживаемые файлы и повреждённые данные дают ошибку, а не кнопку «продолжить».

## Пользовательский сценарий

1. В меню Project расположить `Import MIDI / MusicXML…` рядом с открытием проекта. Обычный `.cadenceflow` импорт остаётся отдельным действием.
2. Выбрать файл. Пока идёт чтение, заблокировать повторный запуск, но не изменять текущий проект.
3. Проверить формат и размеры, прочитать партии и метаданные, построить список инструментов, имеющих музыкальное содержимое.
4. При нескольких инструментах открыть модальное окно с radio/select без заранее выбранного инструмента. Показывать исходное название, MIDI track/channel/program или MusicXML part/instrument, количество нот и доступность. Metadata-only tracks не являются инструментами; grand staff одного piano part не разделяется на два инструмента.
5. Если нужны преобразования, показать предупреждения; `Create project` требует осознанного подтверждения. Cancel / Escape закрывают окно без записи проекта.
6. Построить и полностью проверить новый Project в памяти. Имя взять из названия партитуры либо имени файла, нормализовать существующим валидатором.
7. Через ProjectController сохранить исходный проект, записать новый и сделать его активным. Новая вкладка открывается; прежняя остаётся. Playback останавливается при фактическом переключении проекта.
8. Первым открывать Staff: импорт партитуры удобно сразу проверить как нотную запись. Piano Roll доступен для дальнейшего редактирования; Staff и Tablature читают тот же effective timeline. Проект доступен после перезагрузки и экспортируется в `.cadenceflow`.

## Архитектура и границы

**Слой чтения файлов вне domain.** `src/import/scoreFile.ts` или отдельные адаптеры MIDI / XML / ZIP возвращают промежуточный `ImportedScore`. DOMParser и распаковка не попадают в `src/domain`, где `tsconfig.domain.json` специально исключает DOM.

Промежуточная модель содержит source format/title, инструменты с устойчивыми ID и именами, note pitch/spelling, rational onset/duration в четвертных долях, tempo/meter/key events, исходную продолжительность и структурированные предупреждения. Исходные строки XML/имена файлов не становятся HTML.

**Построитель проекта.** `src/import/importedProject.ts` создаёт новый immutable Project из `createDefaultProject`, задаёт импортированный timing, instrument и presentation, формирует RestStep по тактам. Нота принадлежит step, в котором начинается, и сохраняет полную длительность при пересечении следующих тактов: искусственно разрезать её на независимые note-on не следует. Пустые такты и начальные паузы сохраняются. Последний такт покрывает конец последней ноты и значимые записанные паузы. Никаких schema migrations для промежуточных import данных.

**Сохранение.** Сначала round-trip через `encodePortableProject` / `decodePortableProjectWithDiagnostics`, проверка effective timeline и отсутствие потерянных нот. Затем существующий `ProjectController.openPreparedPortableProject` или узкий новый метод на тех же безопасных внутренних механизмах: serialized operation → suspend editing → flush outgoing autosave → save new project → set active pointer → replaceLoadedProject. Не вызывать createNewProject с последующей серией мутаций. Если save/flush падает, исходный активный Project остаётся прежним; сиротскую запись нового проекта при частичном сбое нужно обработать и протестировать отдельно.

**UI.** Отдельный `ScoreFileImport` использует `useModalFocus`, видимые label, aria-modal/title, role=alert для ошибки, возврат фокуса к запуску, клавиатуру и отмену. В модальном выборе при выполнении commit отключить повторное подтверждение. Чтение файла само по себе не блокирует сохранение исходного проекта; асинхронные устаревшие результаты после закрытия/размонтирования не активируют импорт.

## MIDI: музыкальная корректность

- Проверить MThd/MTrk и declared lengths; ограничить VLQ и всегда продвигать курсор. Поддержать running status, корректно сбрасывая его на соответствующих системных событиях; пропускать неизвестные meta/sysex по длине.
- Type 0 и 1 объединять по абсолютным tick positions; PPQ переводить в rational `ticks / ticksPerQuarter`, не в миллисекунды и не через округлённые float.
- Note-on velocity 0 трактовать как note-off. Парные события вести отдельно по track/channel/pitch с определённой FIFO-политикой для повторного одинакового pitch. Перекрытия и аккорды сохранять.
- Инструмент определяется sounding track/channel/program сегментом, а не только номером track. Один type 0 track может содержать несколько инструментов; program change внутри канала не должен молча объединять инструменты. Имя track дополнять channel/program для различимости.
- Tempo/meter часто лежат в conductor track: считывать их независимо от выбранной партии. Пустые и metadata-only tracks не попадают в chooser.
- Dangling note-on/off, нулевая длительность, недопустимые значения и неоднозначные program changes имеют явно заданную политику ошибки/предупреждения; не достраивать длительности скрыто.
- Sustain, controller automation, pitch bend и percussion не считать точно перенесёнными, если первая версия их не поддерживает.

## MusicXML и MXL: музыкальная корректность

- Поддержать согласованный основной вариант score-partwise; score-timewise либо преобразовать отдельным проверенным адаптером, либо явно отклонить. Нельзя прочитать такой файл как пустой score.
- Чтение divisions выполняется в области действия каждого part/measure; duration — rational в четвертных долях. Backup/forward меняют cursor. Chord notes делят onset предыдущей ноты. Voices/staves независимы и не теряют одновременные ноты.
- Rest влияет на время, но не превращается в sounding note. Pickup/implicit и неполные такты требуют отдельного теста; сохранять реальную записанную длину, не добавлять скрытую паузу перед следующей measure. Если текущая score topology не умеет неполный первый такт, не делать скрытый padding: либо узко поддержать irregular first bar без schema drift, либо явно отклонить файл до создания проекта.
- Tie start/stop объединяет длительности по part/voice/staff/pitch с учётом цепочек; visual slur не является tie. Результат содержит одну звучащую ноту и корректную запись across-measure.
- Сохранять step/alter/octave spelling и проверять соответствие MIDI pitch. Поддержать transpose chromatic + octave-change для concert pitch; показать предупреждение при неподдерживаемой transposition, не игнорировать её.
- Part-list задаёт имена; note instrument ID выбирает конкретный score-instrument внутри part. Grand staff одного instrument остаётся одной опцией. Не считать voice отдельным инструментом автоматически.
- Tuplet duration использовать из duration/divisions; time-modification и dots важны для отображения, но не должны повторно умножать уже заданную длительность.
- Unsupported repeats, grace, unpitched, микротональные alter и сложные изменение ключа/метра обнаруживать и явно обрабатывать.
- В MXL сначала читать `META-INF/container.xml`, выбрать корректный rootfile; не полагаться на первый XML в архиве. Разрешать допустимые вложенные rootfile paths, запрещать absolute/traversal paths и внешние адреса.

## Ограничения обработки недоверенных файлов

Предлагаемые начальные пределы: исходный файл 10 MiB, распакованное содержимое 50 MiB, XML depth 128, ZIP entries 256, максимум 100 000 нот и 10 000 тактов. Это инженерные начальные значения: до утверждения проверить на типичных оркестровых файлах и фиксировать сообщения превышения в тестах.

ZIP читать в памяти без извлечения на диск; лимиты проверять до и во время decompression, а не только после. Поддержать обычный stored/deflate и явные ошибки для encrypted/unsupported archives, CRC/length mismatch, zip bombs. Выбор ZIP-библиотеки: рекомендуемый кандидат `fflate` (MIT, browser support); до добавления проверить точную версию, размер bundle и возможность ограничивать выход при потоковой распаковке. Одно unrestricted unzipSync с проверкой размера только после распаковки не подходит.

Для XML не разрешать внешние entity/network requests. Не отклонять автоматически обычный MusicXML DOCTYPE, распространённый в экспортах: безопасно игнорировать стандартную декларацию без обращения к внешнему DTD; внутренние entities и неподдерживаемые declarations отклонять. Не выполнять XML/XSLT, не вставлять source HTML. Ошибки не содержат полный исходный файл.

## Фазы и зависимости

| Фаза | Содержание | Зависит от | Условие завершения |
| --- | --- | --- | --- |
| P0 | Утвердить политики таблицы, проверить реальные sample files, выбрать ZIP/parser strategy | Этот план | Зафиксированы границы форматов, warnings и instrument identity |
| P1 | Промежуточная модель, validation, rational conversion, диагностические коды и fixtures | P0 | Контракт не зависит от UI/DOM и имеет unit fixtures |
| P2 | MIDI reader type 0/1, channels/program, overlap/pairing/meta и лимиты | P1 | Deterministic MIDI fixtures проходят, malformed inputs не зависают |
| P3 | MusicXML reader timing/voices/chords/ties/transposition | P1 | Structural fixtures и expected exact notes проходят |
| P4 | MXL safe container/rootfile/decompression через bounded fflate и errors | P3 + проверенная ZIP strategy | Stored/deflate и негативные архивы проходят |
| P5 | Новый Project builder/rest measures, codec и effective timeline validation | P2/P3/P4 | Exact pitches/timing, polyphony и pauses сохранены после round-trip |
| P6 | Safe ProjectController integration, persistence failures и tabs | P5 | Исходный сохранён; parse/save/flush failure не переключают активный |
| P7 | Import entry, chooser, warnings, cancellation/accessibility, new tab | P6 | Одно- и многоинструментный сценарии проходят в изолированном браузере |
| P8 | Own-export MIDI/MusicXML round-trip и focused regression/build/lint | P7 | Собственные exports снова читаются без потерь supported notes; точные totals опубликованы |
| P9 | Независимый review, визуальная и музыкальная приёмка | P8 | Чеклист выполнен; ограничения названы; приёмка отдельно от реализации |

Оркестратор назначает одного writer для пересекающихся app/UI файлов; reader/reviewer работают без записи. MIDI/XML модули можно делить только при согласованных interfaces и ownership. Сначала проверить существующий незавершённый draft; исправлять по утверждённому контракту, не начинать параллельный альтернативный importer.

## Проверки и критерии приёмки

### Unit / controller

- MIDI format 0 с двумя channels вызывает два выбора; format 1 conductor + один note track даёт один инструмент; program changes и одинаковые названия различимы.
- Note-on/off, velocity zero, running status, same-pitch overlap, polyphony и initial silence дают точные rational интервалы.
- XML backup/forward, multi-voice/staff chord, divisions change, tuplets/dots, ties across measures, transposing instrument и pickup соответствуют expected pitch/onset/duration.
- MXL nested rootfile, stored/deflate, missing container, malformed ZIP/XML, internal entities и превышения лимитов обрабатываются предсказуемо.
- Unsupported type 2/SMPTE/timewise/percussion и tempo/meter changes следуют утверждённым error/warning policies.
- Round-trip нового проекта сохраняет все импортированные notes; effective timeline имеет expected polyphony и ending.
- Собственные MIDI и MusicXML exports приложения импортируются обратно: exact supported pitches/onsets/durations, polyphony и конечная пауза проверяются; несовпадения spelling в MIDI объясняются отсутствием spelling в формате. Эта проверка обязательна до приёмки.
- Cancel, parse error, исходный autosave failure и new save failure не изменяют активный Project/history или содержимое исходного repository record.
- Успешный импорт сохраняет исходный, создаёт отдельный ID, сохраняет active pointer и не требует Undo для восстановления предыдущего проекта.

### Browser / visual / musical

- Через Project → import один MIDI и один MusicXML открываются как новые вкладки, исходная вкладка остаётся доступной.
- Несколько инструментов требуют выбора; disabled Create без выбора; импорт содержит только выбранный instrument.
- Один instrument импортируется непосредственно, кроме требующих подтверждения warnings. Cancel/Escape, повторный выбор того же файла, focus trap/return, loading/error states работают.
- После reload imported project открывается с теми же notes; `.cadenceflow` export/import round-trip сохраняет результат.
- Staff, Tablature и Piano Roll не имеют придуманных аккордов и показывают timing/полифонию согласованно; playback и keyboard подсвечивают текущие sounding notes.
- Проверить light/dark и узкое окно, длинные имена instruments, несколько warnings и ошибку чтения; screenshots сохранять вне защищённых tracked images.
- Audition на маленьких fixtures подтверждает pitches, паузы, аккорды и tie без повторного note-on. Автоматические проверки не заменяют это прослушивание.

### Объём проверки

Сначала focused Vitest (`--maxWorkers=1`), controller integration и Chromium (`--workers=1 --retries=0`) в изолированных fixtures. Затем build / layer typechecks, lint/Prettier изменённых файлов и `git diff --check`. Расширять regression только при новых рисках/ошибках. Отчёт содержит точные результаты и отдельно отмечает независимую приёмку; существующий локальный сервер и живой пользовательский проект не используются как тестовый sandbox.

## Что не входит в первую версию

Автоанализ/генерация гармонии, одновременный импорт всех instruments, многодорожечный project schema, аудиотранскрипция, полная DAW automation, MIDI recording, объединение с текущей melody, незаявленное разворачивание повторов, автоматическая публикация на GitHub Pages.

## Результаты локальной реализации

- MIDI type0/1 PPQ, MusicXML partwise и bounded MXL; новый проект, выбор одного инструмента, предупреждения и недоступные партии.
- Focused Vitest: 2 файла, 38/38 тестов; включены outgoing autosave failure, atomic new-save/pointer rollback и own-export round-trip.
- Chromium: один согласованный запуск 6/6, workers1/retries0, skipped0/flaky0/unexpected0. Проверены импорт MIDI/XML/MXL, выбор/отмена, исходная и новая вкладки, reload, ошибки и реальный локальный fixture.
- Пользовательский `score (3).musicxml`: 113 тактов, 3/4, tempo124, guitar GM024, 533 звучащие ноты после объединения ties; independent source/audio проверка совпала. Сам файл не добавлен в репозиторий.
- Fresh build и layer typechecks прошли: 492 modules; MXL lazy chunk7.48KB. Точные scoped checks сообщаются в итоговом handoff.
- Реальное прослушивание и полный release regression не выполнялись; отдельная музыкальная приёмка остаётся открытой. Это не deployment acceptance.

## Следующий шаг

Независимо проверить окончательные scoped результаты и интерфейс. При необходимости выполнить ручное прослушивание импортированной партии. Текущая реализация локальная; publication только по отдельной инструкции пользователя.
