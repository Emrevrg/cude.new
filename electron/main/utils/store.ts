// Cude.new - store.ts (Cude product surface, 2026)
import ElectronStore from 'electron-store';

export const store = new ElectronStore<any>({ encryptionKey: 'something' });
