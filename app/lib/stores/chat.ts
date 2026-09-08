// Cude.new - chat.ts (Cude product surface, 2026)
import { map } from 'nanostores';

export const chatStore = map({
  started: false,
  aborted: false,
  showChat: true,
});
