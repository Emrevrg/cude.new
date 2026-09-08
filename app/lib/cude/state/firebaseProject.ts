/**
 * Cude.new — the Firebase project a conversation builds against.
 *
 * Firebase is configured differently from Supabase, and the difference is
 * worth stating rather than papering over. Supabase hands out a personal
 * access token that lists your projects, so Cude can offer them and fetch the
 * keys. Firebase has no such token: its management API wants a Google OAuth
 * flow, and the thing a generated app actually needs is the web app config
 * object that the Firebase console prints — apiKey, authDomain, projectId and
 * the rest.
 *
 * So this asks for that object directly. It is the shortest honest path: no
 * sign-in that leads nowhere, and the values are exactly what the generated
 * code will use.
 *
 * Every value here is public by design. A Firebase web config ships in the
 * client bundle of every Firebase app; access is controlled by security rules
 * on the project, not by hiding these strings.
 */

import { atom, map } from 'nanostores';
import { readStored, writeStored, removeStored } from './browserStore';
import { cudeEventLog } from './eventLog';

const STORED_KEY = 'cude.firebase.project';

/** The web app config, as the Firebase console prints it. */
export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  measurementId?: string;
  databaseURL?: string;
}

export interface FirebaseProjectState {
  config?: FirebaseConfig;
  error?: string;
}

/** The fields without which a Firebase app cannot start. */
const REQUIRED: (keyof FirebaseConfig)[] = ['apiKey', 'authDomain', 'projectId'];

export interface ParseResult {
  ok: boolean;
  config?: FirebaseConfig;
  problem?: string;
}

/**
 * Finds the braces that hold the config.
 *
 * The console offers the whole snippet, imports and `initializeApp` included,
 * so taking everything between the first brace and the last one spans from the
 * import's `{ initializeApp }` to the end of the file. This walks each balanced
 * `{...}` and takes the first that mentions an apiKey.
 */
function findConfigObject(text: string): string | null {
  let openedAt = -1;
  let depth = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '{') {
      if (depth === 0) {
        openedAt = i;
      }

      depth++;
      continue;
    }

    if (char !== '}' || depth === 0) {
      continue;
    }

    depth--;

    if (depth === 0 && openedAt !== -1) {
      const candidate = text.slice(openedAt, i + 1);

      if (/apiKey/.test(candidate)) {
        return candidate;
      }

      openedAt = -1;
    }
  }

  return null;
}

/**
 * Reads a config out of whatever the person pasted.
 *
 * The console offers it as a JavaScript object literal, people paste it with
 * `const firebaseConfig =` still attached, and some paste plain JSON. All three
 * are the same thing, and refusing two of them would be a papercut on the one
 * step of this feature.
 */
export function parseFirebaseConfig(input: string): ParseResult {
  const text = input.trim();

  if (!text) {
    return { ok: false, problem: 'Paste the config object from your Firebase console.' };
  }

  const body = findConfigObject(text);

  if (!body) {
    return { ok: false, problem: 'That does not look like a config object.' };
  }

  let parsed: Record<string, unknown> | null = null;

  try {
    parsed = JSON.parse(body) as Record<string, unknown>;
  } catch {
    /*
     * A JavaScript object literal: unquoted keys, single quotes, a trailing
     * comma. Rewritten into JSON rather than evaluated — this is pasted text,
     * and evaluating pasted text is how you run somebody else's code.
     */
    const asJson = body
      .replace(/\/\/[^\n]*/g, '')
      .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
      .replace(/'/g, '"')
      .replace(/,(\s*[}\]])/g, '$1');

    try {
      parsed = JSON.parse(asJson) as Record<string, unknown>;
    } catch {
      return { ok: false, problem: 'Could not read that config. Paste the whole object, braces included.' };
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, problem: 'That does not look like a config object.' };
  }

  const missing = REQUIRED.filter((key) => typeof parsed[key] !== 'string' || !(parsed[key] as string).trim());

  if (missing.length > 0) {
    return { ok: false, problem: `The config is missing ${missing.join(', ')}.` };
  }

  const config: FirebaseConfig = {
    apiKey: String(parsed.apiKey),
    authDomain: String(parsed.authDomain),
    projectId: String(parsed.projectId),
  };

  for (const key of ['storageBucket', 'messagingSenderId', 'appId', 'measurementId', 'databaseURL'] as const) {
    if (typeof parsed[key] === 'string' && (parsed[key] as string).trim()) {
      config[key] = String(parsed[key]);
    }
  }

  return { ok: true, config };
}

export class FirebaseProject {
  readonly state = map<FirebaseProjectState>({});

  /** True once there is a config a generated app could use. */
  readonly ready = atom<boolean>(false);

  constructor() {
    const stored = readStored<FirebaseConfig>(STORED_KEY);

    if (stored && REQUIRED.every((key) => typeof stored[key] === 'string')) {
      this.state.setKey('config', stored);
      this.ready.set(true);
    }
  }

  /** Accepts a pasted config, or reports why it cannot. */
  connect(input: string): ParseResult {
    const result = parseFirebaseConfig(input);

    if (!result.ok || !result.config) {
      this.state.setKey('error', result.problem);
      return result;
    }

    this.state.set({ config: result.config });
    this.ready.set(true);
    writeStored(STORED_KEY, result.config);
    cudeEventLog.append({
      level: 'success',
      source: 'settings',
      message: `Connected to Firebase project ${result.config.projectId}`,
    });

    return result;
  }

  /** Forgets the project. The Firebase project itself is untouched. */
  disconnect(): void {
    this.state.set({});
    this.ready.set(false);
    removeStored(STORED_KEY);
    cudeEventLog.append({ level: 'info', source: 'settings', message: 'Disconnected from Firebase' });
  }

  /**
   * The config as environment variables, for a generated project.
   *
   * The `VITE_` prefix is what a Vite app needs to see them at build time, and
   * every starter template here is Vite.
   */
  environment(): Record<string, string> {
    const { config } = this.state.get();

    if (!config) {
      return {};
    }

    const entries: Record<string, string> = {
      VITE_FIREBASE_API_KEY: config.apiKey,
      VITE_FIREBASE_AUTH_DOMAIN: config.authDomain,
      VITE_FIREBASE_PROJECT_ID: config.projectId,
    };

    if (config.storageBucket) {
      entries.VITE_FIREBASE_STORAGE_BUCKET = config.storageBucket;
    }

    if (config.messagingSenderId) {
      entries.VITE_FIREBASE_MESSAGING_SENDER_ID = config.messagingSenderId;
    }

    if (config.appId) {
      entries.VITE_FIREBASE_APP_ID = config.appId;
    }

    if (config.databaseURL) {
      entries.VITE_FIREBASE_DATABASE_URL = config.databaseURL;
    }

    return entries;
  }
}

export const firebaseProject = new FirebaseProject();
