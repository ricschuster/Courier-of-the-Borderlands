// Per-deploy storage namespacing (#278).
//
// localStorage is scoped to an origin (scheme + host), not a path. The live game,
// every PR preview, and the telemetry dashboard all sit on
// https://ricschuster.github.io, so without this they share one bucket: opening a
// preview resumes the player's real save and then writes over it.
//
// The base path already distinguishes them, and Vite hands it to the bundle as
// `import.meta.env.BASE_URL`, so no new build plumbing is needed:
//
//   prod / dev / vite preview / e2e   /Courier-of-the-Borderlands/
//   PR preview                        /Courier-of-the-Borderlands/pr-preview/pr-<N>/
//
// The one hard rule: **production keys must not change.** Renaming them for
// everyone would orphan every existing save, which is precisely the #123 failure
// mode ("save-version bump silently wipes every existing save") that the
// migration ladder exists to prevent. So the production base is the one base that
// yields no suffix, and its keys stay byte-for-byte what they have always been.
// Localhost is a separate origin regardless, so dev keeps its own bucket anyway.

/**
 * The base path production is served from. The single value that means "these are
 * the real keys". Anything else is a preview and gets its own bucket.
 */
export const PRODUCTION_BASE = '/Courier-of-the-Borderlands/';

/** Separator between a key and its namespace. Not '/', so a key stays readable. */
const NAMESPACE_SEPARATOR = '@';

/**
 * Normalize a base path so trivial spelling differences do not fork the bucket:
 * a missing trailing slash would otherwise namespace production away from itself
 * and strand every save.
 */
function normalizeBase(base: string): string {
  if (base === '') {
    return '/';
  }
  return base.endsWith('/') ? base : `${base}/`;
}

/**
 * The namespace for a given base path: empty for production, else the base
 * itself. Pure, so it is unit tested; the caller supplies the base.
 *
 * Returning the whole base rather than a prettier token is deliberate. It cannot
 * collide (two deploys with the same base *are* the same deploy), it needs no
 * parsing of a URL shape that `preview.yml` could change, and a key carrying its
 * own origin is self-explanatory in devtools.
 */
export function storageNamespace(base: string): string {
  const normalized = normalizeBase(base);
  return normalized === PRODUCTION_BASE ? '' : normalized;
}

/** Apply a namespace to a key. An empty namespace returns the key untouched. */
export function applyNamespace(key: string, namespace: string): string {
  return namespace === '' ? key : `${key}${NAMESPACE_SEPARATOR}${namespace}`;
}

/**
 * The base this bundle was built for. Guarded: `import.meta.env` is absent under
 * some tooling, and answering with the production base is the safe default (it is
 * the no-op).
 */
function currentBase(): string {
  try {
    return import.meta.env?.BASE_URL ?? PRODUCTION_BASE;
  } catch {
    return PRODUCTION_BASE;
  }
}

/**
 * Namespace a storage key for this deploy. Production keys pass through
 * unchanged; a preview gets its own.
 */
export function namespacedKey(key: string): string {
  return applyNamespace(key, storageNamespace(currentBase()));
}
