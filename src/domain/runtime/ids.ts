/**
 * Identifier allocation for the domain layer.
 *
 * The domain must stay host-agnostic: it is the innermost layer and is type-checked without
 * `lib.dom`, which is exactly what `tsconfig.domain.json` enforces. Reaching for the ambient
 * `crypto` global tied it to a browser global (and, in Node, to a version where that global
 * exists), and it made the layering configs unbuildable — so they were never wired into the
 * build and the boundary was unenforced.
 *
 * This adapter declares the one host capability the domain needs and degrades safely when it is
 * absent, so the domain compiles and runs anywhere.
 */

interface CryptoLike {
  randomUUID?: () => string;
}

/**
 * Returns a RFC 4122 identifier.
 *
 * Falls back to a timestamp-plus-random identifier when `randomUUID` is unavailable. That path
 * is not cryptographically strong, which is fine: these identifiers only need to be unique within
 * one project, and the same fallback already backs `createProjectId`.
 */
export function createEntityId(): string {
  const cryptoLike = (globalThis as { crypto?: CryptoLike }).crypto;
  if (typeof cryptoLike?.randomUUID === "function") {
    return cryptoLike.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
