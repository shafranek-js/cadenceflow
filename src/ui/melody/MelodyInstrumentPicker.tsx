import { useMemo, useState } from "react";
import {
  MELODY_INSTRUMENT_CATALOG,
  type MelodyInstrumentCatalogEntry,
  type MelodyInstrumentId,
} from "../../domain/melody/instrumentCatalog";
import { normalizeMelodyInstrumentSearch } from "./instrumentSearch";

function optionLabel(entry: MelodyInstrumentCatalogEntry): string {
  const availability = entry.realtimeAvailability === "available" ? "Realtime" : "Export only";
  return `GM ${String(entry.program).padStart(3, "0")} · ${entry.label} · ${availability}`;
}

export function MelodyInstrumentPicker({
  value,
  onChange,
  allowInherit = false,
  trackInstrument,
  inherited = false,
  ariaLabel = "Melody Instrument",
  disabled = false,
}: {
  readonly value: MelodyInstrumentId | undefined;
  readonly onChange: (instrument: MelodyInstrumentId | undefined) => void;
  readonly allowInherit?: boolean;
  readonly trackInstrument?: MelodyInstrumentId;
  readonly inherited?: boolean;
  readonly ariaLabel?: string;
  readonly disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = normalizeMelodyInstrumentSearch(query);
  const entries = useMemo(() => {
    const filtered = MELODY_INSTRUMENT_CATALOG.filter((entry) => {
      if (!normalizedQuery) return true;
      const searchableText = normalizeMelodyInstrumentSearch(
        [
          entry.label,
          entry.family,
          entry.id,
          String(entry.program),
          String(entry.program + 1),
          optionLabel(entry),
        ].join(" "),
      );
      return normalizedQuery.split(" ").every((token) => searchableText.includes(token));
    });
    if (value && !filtered.some((entry) => entry.id === value)) {
      const current = MELODY_INSTRUMENT_CATALOG.find((entry) => entry.id === value);
      if (current) return [current, ...filtered];
    }
    return filtered;
  }, [normalizedQuery, value]);

  const groupedEntries = useMemo(() => {
    const groups = new Map<string, MelodyInstrumentCatalogEntry[]>();
    for (const entry of entries) {
      const group = groups.get(entry.family) ?? [];
      group.push(entry);
      groups.set(entry.family, group);
    }
    return groups;
  }, [entries]);

  const inheritedLabel = trackInstrument
    ? (() => {
        const track = MELODY_INSTRUMENT_CATALOG.find((entry) => entry.id === trackInstrument);
        return track ? `Use track instrument · ${optionLabel(track)}` : "Use track instrument";
      })()
    : "Use track instrument";

  return (
    <div className="melody-instrument-picker">
      <input
        type="search"
        className="melody-instrument-search"
        aria-label={`${ariaLabel} search`}
        placeholder="Search 128 GM programs"
        value={query}
        disabled={disabled}
        onChange={(event) => setQuery(event.target.value)}
      />
      <select
        aria-label={ariaLabel}
        value={value ?? ""}
        disabled={disabled}
        onChange={(event) =>
          onChange(event.target.value ? (event.target.value as MelodyInstrumentId) : undefined)
        }
      >
        {allowInherit ? <option value="">{inheritedLabel}</option> : null}
        {[...groupedEntries.entries()].map(([family, familyEntries]) => (
          <optgroup key={family} label={family}>
            {familyEntries.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {optionLabel(entry)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <span className="melody-instrument-picker-status" role="status">
        {inherited && allowInherit
          ? inheritedLabel
          : value
            ? (() => {
                const entry = MELODY_INSTRUMENT_CATALOG.find((candidate) => candidate.id === value);
                return entry ? optionLabel(entry) : "Unknown instrument";
              })()
            : inheritedLabel}
      </span>
    </div>
  );
}
