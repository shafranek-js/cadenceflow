# Next Developer Assignment — CadenceFlow US12, Batch B

**Assignment:** T168–T169 only

**Do not implement T170+ in this batch.**

**Goal:** сохранить Melody recipe/track settings в Project schema v2 и добавить единственный undoable
command path, на который позже сможет опираться UI. Не реализовывать context menu, Staff, SoundFont,
playback, MIDI или MusicXML.

Утверждённый план:
`specs/001-cadenceflow-core-studio/us12-melody-from-chords-plan.md`.

## Preflight и Git scope

1. Работать поверх accepted baseline, включающего:
   - `9918c20 feat(us12): add deterministic melody projection`;
   - `32a9b29 fix(us12): align melody contracts and validation evidence`;
   - `9935159 docs(status): accept us12 melody projection batch`.
2. Использовать Node `24.14.0` и pnpm `10.12.4`.
3. До изменений показать `git status --short` и `git log -5 --oneline`.
4. Не добавлять в staging существующие untracked QA/visual-polish материалы.
5. Не менять `PROJECT_STATUS.md` и checkbox T168/T169 до review оркестратора.
6. Не делать push.

## T168 — Project schema v2 и persistence

### Domain contract

- Расширить `src/domain/melody/types.ts`:
  - `MelodyInstrument = "flute" | "violin" | "clarinet" | "oboe" | "cello" | "synth-lead"`;
  - `MelodyTrackSettings` с `instrument`, `muted`, `solo`, `volume`;
  - defaults: Flute, `muted=false`, `solo=false`, `volume=100`;
  - pure snapshot/validation helpers для recipe и track settings.
- Добавить optional `melody?: ChordMelodyRecipe` только в `ChordStep`. `RestStep` recipe не получает.
- Добавить обязательный `melodyTrack: MelodyTrackSettings` в `Project`.
- New Project создаётся только с `CURRENT_PROJECT_SCHEMA_VERSION = 2`; убрать независимый literal version
  из factory.
- Все новые recipe/settings и вложенные объекты должны быть immutable. Generated `MelodyEvent[]` в
  Project не хранится.

### Migration v1 → v2

- Увеличить `CURRENT_PROJECT_SCHEMA_VERSION` до `2`.
- Реализовать чистую последовательную миграцию wire payload:
  - не мутировать входной v1 object или вложенные progression/steps;
  - заменить `schemaVersion` на `2`;
  - добавить default `melodyTrack`;
  - не добавлять melody recipes существующим ChordSteps;
  - сохранить все остальные неизвестные допустимые v1 поля до последующей schema validation.
- v2 payload должен возвращаться без семантических изменений; version `3+` отклоняется как future.
- Изменение формы Project не требует новой Dexie table/index version: существующие records мигрируются на
  repository/decode boundary и следующий autosave сохраняет v2.

### JSON Schema и `.cadenceflow`

- Обновить `cadenceflow-project.schema.json` до `schemaVersion const 2`.
- Добавить обязательный root `melodyTrack` с закрытыми properties и строгими enum/range constraints.
- Добавить optional `melody` только в chord step schema; recipe содержит только Pattern, Grid и integer
  octave offset `-2..2`.
- Portable encoder/decoder должен явно кодировать/декодировать recipe и settings; простой spread
  доменного объекта в wire payload не использовать.
- Recipe должен сохраняться и у ChordStep внутри Temporary Branch, если такой v2 payload поступил.
- Отсутствие generated note/event arrays доказать literal JSON assertions.
- Сохранить deterministic field order и явное отклонение malformed enum, volume, mute/solo types,
  octave offset и recipe на RestStep.
- V1 fixture должен успешно мигрировать/декодироваться; v2 round-trip должен быть deep-equal по всем
  поддерживаемым semantics. Project source не мутируется.
- Autosave/repository recovery v1 record должен вернуть v2 Project и после сохранения не создавать
  дубликат проекта или историю Undo/Redo.

