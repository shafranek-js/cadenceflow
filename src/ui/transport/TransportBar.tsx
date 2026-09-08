import { useState, useEffect, useId, type ChangeEvent } from "react";
import type { Project } from "../../domain/project/project";
import type { Meter, MeterChangePolicy } from "../../domain/timing/meter";
import { meter } from "../../domain/timing/meter";
import type { GrooveSettings } from "../../domain/timing/swing";
import { musicalDuration, type MusicalDuration } from "../../domain/timing/duration";
import { rational } from "../../domain/timing/rational";
import type { LoopMode, LoopState } from "./loopState";
import { MetronomeControls } from "./MetronomeControls";
import { StepDurationControl } from "../timing/StepDurationControl";
import { formatDurationBeats } from "../timing/stepDuration";

export interface TransportBarProps {
  readonly project: Project;
  readonly loopState: LoopState;
  readonly metronomeEnabled: boolean;
  readonly countInEnabled: boolean;
  readonly onSetTempo: (tempoBpm: number) => void;
  readonly onSetMeter: (newMeter: Meter, policy: MeterChangePolicy) => void;
  readonly onSetGroove: (groove: GrooveSettings) => void;
  readonly onSetStepDuration: (stepId: string, duration: MusicalDuration) => void;
  readonly onSetLoopMode: (mode: LoopMode) => void;
  readonly onSetLoopRange: (startStepId: string, endStepId: string) => void;
  readonly onToggleMetronome: () => void;
  readonly onToggleCountIn: () => void;
  readonly onUndo?: () => void;
  readonly canUndo?: boolean;
  readonly onRedo?: () => void;
  readonly canRedo?: boolean;
}

