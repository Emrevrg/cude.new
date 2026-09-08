// Cude.new - profile.ts (Cude product surface, 2026)
import { atom } from 'nanostores';
import { readMigrated, write, PROFILE_KEY } from '~/lib/cude/state/storageKeys';

interface Profile {
  username: string;
  bio: string;
  avatar: string;
}

// Initialize with stored profile or defaults
const storedProfile = readMigrated(PROFILE_KEY);
const initialProfile: Profile = storedProfile
  ? JSON.parse(storedProfile)
  : {
      username: '',
      bio: '',
      avatar: '',
    };

export const profileStore = atom<Profile>(initialProfile);

export const updateProfile = (updates: Partial<Profile>) => {
  profileStore.set({ ...profileStore.get(), ...updates });

  // Persist to localStorage
  if (typeof window !== 'undefined') {
    write(PROFILE_KEY, JSON.stringify(profileStore.get()));
  }
};
