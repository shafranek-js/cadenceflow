# US12 — Генерация мелодии из аккордов

## Краткое решение

Добавить к `ChordStep` живую мелодическую партию: пользователь вызывает контекстное меню аккорда,
выбирает `Create Melody…`, настраивает направление, ритмическую сетку, октаву и инструмент. Ноты
последовательно извлекаются из верхнего voicing аккорда, без баса, и отображаются на отдельном
инструментальном стане.

Мелодия остаётся связанной с исходным аккордом: изменения гармонии, voicing, register или duration
автоматически её перестраивают. Ручное редактирование отдельных мелодических нот в первой версии не
добавляется.

## Данные и генератор

- Перевести Project schema с v1 на v2:

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

type MelodyInstrument = "flute" | "violin" | "clarinet" | "oboe" | "cello" | "synth-lead";

interface ChordMelodyRecipe {
  pattern: MelodyPattern;
  grid: MelodyGrid;
  octaveOffset: -2 | -1 | 0 | 1 | 2;
}

interface MelodyTrackSettings {
  instrument: MelodyInstrument;
  muted: boolean;
  solo: boolean;
  volume: number; // integer 0–127
}
```

- `ChordStep` получает optional `melody`; Project — обязательный `melodyTrack`.
- Новые проекты и миграция v1 → v2 используют: Flute, volume 100, Mute/Solo выключены.
- Сохраняется только recipe, не вычисленные ноты. Обновить IndexedDB/portable codec/JSON Schema и
  migration tests.
- Реализовать чистую immutable-проекцию `createMelodyTimeline(project)`, основанную на том же
  contextual upper-voicing, который используется playback/export. Бас никогда не является источником
  мелодии.
- Точные интервалы сетки:
  - Quarter — `1` beat;
  - Eighth — `1/2`;
  - Sixteenth — `1/4`;
  - Eighth triplet — `1/3`;
  - Sixteenth triplet — `1/6`.
- Паттерн повторяется до конца ChordStep; последняя нота сокращается точно до оставшейся
  Rational-длительности. Цикл начинается заново на каждом ChordStep.
- Правила паттернов:
  - Up/Down — последовательная сортировка по высоте;
  - Up-Down/Down-Up — движение без повторения крайних нот;
  - Outside-In — нижняя, верхняя, следующая нижняя, следующая верхняя;
  - Inside-Out — от центра наружу, для чётного количества начиная с нижней центральной.
- Сохранять octave doublings исходного voicing. При одной ноте повторять её.
- Repeat копирует recipe в новый независимый Step; Extend сохраняет recipe; delete удаляет её вместе
  со Step; replace/reorder автоматически пересобирают проекцию.
- Custom chord presets не сохраняют melody recipe или глобальные настройки Melody Track.

## Интерфейс, партитура и история

- Правый клик по любому onset/continuation-фрагменту аккорда выбирает исходный Step и открывает
  доступное меню:
  - `Create Melody…`, если recipe отсутствует;
  - `Edit Melody…` и `Remove Melody`, если она существует.
- Поддержать `Shift+F10` и клавишу Context Menu, ARIA `menu/menuitem`, закрытие по Escape/outside click
  и возврат фокуса.
- Compact dialog содержит Pattern, Grid, Octave, Instrument, нотный preview и кнопку прослушивания.
  Apply изменяет recipe и, при необходимости, инструмент одной Undo-операцией.
- В Staff View, если в проекте есть хотя бы одна melody recipe, показывать отдельный Melody staff над
  Piano:
  - Flute, Violin, Clarinet, Oboe и Synth Lead — treble clef;
  - Cello — bass clef;
  - запись ведётся в concert pitch;
  - свободные интервалы показываются паузами;
  - triplet grids получают tuplet notation;
  - пересечение такта разделяется лигами без повторной атаки.
- Исходный Piano staff, bass visibility и аккордовые ноты не меняются. На узком экране приоритет имеет
  Melody staff; опциональный bass staff может скрываться по существующему responsive-правилу.
- В заголовке Melody Track разместить Instrument, Mute, Solo и Volume. Эти настройки сохраняются в
  Project:
  - включение Mute выключает Solo;
  - включение Solo выключает Mute;
  - Solo заглушает chord upper и bass, но не метроном;
  - изменение Volume slider объединяется в одну Undo-операцию на drag.
- Playback transport должен передавать точную текущую позицию внутри Step, чтобы Staff подсвечивал
  именно звучащую мелодическую ноту, одновременно сохраняя подсветку исходного аккорда.

## Открытый звук, playback и экспорт

- Использовать уже подключённый open-source `spessasynth_lib` и `FluidR3Mono_GM.sf3` из Debian package
  `fluidr3mono-gm-soundfont` версии `2.315-7`. Пакет распространяется под MIT и содержит полный GM-набор.
- Зафиксированный SHA-256 пакета:
  `4098301bf29f4253c2f5799a844f42dd4aa733d91a210071ad16d7757dea51d6`.
- Источники:
  - <https://packages.debian.org/sid/sound/fluidr3mono-gm-soundfont>
  - <https://github.com/musescore/MuseScore/blob/main/share/sound/FluidR3Mono_License.md>
- Preparation script скачивает строго `fluidr3mono-gm-soundfont_2.315-7_all.deb`, проверяет SHA-256,
  извлекает только `FluidR3Mono_GM.sf3` и copyright, формирует provenance manifest. `.deb` в репозиторий
  не добавляется.
- Runtime работает полностью офлайн и лениво загружает SF3 при первом preview либо наличии Melody
  Track.
- GM programs, zero-based: Violin 40, Cello 42, Oboe 68, Clarinet 71, Flute 73, Square Lead 80. Default —
  Flute.
- Если SoundFont не загрузился, piano playback продолжается; Melody Track показывает ошибку и Retry.
  Данные, MIDI и MusicXML остаются доступными.
- Добавить роль `melody` в audio/performance events и отдельный provider/channel. Ноты наследуют
  velocity соответствующей исходной upper-note; глобальный Volume применяется отдельно.
- Swing смещает live/MIDI onset только для straight subdivisions; triplet grids и written MusicXML не
  изменяются.
- MIDI:
  - при наличии melody добавить четвёртый format-1 track: Conductor, Melody, Chords, Bass;
  - Melody использует channel 2, track name, GM program и CC7 volume;
  - Mute/Solo не исключают данные из экспорта;
  - note-off должен предшествовать соседнему note-on той же высоты;
  - без melody сохранить прежний MIDI byte-for-byte.
- MusicXML:
  - добавить отдельный однострочный Part перед Piano;
  - записывать выбранное имя инструмента, соответствующий GM program, clef, rests, tuplets и cross-bar
    ties;
  - Piano остаётся двухстановым grand staff;
  - Mute/Solo/Volume считаются playback-настройками и не меняют нотный текст;
  - без melody сохранить прежний XML byte-for-byte;
  - результат должен проходить существующую offline MusicXML 4.0 XSD validation.

## Этапы и проверка

1. Добавить US12/Phase 16 и T166–T176 в `spec.md`, `plan.md` и `tasks.md`; прежние принятые задачи не
   менять, новые не отмечать до review.
2. Реализовать generator, instrument catalog, schema v2, migration и portable persistence.
3. Добавить undoable create/edit/remove и Melody Track controls.
4. Реализовать context menu, dialog, preview и отдельный Staff.
5. Подключить SoundFont provider, playback routing и точную active-note подсветку.
6. Расширить MIDI и MusicXML.
7. После независимой проверки обновить `PROJECT_STATUS.md` и отметить принятые задачи.

Focused tests:

- все шесть паттернов с нечётным/чётным количеством нот, doublings и одной нотой;
- все пять grids, обрезанный хвост, custom Rational duration и cross-bar ties;
- доказательство отсутствия bass pitch в мелодии;
- live-link после harmony/voicing/register/duration/reorder;
- create/edit/remove, Repeat/Extend и migration v1 → v2 с Undo/Redo;
- context menu мышью и клавиатурой, dialog focus lifecycle;
- Mute/Solo/Volume, pause/resume/loop, lazy loading и graceful audio failure;
- точное Staff-позиционирование и active-note highlighting;
- независимый разбор MIDI и MusicXML XSD validation;
- reload и `.cadenceflow` round-trip;
- Chromium на 1280×720 и 1920×1080, обе темы, без горизонтального page scroll.

После локальных этапов запускать только относящиеся к ним тесты. Полные Vitest, Chromium, TypeScript,
build, lint и Prettier выполнить один раз в финальном acceptance. Не трогать существующие untracked
visual-polish материалы, не делать push, после проверок восстановить dev server на
`http://127.0.0.1:5174/`.
