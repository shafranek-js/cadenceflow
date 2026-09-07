export const MAX_PROJECT_NAME_LENGTH = 100;

export class InvalidProjectNameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidProjectNameError";
  }
}

/**
 * Normalizes and validates names entered for local named projects.
 * Project IDs remain the storage identity; names are presentation metadata.
 */
export function normalizeProjectName(rawName: string): string {
  if (typeof rawName !== "string") {
    throw new InvalidProjectNameError("Project name must be a string.");
  }

  const name = rawName.trim();
  if (!name) {
    throw new InvalidProjectNameError("Project name cannot be empty.");
  }
  if (name.length > MAX_PROJECT_NAME_LENGTH) {
    throw new InvalidProjectNameError(
      `Project name cannot exceed ${MAX_PROJECT_NAME_LENGTH} characters.`,
    );
  }
  return name;
}
