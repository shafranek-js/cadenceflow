import type { Project } from "../domain/project/project";

/**
 * Portable .cadenceflow JSON codec stubs (T124).
 */

export class InvalidPortableProjectError extends Error {
  constructor(
    message: string,
    public readonly errors?: readonly string[],
  ) {
    super(message);
    this.name = "InvalidPortableProjectError";
  }
}

export function encodePortableProject(_project: Project): string {
  throw new Error("Not implemented: T124");
}

export function decodePortableProject(_jsonString: string): Project {
  throw new Error("Not implemented: T124");
}
