// Cude.new - theme.ts (Cude product surface, 2026)
import { atom } from 'nanostores';
import { logStore } from '~/lib/cude/state/logStoreAdapter';
import { readMigrated, write, THEME_KEY, USER_PROFILE_KEY } from '~/lib/cude/state/storageKeys';

export type Theme = 'dark' | 'light';

export const kTheme = THEME_KEY;

export function themeIsDark() {
  return themeStore.get() === 'dark';
}

export const DEFAULT_THEME = 'light';

export const themeStore = atom<Theme>(initStore());

function initStore() {
  if (!import.meta.env.SSR) {
    const persistedTheme = readMigrated(kTheme) as Theme | undefined;
    const themeAttribute = document.querySelector('html')?.getAttribute('data-theme');

    return persistedTheme ?? (themeAttribute as Theme) ?? DEFAULT_THEME;
  }

  return DEFAULT_THEME;
}

export function toggleTheme() {
  const currentTheme = themeStore.get();
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

  // Update the theme store
  themeStore.set(newTheme);

  write(kTheme, newTheme);

  // Update the HTML attribute
  document.querySelector('html')?.setAttribute('data-theme', newTheme);

  // Update user profile if it exists
  try {
    const userProfile = readMigrated(USER_PROFILE_KEY);

    if (userProfile) {
      const profile = JSON.parse(userProfile);
      profile.theme = newTheme;
      write(USER_PROFILE_KEY, JSON.stringify(profile));
    }
  } catch (error) {
    logStore.logError('The theme could not be saved to your profile', error);
  }

  logStore.logSystem(`Theme changed to ${newTheme} mode`);
}
