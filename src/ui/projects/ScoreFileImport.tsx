import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { readScoreFile, type ImportedScore, type ImportedInstrument } from "../../import/scoreFile";
import { useModalFocus } from "../common/useModalFocus";

export function ScoreFileImport({
  busy = false,
  onImport,
}: {
  readonly busy?: boolean;
  readonly onImport: (
    score: ImportedScore,
    instrument: ImportedInstrument,
    filename: string,
  ) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);
  useEffect(
    () => () => {
      requestRef.current++;
    },
    [],
  );
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ score: ImportedScore; filename: string } | null>(null);
  const [selected, setSelected] = useState("");
  const dialogRef = useModalFocus<HTMLElement>({
    isOpen: pending !== null,
    onClose: () => {
      if (!working) setPending(null);
    },
  });
  const apply = async (score: ImportedScore, instrument: ImportedInstrument, filename: string) => {
    if (working || busy) return;
    setWorking(true);
    setError(null);
    try {
      await onImport(score, instrument, filename);
      setPending(null);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Could not import the score.");
    } finally {
      setWorking(false);
    }
  };
  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const request = ++requestRef.current;
    setError(null);
    setWorking(true);
    try {
      const score = await readScoreFile(file);
      if (request !== requestRef.current) return;
      const supported = score.instruments.filter((instrument) => !instrument.unavailableReason);
      if (
        score.instruments.length === 1 &&
        !score.warnings?.length &&
        !supported[0]?.warnings?.length
      )
        await apply(score, supported[0]!, file.name);
      else {
        setSelected(score.instruments.length === 1 ? supported[0]!.id : "");
        setPending({ score, filename: file.name });
      }
    } catch (problem) {
      if (request !== requestRef.current) return;
      setError(problem instanceof Error ? problem.message : "Could not read the score file.");
    } finally {
      if (request === requestRef.current) setWorking(false);
    }
  };
  return (
    <>
      <button
        type="button"
        className="secondary-btn"
        disabled={busy || working}
        onClick={() => inputRef.current?.click()}
        data-testid="score-import-button"
      >
        Import MIDI / MusicXML…
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".mid,.midi,.musicxml,.xml,.mxl"
        className="project-file-input"
        aria-label="Choose a MIDI or MusicXML file"
        data-testid="score-import-file"
        onChange={(event) => void chooseFile(event)}
      />
      {error && !pending ? (
        <p className="project-error" role="alert">
          {error}
        </p>
      ) : null}
      {pending ? (
        <div className="dialog-backdrop" role="presentation">
          <section
            ref={dialogRef}
            className="project-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="score-import-title"
          >
            <header className="dialog-header">
              <h2 id="score-import-title">
                {pending.score.instruments.length > 1
                  ? "Choose an instrument to import"
                  : "Review score import"}
              </h2>
            </header>
            <div className="dialog-body">
              <p>
                Creates a new project from <strong>{pending.filename}</strong>. Your current project
                is saved separately.
              </p>
              <label htmlFor="score-import-instrument">Instrument</label>
              <select
                id="score-import-instrument"
                className="text-input"
                value={selected}
                disabled={working}
                onChange={(event) => setSelected(event.target.value)}
              >
                <option value="">Choose an instrument…</option>
                {pending.score.instruments.map((instrument) => (
                  <option
                    key={instrument.id}
                    value={instrument.id}
                    disabled={Boolean(instrument.unavailableReason)}
                  >
                    {instrument.name} —{" "}
                    {instrument.unavailableReason || `${instrument.notes.length} notes`}
                  </option>
                ))}
              </select>
              {pending.score.instruments
                .filter((instrument) => instrument.unavailableReason)
                .map((instrument) => (
                  <p key={instrument.id} className="project-dialog-note">
                    {instrument.name}: {instrument.unavailableReason}
                  </p>
                ))}
              {pending.score.warnings?.length ||
              pending.score.instruments.find((instrument) => instrument.id === selected)?.warnings
                ?.length ? (
                <div role="note" aria-label="Import limitations">
                  <p>The following details will change:</p>
                  <ul>
                    {[
                      ...new Set([
                        ...(pending.score.warnings ?? []),
                        ...(pending.score.instruments.find(
                          (instrument) => instrument.id === selected,
                        )?.warnings ?? []),
                      ]),
                    ].map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {error ? (
                <p className="project-error" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
            <footer className="dialog-actions">
              <button
                type="button"
                className="secondary-btn"
                disabled={working}
                onClick={() => setPending(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-btn"
                disabled={!selected || working || busy}
                onClick={() => {
                  const instrument = pending.score.instruments.find((item) => item.id === selected);
                  if (instrument) void apply(pending.score, instrument, pending.filename);
                }}
              >
                Create project
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
