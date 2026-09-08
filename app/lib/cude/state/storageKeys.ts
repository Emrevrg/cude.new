export const THEME_KEY = 'cude.theme';
export const PROFILE_KEY = 'cude.profile';
export const USER_PROFILE_KEY = 'cude.userProfile';

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Storage disabled entirely.
    return null;
  }
}

export function readMigrated(key: string): string | null {
  const store = storage();

  if (!store) {
    return null;
  }

  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

export function write(key: string, value: string): void {
  try {
    storage()?.setItem(key, value);
  } catch {
    // Quota, or private browsing. Not worth failing the caller over.
  }
}

export function remove(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    // As above.
  }
}
