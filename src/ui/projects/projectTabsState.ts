import type { OpenProjectTabsState } from "../../persistence/projectRepository";

const LEGACY_OPEN_PROJECT_TABS_STORAGE_KEY = "cadenceflow.open-project-tabs";
const OPEN_PROJECT_TABS_MIRROR_STORAGE_KEY = "cadenceflow.open-project-tabs.v8";

function normalizeProjectIds(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) return null;

  const ids = value.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
  return [...new Set(ids)];
}

export function readLegacyOpenProjectIds(): readonly string[] | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(LEGACY_OPEN_PROJECT_TABS_STORAGE_KEY);
    if (!raw) return null;
    return normalizeProjectIds(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function persistLegacyOpenProjectIds(ids: readonly string[]): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      LEGACY_OPEN_PROJECT_TABS_STORAGE_KEY,
      JSON.stringify(normalizeProjectIds(ids) ?? []),
    );
  } catch {
    // Tab visibility is a best-effort UI preference when storage is unavailable.
  }
}

export function readOpenProjectTabsMirror(): OpenProjectTabsState | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(OPEN_PROJECT_TABS_MIRROR_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as {
      ids?: unknown;
      source?: unknown;
      updatedAt?: unknown;
    };
    const ids = normalizeProjectIds(value.ids);
    if (
      !ids ||
      (value.source !== "initial" && value.source !== "user") ||
      typeof value.updatedAt !== "number" ||
      !Number.isFinite(value.updatedAt)
    ) {
      return null;
    }
    return { ids, source: value.source, updatedAt: value.updatedAt };
  } catch {
    return null;
  }
}

export function persistOpenProjectTabsMirror(state: OpenProjectTabsState): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(OPEN_PROJECT_TABS_MIRROR_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // The IndexedDB metadata record remains the durable source when the mirror is unavailable.
  }
}