export function TransportBar({
  project,
  loopState,
  metronomeEnabled,
  countInEnabled,
  onSetTempo,
  onSetMeter,
  onSetGroove,
  onSetStepDuration,
  onSetLoopMode,
  onSetLoopRange,
  onToggleMetronome,
  onToggleCountIn,
  onUndo,
  canUndo,
  onRedo,
  canRedo,
}: TransportBarProps) {
  const tempoInputId = useId();
  const meterNumId = useId();
  const meterDenId = useId();
  const meterGroupingId = useId();
  const swingSliderId = useId();

  // Local Meter state
  const currentMeter = project.globalTiming.meter;
  const [meterNum, setMeterNum] = useState(currentMeter.numerator);
  const [meterDen, setMeterDen] = useState<Meter["denominator"]>(currentMeter.denominator);
  const [groupingText, setGroupingText] = useState(currentMeter.grouping.join("+"));
  const [meterPolicy, setMeterPolicy] = useState<MeterChangePolicy>("reflow");
  const [groupingError, setGroupingError] = useState<string | null>(null);

  // Sync meter form when project meter changes externally
  useEffect(() => {
    setMeterNum(currentMeter.numerator);
    setMeterDen(currentMeter.denominator);
    setGroupingText(currentMeter.grouping.join("+"));
    setGroupingError(null);
  }, [currentMeter.numerator, currentMeter.denominator, currentMeter.grouping]);

  // Selected progression step
  const selectedStepId = project.progression.selectedStepId;
  const selectedStep = selectedStepId
    ? project.progression.steps.find((s) => s.id === selectedStepId)
    : undefined;

  // Parse & validate grouping input
  const parseGrouping = (
    text: string,
    expectedNum: number,
  ): { grouping: number[]; error: string | null } => {
    const trimmed = text.trim();
    if (!trimmed) {
      return { grouping: [expectedNum], error: null };
    }
    const parts = trimmed
      .split(/[+, ]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) {
      return { grouping: [expectedNum], error: null };
    }
    const numbers: number[] = [];
    for (const p of parts) {
      const parsed = parseInt(p, 10);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        return { grouping: [], error: `Invalid group element "${p}": must be positive integer` };
      }
      numbers.push(parsed);
    }
    const sum = numbers.reduce((a, b) => a + b, 0);
    if (sum !== expectedNum) {
      return {
        grouping: [],
        error: `Grouping sum (${sum}) does not equal numerator (${expectedNum})`,
      };
    }
    return { grouping: numbers, error: null };
  };

  const handleGroupingChange = (e: ChangeEvent<HTMLInputElement>) => {
    const nextText = e.target.value;
    setGroupingText(nextText);
    const { error } = parseGrouping(nextText, meterNum);
    setGroupingError(error);
  };

  const handleNumeratorChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (Number.isFinite(val) && val > 0 && val <= 32) {
      setMeterNum(val);
      const { error } = parseGrouping(groupingText, val);
      setGroupingError(error);
    }
  };

  const handleApplyMeter = () => {
    const { grouping, error } = parseGrouping(groupingText, meterNum);
    if (error) {
      setGroupingError(error);
      return;
    }
    try {
      const validatedMeter = meter(meterNum, meterDen, grouping);
      onSetMeter(validatedMeter, meterPolicy);
      setGroupingError(null);
    } catch (err) {
      setGroupingError(String(err));
    }
  };

  // Groove handlers
  const [cachedSwingAmount, setCachedSwingAmount] = useState(
    project.groove.swingAmount > 0 ? project.groove.swingAmount : 0.66,
  );

  useEffect(() => {
    if (project.groove.swingAmount > 0) {
      setCachedSwingAmount(project.groove.swingAmount);
    }
  }, [project.groove.swingAmount]);

  const handleGrooveToggle = () => {
    const isCurrentlySwing = project.groove.feel === "swing";
    const nextGroove: GrooveSettings = isCurrentlySwing
      ? { feel: "straight", swingAmount: 0 }
      : { feel: "swing", swingAmount: cachedSwingAmount };
    onSetGroove(nextGroove);
  };

  const handleSwingAmountChange = (e: ChangeEvent<HTMLInputElement>) => {
    const amount = parseFloat(e.target.value);
    if (Number.isFinite(amount)) {
      setCachedSwingAmount(amount);
      onSetGroove({
        feel: amount > 0 ? "swing" : "straight",
        swingAmount: amount,
      });
    }
  };

  // Loop handlers
  const steps = project.progression.steps;
  const loopRegion = loopState.region;

  const handleLoopRangeStartChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const startId = e.target.value;
    const endId = loopRegion?.endStepId ?? steps[steps.length - 1]?.id;
    if (startId && endId) {
      onSetLoopRange(startId, endId);
    }
  };

  const handleLoopRangeEndChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const endId = e.target.value;
    const startId = loopRegion?.startStepId ?? steps[0]?.id;
    if (startId && endId) {
      onSetLoopRange(startId, endId);
    }
  };

  return (
    <nav className="transport-bar" aria-label="Playback Transport">
      {/* History remains global; playback transport is owned by My Progression. */}
      <div
        className="transport-section transport-history"
        role="group"
        aria-label="History Controls"
      >
        {onUndo && (
          <button
            type="button"
            className="transport-button transport-undo"
            onClick={onUndo}
            disabled={!canUndo}
            aria-label="Undo"
            title="Undo last action (Ctrl+Z)"
          >
            <span className="transport-btn-icon" aria-hidden="true">
              ↶
            </span>
            <span className="transport-btn-label">Undo</span>
          </button>
        )}

        {onRedo && (
          <button
            type="button"
            className="transport-button transport-redo"
            onClick={onRedo}
            disabled={!canRedo}
            aria-label="Redo"
            title="Redo last undone action (Ctrl+Shift+Z or Ctrl+Y)"
          >
            <span className="transport-btn-icon" aria-hidden="true">
              ↷
            </span>
            <span className="transport-btn-label">Redo</span>
          </button>
        )}
      </div>

      {/* 2. Tempo Controls */}
      <div className="transport-section transport-tempo" role="group" aria-label="Tempo Controls">
        <label htmlFor={tempoInputId} className="transport-label">
          Tempo
        </label>
        <div className="tempo-input-group">
          <button
            type="button"
            className="tempo-stepper-btn"
            onClick={() => onSetTempo(Math.max(30, project.globalTiming.tempoBpm - 5))}
            aria-label="Decrease tempo by 5 BPM"
            title="-5 BPM"
          >
            -
          </button>
          <input
            id={tempoInputId}
            type="number"
            min={30}
            max={300}
            value={project.globalTiming.tempoBpm}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (Number.isFinite(val) && val >= 30 && val <= 300) {
                onSetTempo(val);
              }
            }}
            className="tempo-number-input"
            aria-label="Tempo in BPM"
          />
          <button
            type="button"
            className="tempo-stepper-btn"
            onClick={() => onSetTempo(Math.min(300, project.globalTiming.tempoBpm + 5))}
            aria-label="Increase tempo by 5 BPM"
            title="+5 BPM"
          >
            +
          </button>
          <span className="tempo-unit">BPM</span>
        </div>
      </div>

      {/* 3. Meter and Grouping Controls */}
      <div
        className="transport-section transport-meter"
        role="group"
        aria-label="Time Signature and Meter"
      >
        <span className="transport-label">Meter</span>
        <div className="meter-controls-group">
          <input
            id={meterNumId}
            type="number"
            min={1}
            max={32}
            value={meterNum}
            onChange={handleNumeratorChange}
            className="meter-num-input"
            aria-label="Meter numerator"
          />
          <span className="meter-divider">/</span>
          <select
            id={meterDenId}
            value={meterDen}
            onChange={(e) => setMeterDen(parseInt(e.target.value, 10) as Meter["denominator"])}
            className="meter-den-select"
            aria-label="Meter denominator"
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={4}>4</option>
            <option value={8}>8</option>
            <option value={16}>16</option>
            <option value={32}>32</option>
          </select>

          <div className="grouping-control">
            <input
              id={meterGroupingId}
              type="text"
              value={groupingText}
              onChange={handleGroupingChange}
              placeholder="e.g. 3+2+2"
              className={`meter-grouping-input ${groupingError ? "has-error" : ""}`}
              aria-label="Pulse grouping"
              title="Pulse grouping pattern (e.g. 3+2+2)"
            />
          </div>

          <div className="meter-policy-toggle" role="radiogroup" aria-label="Meter Change Policy">
            <label className={`policy-option ${meterPolicy === "reflow" ? "is-selected" : ""}`}>
              <input
                type="radio"
                name="meter-policy"
                value="reflow"
                aria-label="Reflow"
                checked={meterPolicy === "reflow"}
                onChange={() => setMeterPolicy("reflow")}
              />
              Reflow
            </label>
            <label
              className={`policy-option ${meterPolicy === "preserve-beat-lengths" ? "is-selected" : ""}`}
            >
              <input
                type="radio"
                name="meter-policy"
                value="preserve-beat-lengths"
                aria-label="Preserve"
                checked={meterPolicy === "preserve-beat-lengths"}
                onChange={() => setMeterPolicy("preserve-beat-lengths")}
              />
              Preserve
            </label>
          </div>

          <button
            type="button"
            className="meter-apply-btn"
            onClick={handleApplyMeter}
            disabled={Boolean(groupingError)}
            aria-label="Apply Meter Change"
          >
            Apply
          </button>
        </div>
        {groupingError ? (
          <span className="grouping-error-message" role="alert">
            {groupingError}
          </span>
        ) : null}
      </div>

      {/* 4. Selected Step Duration Editor */}
      <div
        className="transport-section transport-step-duration"
        role="group"
        aria-label="Step Duration Editor"
      >
        <span className="transport-label">
          Step Duration {selectedStep ? `(${formatDurationBeats(selectedStep.duration)})` : ""}
        </span>
        <StepDurationControl
          variant="buttons"
          value={selectedStep?.duration ?? musicalDuration(rational(4, 1))}
          onChange={(dur) => selectedStepId && onSetStepDuration(selectedStepId, dur)}
          disabled={!selectedStepId}
        />
      </div>

      {/* 5. Groove / Swing Controls */}
      <div
        className="transport-section transport-groove"
        role="group"
        aria-label="Groove and Swing"
      >
        <span className="transport-label">Groove</span>
        <div className="groove-controls-group">
          <button
            type="button"
            className={`groove-toggle-btn ${project.groove.feel === "swing" ? "is-active" : ""}`}
            onClick={handleGrooveToggle}
            aria-pressed={project.groove.feel === "swing"}
            aria-label="Toggle Swing Feel"
          >
            {project.groove.feel === "swing" ? "Swing" : "Straight"}
          </button>

          {project.groove.feel === "swing" && (
            <div className="swing-slider-group">
              <input
                id={swingSliderId}
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={project.groove.swingAmount}
                onChange={handleSwingAmountChange}
                className="swing-slider"
                aria-label="Swing Amount"
              />
              <span className="swing-percent">{Math.round(project.groove.swingAmount * 100)}%</span>
            </div>
          )}
        </div>
      </div>

      {/* 6. Loop Controls */}
      <div className="transport-section transport-loop" role="group" aria-label="Loop Controls">
        <span className="transport-label">Loop</span>
        <div className="loop-controls-group">
          <div className="loop-mode-selector" role="radiogroup" aria-label="Loop Mode">
            <button
              type="button"
              className={`loop-mode-btn ${loopState.mode === "disabled" ? "is-active" : ""}`}
              onClick={() => onSetLoopMode("disabled")}
              aria-pressed={loopState.mode === "disabled"}
            >
              Off
            </button>
            <button
              type="button"
              className={`loop-mode-btn ${loopState.mode === "all" ? "is-active" : ""}`}
              onClick={() => onSetLoopMode("all")}
              aria-pressed={loopState.mode === "all"}
            >
              All
            </button>
            <button
              type="button"
              className={`loop-mode-btn ${loopState.mode === "range" ? "is-active" : ""}`}
              onClick={() => onSetLoopMode("range")}
              aria-pressed={loopState.mode === "range"}
            >
              Range
            </button>
          </div>

          {loopState.mode === "range" && steps.length > 0 && (
            <div className="loop-range-selectors">
              <label className="loop-range-label">
                From:
                <select
                  value={loopRegion?.startStepId ?? steps[0]?.id}
                  onChange={handleLoopRangeStartChange}
                  className="loop-step-select"
                  aria-label="Loop start step"
                >
                  {steps.map((s, idx) => (
                    <option key={s.id} value={s.id}>
                      {idx + 1}: {s.kind === "chord" ? s.harmonicFunction.functionId : "Rest"}
                    </option>
                  ))}
                </select>
              </label>

              <label className="loop-range-label">
                To:
                <select
                  value={loopRegion?.endStepId ?? steps[steps.length - 1]?.id}
                  onChange={handleLoopRangeEndChange}
                  className="loop-step-select"
                  aria-label="Loop end step"
                >
                  {steps.map((s, idx) => (
                    <option key={s.id} value={s.id}>
                      {idx + 1}: {s.kind === "chord" ? s.harmonicFunction.functionId : "Rest"}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>
      </div>

      {/* 7. Metronome and Count-In Controls */}
      <div className="transport-section transport-metronome">
        <MetronomeControls
          metronomeEnabled={metronomeEnabled}
          countInEnabled={countInEnabled}
          onToggleMetronome={onToggleMetronome}
          onToggleCountIn={onToggleCountIn}
        />
      </div>
    </nav>
  );
}
