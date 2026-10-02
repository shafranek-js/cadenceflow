import { useEffect, useRef, useState } from "react";
import type { SongSection } from "../../domain/progression/progression";

export function SongSectionControls({
  stepId,
  stepNumber,
  sections,
  onCreate,
  onRename,
  onDelete,
}: {
  readonly stepId: string;
  readonly stepNumber: number;
  readonly sections: readonly SongSection[];
  readonly onCreate: (name: string) => void;
  readonly onRename: (sectionId: string, name: string) => void;
  readonly onDelete: (sectionId: string) => void;
}) {
  const [newName, setNewName] = useState("");
  const [names, setNames] = useState<Record<string, { sourceName: string; value: string }>>({});
  const newNameInputRef = useRef<HTMLInputElement | null>(null);
  const sectionNameInputRefs = useRef(new Map<string, HTMLInputElement>());
  const canonicalSections = sections.map(({ id, name }) => `${id}\u0000${name}`).join("\u0001");

  useEffect(() => {
    setNewName("");
    setNames({});
  }, [stepId, canonicalSections]);

  const sectionNameValue = (sectionId: string, canonicalName: string) => {
    const draft = names[sectionId];
    return draft?.sourceName === canonicalName ? draft.value : canonicalName;
  };

  const focusAfterDelete = (sectionId: string) => {
    const remainingSection = sections.find((section) => section.id !== sectionId);
    requestAnimationFrame(() => {
      if (remainingSection) sectionNameInputRefs.current.get(remainingSection.id)?.focus();
      else newNameInputRef.current?.focus();
    });
  };

  return (
    <section className="song-section-controls" aria-label="Song sections">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const name = newName.trim();
          if (!name) return;
          onCreate(name);
          setNewName("");
        }}
      >
        <label htmlFor={`song-section-new-${stepId}`}>New section at Step {stepNumber}</label>
        <div className="song-section-create-row">
          <input
            ref={newNameInputRef}
            id={`song-section-new-${stepId}`}
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            maxLength={60}
            placeholder="Verse, Chorus…"
            aria-label={`New section name at Step ${stepNumber}`}
          />
          <button
            type="submit"
            disabled={!newName.trim()}
            aria-label={`Create section at Step ${stepNumber}`}
          >
            Add
          </button>
        </div>
      </form>
      {sections.map((section) => (
        <form
          key={section.id}
          className="song-section-edit-row"
          onSubmit={(event) => {
            event.preventDefault();
            const name = sectionNameValue(section.id, section.name).trim();
            if (name) onRename(section.id, name);
          }}
        >
          <label htmlFor={`song-section-edit-${section.id}`}>Rename “{section.name}”</label>
          <div className="song-section-create-row">
            <input
              ref={(element) => {
                if (element) sectionNameInputRefs.current.set(section.id, element);
                else sectionNameInputRefs.current.delete(section.id);
              }}
              id={`song-section-edit-${section.id}`}
              value={sectionNameValue(section.id, section.name)}
              onChange={(event) =>
                setNames((current) => ({
                  ...current,
                  [section.id]: { sourceName: section.name, value: event.target.value },
                }))
              }
              maxLength={60}
              aria-label={`Section name: ${section.name}`}
            />
            <button type="submit" disabled={!sectionNameValue(section.id, section.name).trim()}>
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                onDelete(section.id);
                focusAfterDelete(section.id);
              }}
              aria-label={`Delete section ${section.name}`}
            >
              Delete
            </button>
          </div>
        </form>
      ))}
    </section>
  );
}