Рекомендуемый первый коммит:
`feat(us12): persist melody recipes and track settings`.

## T169 — undoable melody commands

Добавить отдельный command-модуль, например `src/app/commands/melodyCommands.ts`, и зарегистрировать все
inverse/restore types в существующем dispatcher.

### Recipe commands

- Один `apply` command создаёт или редактирует recipe выбранного ChordStep.
- Payload содержит `stepId`, полный validated recipe, optional выбранный Instrument и `nowIso`.
- Recipe + optional Instrument применяются одной atomic Undo-операцией, как потребуется будущему dialog.
- `remove` удаляет recipe, не удаляя Step и не меняя selection.
- RestStep и неизвестный Step ID завершаются typed/Range error без мутации.
- Restore/inverse должен восстанавливать точные previous recipe, Instrument, `updatedAt` policy и selection.

### Melody Track commands

- Поддержать instrument, mute, solo и volume через validated settings command.
- Включение Mute автоматически выключает Solo; включение Solo автоматически выключает Mute.
- Payload, одновременно требующий `muted=true` и `solo=true`, отклоняется без мутации.
- Volume принимает только integer `0..127`.
- Команды заменяют immutable settings целиком или snapshot-ят patch; вложенный объект нельзя мутировать.

### Existing progression behavior

- `progression/repeat-chord` копирует recipe в новый независимый frozen object и сохраняет новый Step ID.
- Extend duration и `timing/set-step-duration` сохраняют recipe и автоматически изменяют только будущую
  derived projection.
- Replace harmony сохраняет recipe на том же Step ID.
- Reorder перемещает recipe вместе со Step.
- Remove Step удаляет recipe вместе со Step и Undo восстанавливает его.
- Reset Performance не удаляет recipe.
- Custom Preset сохраняет только harmonic function + duration и не получает recipe/track settings.
- Ни одна команда не сохраняет generated Melody events.

Рекомендуемый второй коммит:
`feat(us12): add undoable melody project commands`.

## Focused tests

Обязательное покрытие:

- Project factory v2 defaults и deep immutability;
- pure non-mutating v1 → v2 migration, idempotent v2 path, future-version rejection;
- JSON Schema valid v2 и malformed recipe/settings cases;
- v1 fixture import, v2 portable round-trip, deterministic repeated encoding;
- active Temporary Branch recipe round-trip;
- autosave/repository v1 recovery → v2 без duplicate records;
- create/edit/remove recipe и optional instrument как одна Undo/Redo entry;
- Mute/Solo mutual exclusion, volume/instrument validation и Undo/Redo;
- Repeat/Extend/duration/Replace/Reorder/Remove/Reset Performance semantics;
- selection и source Project immutability;
- regression: Custom Preset wire/domain data не содержит melody.

Запустить только:

1. `tests/unit/melody/projection.test.ts`;
2. новые migration/schema/command tests;
3. существующие `portable-project`, `autosave-recovery`, `measure-gap-commands`, step-duration и preset
   tests, реально затронутые изменениями;
4. TypeScript;
5. Prettier check только изменённых файлов;
6. `git diff --check`.

Полный Vitest, build, lint и Chromium в Batch B не запускать. После проверок dev server должен снова
отвечать на `http://127.0.0.1:5174/`.

## Отчёт разработчика

Вернуть:

1. два commit hash и точный file list каждого;
2. описание v1 → v2 migration и доказательство отсутствия входной мутации;
3. JSON fragment v2 с `melodyTrack` и одним ChordStep recipe, без generated notes;
4. таблицу command → inverse → selection behavior;
5. точные команды и результаты focused checks;
6. финальный `git status --short`, ahead/behind и HTTP status dev server;
7. `Spec deviations: none` либо полный перечень.

**Acceptance condition:** старые проекты безопасно открываются как v2, recipe/settings детерминированно
переживают autosave/portable round-trip, а все будущие UI-изменения могут использовать один проверенный
undoable command path без сериализации производных нот.
