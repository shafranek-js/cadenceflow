import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../common/Icon";

export type HelpTabId =
  | "overview"
  | "matrix"
  | "melody"
  | "guitar"
  | "export"
  | "shortcuts"
  | "about";

export interface HelpCenterModalProps {
  readonly onClose: () => void;
  readonly initialTab?: HelpTabId | undefined;
  readonly onOpenFingeringLegend?: (() => void) | undefined;
}

interface HelpTabMeta {
  readonly id: HelpTabId;
  readonly title: string;
  readonly icon: string;
  readonly badge?: string | undefined;
}

const HELP_TABS: readonly HelpTabMeta[] = [
  { id: "overview", title: "Быстрый старт", icon: "🚀" },
  { id: "matrix", title: "Гармоническая матрица", icon: "🎼" },
  { id: "melody", title: "Мелодия и инструменты", icon: "🎵" },
  { id: "guitar", title: "Гитара и табулатура", icon: "🎸", badge: "New" },
  { id: "export", title: "Экспорт (MIDI & XML)", icon: "💾" },
  { id: "shortcuts", title: "Горячие клавиши", icon: "⌨️" },
  { id: "about", title: "О CadenceFlow", icon: "ℹ️" },
];

export function HelpCenterModal({
  onClose,
  initialTab = "overview",
  onOpenFingeringLegend,
}: HelpCenterModalProps) {
  const [activeTab, setActiveTab] = useState<HelpTabId>(initialTab);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const query = searchQuery.trim().toLowerCase();

  const filteredTabs = useMemo(() => {
    if (!query) return HELP_TABS;
    return HELP_TABS.filter((t) => t.title.toLowerCase().includes(query));
  }, [query]);

  return createPortal(
    <div
      className="dialog-backdrop help-center-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="help-center-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-center-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="help-center-header">
          <div className="help-center-header-title-box">
            <h2 id="help-center-title" className="help-center-title">
              📖 Справочный центр CadenceFlow
            </h2>
            <p className="help-center-subtitle">
              Руководство пользователя, теория гармонии, табулатуры и горячие клавиши
            </p>
          </div>
          <div className="help-center-header-actions">
            <div className="help-search-box">
              <span className="help-search-icon" aria-hidden="true">🔍</span>
              <input
                type="search"
                className="help-search-input"
                placeholder="Поиск по справке..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Поиск по разделам справки"
              />
              {searchQuery ? (
                <button
                  type="button"
                  className="help-search-clear"
                  onClick={() => setSearchQuery("")}
                  aria-label="Очистить поиск"
                >
                  ✕
                </button>
              ) : null}
            </div>
            <button
              type="button"
              className="dialog-close-btn"
              onClick={onClose}
              aria-label="Закрыть справку"
            >
              <Icon name="close" />
            </button>
          </div>
        </header>

        {/* Body Layout: Sidebar + Main Content */}
        <div className="help-center-body">
          {/* Sidebar */}
          <nav className="help-center-sidebar" aria-label="Разделы справки">
            <ul className="help-tab-list">
              {filteredTabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <li key={tab.id} className="help-tab-item">
                    <button
                      type="button"
                      className={`help-tab-button ${isActive ? "active" : ""}`}
                      onClick={() => setActiveTab(tab.id)}
                      data-testid={`help-tab-${tab.id}`}
                    >
                      <span className="help-tab-icon">{tab.icon}</span>
                      <span className="help-tab-text">{tab.title}</span>
                      {tab.badge ? <span className="help-tab-badge">{tab.badge}</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="help-sidebar-footer">
              <div className="help-sidebar-hint">
                💡 Нажмите <kbd>F1</kbd> в любой момент для вызова этого окна
              </div>
            </div>
          </nav>

          {/* Main Content Area */}
          <main className="help-center-content" tabIndex={0}>
            {activeTab === "overview" && <OverviewSection onOpenTab={setActiveTab} />}
            {activeTab === "matrix" && <MatrixSection />}
            {activeTab === "melody" && <MelodySection />}
            {activeTab === "guitar" && (
              <GuitarSection onOpenFingeringLegend={onOpenFingeringLegend} />
            )}
            {activeTab === "export" && <ExportSection />}
            {activeTab === "shortcuts" && <ShortcutsSection />}
            {activeTab === "about" && <AboutSection />}
          </main>
        </div>
      </section>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Section Components
// ---------------------------------------------------------------------------

function OverviewSection({ onOpenTab }: { onOpenTab: (tab: HelpTabId) => void }) {
  return (
    <article className="help-article">
      <h3>🚀 Добро пожаловать в CadenceFlow</h3>
      <p className="help-lead">
        <strong>CadenceFlow</strong> — это интерактивная цифровая рабочая станция для композиторов,
        аранжировщиков, гитаристов и клавишников. Приложение объединяет функциональную гармонию,
        кварто-квинтовый круг, многодорожечные нотные партитуры, 6-струнные табулатуры с
        аппликатурой и экспорт в профессиональные музыкальные редакторы.
      </p>

      <div className="help-grid-3">
        <div className="help-card" onClick={() => onOpenTab("matrix")}>
          <div className="help-card-icon">🎼</div>
          <h4>1. Гармоническая матрица</h4>
          <p>
            Исследуйте аккорды в тональности, функциональные слои (Тоника, Субдоминанта,
            Доминанта) и гармонические тяготения.
          </p>
        </div>
        <div className="help-card" onClick={() => onOpenTab("melody")}>
          <div className="help-card-icon">🎵</div>
          <h4>2. Мелодия и аранжировка</h4>
          <p>
            Создавайте мелодические линии поверх гармонии, выбирайте ритмическую сетку и
            реалистичные тембры (HQ Piano, SoundFont).
          </p>
        </div>
        <div className="help-card" onClick={() => onOpenTab("guitar")}>
          <div className="help-card-icon">🎸</div>
          <h4>3. Табулатура и пальцы</h4>
          <p>
            Просматривайте 6-струнную табулатуру с авто-расчетом аппликатуры левой руки и
            цветовой палитрой FretFlow.
          </p>
        </div>
      </div>

      <div className="help-callout info">
        <div className="help-callout-icon">💡</div>
        <div>
          <strong>Быстрый старт:</strong> выберите готовую последовательность на верхней панели
          быстрого старта (например, <em>Pop 4-Chords</em>, <em>Jazz 2-5-1</em> или <em>Autumn Leaves</em>)
          и нажмите <kbd>Пробел</kbd> для немедленного прослушивания!
        </div>
      </div>
    </article>
  );
}

function MatrixSection() {
  return (
    <article className="help-article">
      <h3>🎼 Гармоническая матрица и тяготения</h3>
      <p>
        Матрица аккордов отображает структуру лада в выбранной тональности, организуя ступени по
        их функциональной роли.
      </p>

      <h4>Функциональные слои (Layers)</h4>
      <div className="help-table-wrapper">
        <table className="help-table">
          <thead>
            <tr>
              <th>Слой</th>
              <th>Обозначение</th>
              <th>Роль в гармонии</th>
              <th>Типичные ступени</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Тоника (Tonic)</strong></td>
              <td><span className="help-badge tonic">T</span></td>
              <td>Устойчивость, центр притяжения, завершение фраз</td>
              <td>I, vi, iii</td>
            </tr>
            <tr>
              <td><strong>Субдоминанта (Subdominant)</strong></td>
              <td><span className="help-badge subdominant">S</span></td>
              <td>Движение в сторону от центра, контраст, мягкое напряжение</td>
              <td>IV, ii</td>
            </tr>
            <tr>
              <td><strong>Доминанта (Dominant)</strong></td>
              <td><span className="help-badge dominant">D</span></td>
              <td>Максимальное тяготение, острое желание разрешиться в тонику</td>
              <td>V, vii°</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h4>Стрелки гармонических тяготений (Resolution Arrows)</h4>
      <p>
        В матрице отображаются стрелки между аккордами. Они подсказывают классические и джазовые
        цепочки разрешения (например, <code>ii → V → I</code> или <code>IV → V → I</code>). Включение/выключение
        стрелок доступно в меню <strong>View → Resolution arrows</strong>.
      </p>

      <h4>Модальные лады и плагины</h4>
      <p>
        Через переключатель тональностей и меню <strong>View → Scales & Modes Explorer</strong> можно
        исследовать любые модальные лады: Дорийский, Фригийский, Лидийский, Миксолидийский, Локрийский,
        гармонический и мелодический минор.
      </p>
    </article>
  );
}

function MelodySection() {
  return (
    <article className="help-article">
      <h3>🎵 Мелодия и инструменты</h3>
      <p>
        CadenceFlow позволяет сочинять мелодию поверх аккордовой сетки с точной синхронизацией по тактам.
      </p>

      <h4>Создание мелодии</h4>
      <ul>
        <li>
          <strong>Клик правой кнопкой мыши</strong> по любому аккорду в прогрессии → выберите пункт{" "}
          <em>«Create Melody»</em> или <em>«Edit Melody»</em>.
        </li>
        <li>
          В открывшемся редакторе мелодий можно задавать ноты на нотном стане, менять длительности,
          выбирать контур движения (<em>Pitch Motion</em>: Stepwise Up, Arpeggio, Contour Arch)
          и квантовать по ритмической сетке.
        </li>
      </ul>

      <h4>Аудио движки и тембры</h4>
      <div className="help-grid-2">
        <div className="help-card">
          <h4>🎹 HQ Sample Piano</h4>
          <p>
            Высококачественный многослойный стерео-семплер концертного рояля с динамическими слоями
            громкости (velocity layers).
          </p>
        </div>
        <div className="help-card">
          <h4>🎺 SpessaSynth SoundFont</h4>
          <p>
            Аппаратный синтезатор SoundFont для воспроизведения мелодических инструментов: флейта,
            скрипка, акустическая гитара, труба и бас.
          </p>
        </div>
      </div>
    </article>
  );
}

function GuitarSection({ onOpenFingeringLegend }: { onOpenFingeringLegend?: (() => void) | undefined }) {
  return (
    <article className="help-article">
      <h3>🎸 Гитара, табулатура и аппликатура</h3>
      <p>
        В режиме <strong>Tablature</strong> аккорды и мелодия раскладываются на 6 струн стандартного
        гитарного строя (E-A-D-G-B-e).
      </p>

      <h4>Автоматический расчет аппликатуры левой руки</h4>
      <p>
        Приложение использует алгоритм динамического программирования (Viterbi / кратчайший путь)
        для подбора оптимальной расстановки пальцев (1–4) на грифе с минимальной физической нагрузкой
        на кисть музыканта.
      </p>

      <h4>Цветовая кодировка пальцев (Стандарт FretFlow)</h4>
      <p>
        Цвета пальцев левой руки полностью синхронизированы с экосистемой FretFlow:
      </p>

      <div className="help-finger-palette">
        <div className="help-finger-card">
          <span className="help-finger-badge finger-1">1</span>
          <div>
            <strong>Указательный</strong>
            <span>Index · #f7aa06 (Янтарный)</span>
          </div>
        </div>
        <div className="help-finger-card">
          <span className="help-finger-badge finger-2">2</span>
          <div>
            <strong>Средний</strong>
            <span>Middle · #c920ff (Фиолетовый)</span>
          </div>
        </div>
        <div className="help-finger-card">
          <span className="help-finger-badge finger-3">3</span>
          <div>
            <strong>Безымянный</strong>
            <span>Ring · #00affe (Голубой)</span>
          </div>
        </div>
        <div className="help-finger-card">
          <span className="help-finger-badge finger-4">4</span>
          <div>
            <strong>Мизинец</strong>
            <span>Pinky · #f56e50 (Коралловый)</span>
          </div>
        </div>
        <div className="help-finger-card">
          <span className="help-finger-badge finger-0">0</span>
          <div>
            <strong>Открытая струна</strong>
            <span>Open · #9ca3af (Серый, без прижатия)</span>
          </div>
        </div>
      </div>

      <h4>Режимы отображения на табулатуре</h4>
      <div className="help-grid-3">
        <div className="help-card">
          <h4>● Подложка под ладом</h4>
          <p>
            <em>(Рекомендуется)</em> Номер лада отображается белым текстом внутри цветного кружка
            соответствующего пальца. Не загромождает табулатуру.
          </p>
        </div>
        <div className="help-card">
          <h4>· Точки рядом</h4>
          <p>
            Рядом с номером лада размещается компактная цветная точка без цифры.
          </p>
        </div>
        <div className="help-card">
          <h4>① С номерами</h4>
          <p>
            Рядом с ладом выводится кружок с цифрой пальца 1–4.
          </p>
        </div>
      </div>

      {onOpenFingeringLegend ? (
        <div className="help-action-row">
          <button
            type="button"
            className="help-action-button"
            onClick={onOpenFingeringLegend}
          >
            🖐 Открыть схему левой руки и палитру пальцев
          </button>
        </div>
      ) : null}
    </article>
  );
}

function ExportSection() {
  return (
    <article className="help-article">
      <h3>💾 Экспорт и сохранение проектов</h3>
      <p>
        CadenceFlow обеспечивает экспорт в общепринятые форматы музыкальной индустрии через меню{" "}
        <strong>Export</strong> на верхней панели.
      </p>

      <div className="help-table-wrapper">
        <table className="help-table">
          <thead>
            <tr>
              <th>Формат</th>
              <th>Расширение</th>
              <th>Назначение</th>
              <th>Совместимость</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Стандартный MIDI</strong></td>
              <td><code>.mid</code></td>
              <td>Полноценный MIDI-файл с отдельными дорожками аккордов, баса и мелодии</td>
              <td>Любые DAW: Reaper, Ableton, FL Studio, Logic, Cubase</td>
            </tr>
            <tr>
              <td><strong>MusicXML Партитура</strong></td>
              <td><code>.musicxml</code></td>
              <td>Нотная партитура и табулатура со знаками альтерации, ключами и ритмом</td>
              <td>Guitar Pro 7/8, MuseScore 4, Sibelius, Dorico, Finale</td>
            </tr>
            <tr>
              <td><strong>Проект CadenceFlow</strong></td>
              <td><code>.cadenceflow</code></td>
              <td>Полный снимок проекта в формате JSON со всеми настройками</td>
              <td>Перенос между устройствами и браузерами</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="help-callout success">
        <div className="help-callout-icon">📁</div>
        <div>
          Все изменения автоматически сохраняются в локальной базе данных браузера (IndexedDB).
          Вы можете открывать несколько вкладок проектов и переключаться между ними в шапке окна.
        </div>
      </div>
    </article>
  );
}

function ShortcutsSection() {
  return (
    <article className="help-article">
      <h3>⌨️ Горячие клавиши (Keyboard Shortcuts)</h3>
      <p>Используйте горячие клавиши для быстрой и комфортной работы:</p>

      <div className="help-table-wrapper">
        <table className="help-table">
          <thead>
            <tr>
              <th>Клавиша</th>
              <th>Действие</th>
              <th>Область действия</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><kbd>Пробел</kbd></td>
              <td>Воспроизведение / Пауза (Play / Pause)</td>
              <td>Глобально</td>
            </tr>
            <tr>
              <td><kbd>F1</kbd></td>
              <td>Открыть Справочный центр (Help Center)</td>
              <td>Глобально</td>
            </tr>
            <tr>
              <td><kbd>Ctrl</kbd> + <kbd>Z</kbd></td>
              <td>Отменить последнее действие (Undo)</td>
              <td>Глобально</td>
            </tr>
            <tr>
              <td><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd></td>
              <td>Повторить отмененное действие (Redo)</td>
              <td>Глобально</td>
            </tr>
            <tr>
              <td><kbd>Esc</kbd></td>
              <td>Закрыть активный диалог / снять выделение</td>
              <td>Модальные окна, меню</td>
            </tr>
            <tr>
              <td><kbd>Delete</kbd> / <kbd>Backspace</kbd></td>
              <td>Удалить выбранный аккорд из прогрессии</td>
              <td>Прогрессия</td>
            </tr>
            <tr>
              <td><kbd>←</kbd> / <kbd>→</kbd></td>
              <td>Выбор предыдущего / следующего аккорда</td>
              <td>Прогрессия, нотный стан</td>
            </tr>
            <tr>
              <td><kbd>↑</kbd> / <kbd>↓</kbd></td>
              <td>Навигация по ступеням и функциям</td>
              <td>Гармоническая матрица</td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>
  );
}

function AboutSection() {
  return (
    <article className="help-article">
      <h3>ℹ️ О программе CadenceFlow</h3>
      <p>
        <strong>CadenceFlow</strong> — интеллектуальная студия гармонии и композиции нового поколения.
      </p>

      <div className="help-about-box">
        <div className="help-about-row">
          <span>Версия:</span>
          <strong>1.0.0 (Release)</strong>
        </div>
        <div className="help-about-row">
          <span>Архитектура:</span>
          <span>Domain-Driven Design, TypeScript, React 19</span>
        </div>
        <div className="help-about-row">
          <span>Нотная графика:</span>
          <span>VexFlow 4.2 + High-Contrast Tablature System</span>
        </div>
        <div className="help-about-row">
          <span>Синтез звука:</span>
          <span>Web Audio API, SpessaSynth SoundFont, Soundfont2</span>
        </div>
        <div className="help-about-row">
          <span>Интеграции:</span>
          <span>FretFlow Ecosystem, MIDI Spec, MusicXML 4.0</span>
        </div>
      </div>

      <p className="help-copyright">
        Разработано для музыкантов, преподавателей теории музыки и авторов композиций.
      </p>
    </article>
  );
}
