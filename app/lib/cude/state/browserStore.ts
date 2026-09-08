/**
 * Cude.new - small browser-stored values.
 *
 * For connection details and similar per-machine state that is not part of a
 * project. Project data goes through the project store; settings go through the
 * settings domains. This is the remaining case: a value that belongs to this
 * browser and nothing else.
 *
 * Every read is total. A missing, corrupt or wrong-typed value yields the
 * fallback rather than throwing, because these are read during render.
 */

/*
 * Asked per call, not once at import. Whether storage is usable is a property
 * of the moment, not of module load order.
 */
function hasStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

/** Read a stored value, or `null` when there isn't a usable one. */
export function readStored<T = unknown>(key: string): T | null {
  if (!hasStorage()) {
    return null;
  }

  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    /*
     * Corrupt JSON is indistinguishable from absent for the caller's purposes,
     * and throwing here would break the surface that is rendering.
     */
    return null;
  }
}

/** Store a value. Silently does nothing where storage is unavailable. */
export function writeStored(key: string, value: unknown): void {
  if (!hasStorage()) {
    return;
  }

  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded, or storage disabled. Not worth failing the caller over.
  }
}

/** Forget a stored value. */
export function removeStored(key: string): void {
  if (!hasStorage()) {
    return;
  }

  try {
    localStorage.removeItem(key);
  } catch {
    // As above.
  }
}
