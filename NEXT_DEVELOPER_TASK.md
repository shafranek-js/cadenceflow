# Next Developer Assignment — CadenceFlow US12, Batch A

**Assignment:** T166–T167 only

**Do not implement T168+ in this batch.**

**Goal:** закрепить требования US12 и реализовать чистое детерминированное ядро генерации мелодии без
изменения сохраняемой Project schema, UI, audio, playback или export.

Полный утверждённый план:
`specs/001-cadenceflow-core-studio/us12-melody-from-chords-plan.md`.

## Preflight и границы рабочего дерева

1. Использовать Node `24.14.0` и текущий package manager проекта.
2. Перед изменениями показать `git status --short` и `git log -3 --oneline`.
3. Не изменять и не добавлять в коммит существующие untracked-файлы:
   - `cadenceflow_visual_polish_batches/`;
   - `design-qa.md`;
   - `progression-controls.png`;
   - `progression-strip.png`;
   - `qa-current.png`;
   - `qa-wide.png`.
4. Не делать push.
5. Не отмечать T166/T167 выполненными и не обновлять `PROJECT_STATUS.md` до review оркестратора.

## T166 — требования и технический срез US12

Обновить только `spec.md`, `plan.md` и `tasks.md`:

- добавить User Story 12: создание связанной мелодической партии из выбранного ChordStep;
- добавить новые FR после FR-190 и acceptance-сценарии, соответствующие утверждённому плану;
- добавить в `plan.md` отдельный slice для melody generation;
- добавить Phase 16 и задачи T166–T176;
- сохранить все существующие task checkbox без изменений;
- явно удалить из Future Scope противоречия новой принятой функции, но не расширять scope на ручной
  piano-roll, произвольные SoundFont, несколько Melody Tracks или аудиоэкспорт;
- зафиксировать, что melody использует только contextual upper voicing, не bass, и вычисляется из
  recipe, а не хранится как список нот.

Нумерация Phase 16:

- T166 — docs/spec/plan/task contracts;
- T167 — pure melody types, patterns, grids and deterministic projection;
- T168 — Project schema v2, migration and portable persistence;
- T169 — undoable melody and track-setting commands;
- T170 — accessible context menu, editor dialog and track controls;
- T171 — Melody Staff rendering and active-note highlighting;
- T172 — licensed FluidR3Mono asset preparation and provider;
- T173 — playback routing, Mute/Solo/Volume and failure fallback;
- T174 — MIDI melody track;
- T175 — MusicXML melody part;
- T176 — final integration and Chromium acceptance.

## T167 — чистый генератор мелодии

Добавить framework-independent domain-модуль, рекомендуемое расположение:

- `src/domain/melody/types.ts`;
- `src/domain/melody/patterns.ts`;
- `src/domain/melody/projection.ts`;
- `tests/unit/melody/projection.test.ts`.

Публичные типы этого batch:

```ts
type MelodyPattern =
  | "up"
  | "down"
  | "up-down"
  | "down-up"
  | "outside-in"
  | "inside-out";

type MelodyGrid =
  | "quarter"
  | "eighth"
  | "sixteenth"
  | "eighth-triplet"
  | "sixteenth-triplet";

type MelodyOctaveOffset = -2 | -1 | 0 | 1 | 2;

interface ChordMelodyRecipe {
  readonly pattern: MelodyPattern;
  readonly grid: MelodyGrid;
  readonly octaveOffset: MelodyOctaveOffset;
}
```

Проекция этого batch принимает уже канонически реализованные upper pitches и точную duration. Она не
должна самостоятельно реализовывать гармонию или импортировать piano profile. Предусмотреть API уровня:

```ts
realizeChordMelody(input: {
  readonly sourceStepId: string;
  readonly upperPitches: readonly ExactPitch[];
  readonly durationBeats: Rational;
  readonly recipe: ChordMelodyRecipe;
}): MelodyPhrase
```

Каждый event должен содержать source Step ID, последовательный index, `ExactPitch`, точные Rational
`startOffsetBeats` и `durationBeats`. Результат и вложенные массивы должны быть immutable.

Обязательная семантика:

- входные upper pitches сортируются по `midiNumber`; исходный массив не мутируется;
- octave offset сдвигает `midiNumber` и spelling octave на `12 * offset`, сохраняя note letter и
  accidental;
- bass в API отсутствует;
- Up/Down — полный проход по возрастанию/убыванию;
- Up-Down/Down-Up — разворот без повторения крайних нот;
- Outside-In — lowest, highest, next-lowest, next-highest;
- Inside-Out — от центра наружу; для чётного количества lower-middle, upper-middle, затем попеременно
  наружу; для нечётного — middle, lower, upper и далее наружу;
- sequence циклически повторяется и начинается заново для каждого вызова;
- grid durations: `1`, `1/2`, `1/4`, `1/3`, `1/6` beats;
- последняя нота сокращается ровно до остатка ChordStep;
- duration короче grid всё равно создаёт одну ноту на всю duration;
- пустой pitch list или неположительная duration завершаются typed domain validation error;
- octave overflow за MIDI range 0–127 завершается typed error, без clamp;
- exact duplicate MIDI pitches и octave doublings сохраняются;
- один pitch повторяется до конца duration;
- генерация deterministic и не использует float для музыкального времени.

В этом batch не добавлять `melody` в `ChordStep`/Project, не менять schema version и codecs. T168 выполнит
интеграцию типов в сохраняемую модель после review генератора.

## Обязательные тесты

- шесть patterns на трёх, четырёх и пяти входных pitches с literal expected MIDI order;
- octave doublings, exact duplicates и single-pitch cycle;
- все пять grids;
- exact fit и truncated tail (`5/6`, `7/8`, custom Rational);
- duration меньше одного grid interval;
- octave offsets `-2..+2` и MIDI range failure;
- empty pitches и zero/negative duration failure;
- source input, recipe и pitches не мутируются;
- повторные вызовы глубоко равны и возвращают frozen/readonly projection.

## Проверки для сдачи

Запустить только focused-проверки этого batch:

1. Новый melody unit test с `--maxWorkers=1`.
2. Существующие focused Rational и piano realization tests, затронутые импортами.
3. TypeScript.
4. Prettier check только для изменённых файлов.
5. `git diff --check`.

Полный Vitest, build, lint и Chromium в этом batch не запускать. Dev server после работы должен снова
отвечать на `http://127.0.0.1:5174/`.

## Формат отчёта разработчика

Вернуть:

1. commit hash и точный список изменённых файлов;
2. literal expected sequences для всех шести patterns;
3. команды и результаты focused checks;
4. подтверждение отсутствия Project/schema/UI/audio/export изменений;
5. финальный `git status --short` и ahead/behind;
6. `Spec deviations: none` либо точный перечень отклонений.

**Acceptance condition:** требования US12 согласованы с основными артефактами, а чистый generator
однозначно определяет pitch order и Rational timing для последующей persistence/UI/audio/export
интеграции.
