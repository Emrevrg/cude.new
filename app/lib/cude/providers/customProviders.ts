/**
 * Cude.new — providers someone adds themselves.
 *
 * The twenty-one built-in providers are the ones worth declaring in the source.
 * Everything else is somebody's own endpoint: a gateway at work, a proxy, a
 * model server on another machine, a vendor that launched last week. Those
 * cannot be shipped in a list, so they are added here and kept per browser.
 *
 * They all speak the OpenAI API, because that is the one contract a person can
 * reasonably expect an arbitrary endpoint to honour, and it is what every proxy
 * and gateway implements.
 */

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { ProviderDefinition } from './defineProvider';
import { readStored, writeStored } from '~/lib/cude/state/browserStore';

export const CUSTOM_PROVIDERS_KEY = 'cude.customProviders';

/**
 * The cookie that carries these to the server.
 *
 * Model discovery happens server-side, so a provider the browser knows about
 * and the server does not is listed in settings and never asked for anything.
 * Provider settings already travel this way; these follow the same path.
 */
export const CUSTOM_PROVIDERS_COOKIE = 'customProviders';

export interface CustomProvider {
  /** What it is called, and how it is addressed everywhere else. */
  name: string;

  /** Where it lives, without a trailing slash. */
  baseUrl: string;

  /** Optional: plenty of gateways on a private network want no key. */
  apiKey?: string;

  /** Models to offer without asking. Discovery fills the rest in. */
  models?: string[];
}

/** Names that would collide with something already meaningful. */
const RESERVED = new Set(['ollama', 'lmstudio', 'openailike']);

export interface ValidationResult {
  ok: boolean;
  problem?: string;
}

/**
 * Whether this is something we can actually add.
 *
 * Checked before saving rather than after, because a provider with a bad URL
 * fails later, somewhere else, in a way that reads like a network fault.
 */
export function validateCustomProvider(
  candidate: Partial<CustomProvider>,
  existing: CustomProvider[],
  builtInNames: string[] = [],
): ValidationResult {
  const name = candidate.name?.trim() ?? '';

  if (name.length < 2) {
    return { ok: false, problem: 'Give it a name.' };
  }

  if (!/^[\w .-]+$/.test(name)) {
    return { ok: false, problem: 'Use letters, numbers, spaces, dots or dashes in the name.' };
  }

  const lower = name.toLowerCase();

  if (RESERVED.has(lower) || builtInNames.some((builtIn) => builtIn.toLowerCase() === lower)) {
    return { ok: false, problem: `${name} is already a built-in provider. Pick another name.` };
  }

  if (existing.some((provider) => provider.name.toLowerCase() === lower)) {
    return { ok: false, problem: `You already have a provider called ${name}.` };
  }

  const url = candidate.baseUrl?.trim() ?? '';

  if (!url) {
    return { ok: false, problem: 'Give it a base URL.' };
  }

  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, problem: 'That base URL is not a URL.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, problem: 'The base URL has to be http or https.' };
  }

  return { ok: true };
}

/** Trailing slashes make every joined path a double slash. */
function tidyUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/** Everything the person has added, in the order they added it. */
export function readCustomProviders(): CustomProvider[] {
  const stored = readStored<CustomProvider[]>(CUSTOM_PROVIDERS_KEY);

  if (!Array.isArray(stored)) {
    return [];
  }

  // Stored by an older build, or edited by hand: keep only usable entries.
  return stored.filter(
    (entry): entry is CustomProvider =>
      typeof entry?.name === 'string' && entry.name.length > 0 && typeof entry?.baseUrl === 'string',
  );
}

export function writeCustomProviders(providers: CustomProvider[]): void {
  writeStored(CUSTOM_PROVIDERS_KEY, providers);
  publishToServer(providers);
}

/**
 * Mirrors the list into a cookie so the server sees it.
 *
 * The key is deliberately left behind: it is a credential, the server reads
 * credentials from the request that needs them, and a cookie is sent with
 * every request including ones that have no business carrying it.
 */
function publishToServer(providers: CustomProvider[]): void {
  if (typeof document === 'undefined') {
    return;
  }

  const withoutKeys = providers.map(({ name, baseUrl, models }) => ({ name, baseUrl, models }));
  const value = encodeURIComponent(JSON.stringify(withoutKeys));

  document.cookie = `${CUSTOM_PROVIDERS_COOKIE}=${value}; path=/; max-age=31536000; SameSite=Lax`;
}

/** Called on load, so a provider added in an earlier session still reaches the server. */
export function publishCustomProviders(): void {
  publishToServer(readCustomProviders());
}

/** Adds one, or says why it cannot be added. */
export function addCustomProvider(candidate: CustomProvider, builtInNames: string[] = []): ValidationResult {
  const existing = readCustomProviders();
  const check = validateCustomProvider(candidate, existing, builtInNames);

  if (!check.ok) {
    return check;
  }

  writeCustomProviders([
    ...existing,
    {
      name: candidate.name.trim(),
      baseUrl: tidyUrl(candidate.baseUrl),
      apiKey: candidate.apiKey?.trim() || undefined,
      models: candidate.models?.filter(Boolean),
    },
  ]);

  return { ok: true };
}

/** Removes one by name. Returns whether there was one to remove. */
export function removeCustomProvider(name: string): boolean {
  const existing = readCustomProviders();
  const remaining = existing.filter((provider) => provider.name !== name);

  if (remaining.length === existing.length) {
    return false;
  }

  writeCustomProviders(remaining);

  return true;
}

/** True when this name belongs to a provider the person added. */
export function isCustomProvider(name: string): boolean {
  return readCustomProviders().some((provider) => provider.name === name);
}

/**
 * Turns a saved entry into a provider the rest of Cude can use.
 *
 * The same shape as a built-in definition, so nothing downstream needs to know
 * the difference — the model picker, the settings list and the send path all
 * treat it as one more provider.
 */
export function defineCustomProvider(provider: CustomProvider): ProviderDefinition {
  return {
    name: provider.name,
    description: `Your own endpoint at ${provider.baseUrl}`,
    baseUrl: provider.baseUrl,
    apiTokenKey: `CUSTOM_${provider.name.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`,
    baseUrlKey: `CUSTOM_${provider.name.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_BASE_URL`,

    /*
     * Treated as local, which here means "needs no key from us". A private
     * gateway usually has none, and refusing to talk to it without one would
     * be wrong.
     */
    local: true,
    staticModels: (provider.models ?? []).map((model) => ({
      name: model,
      label: model,
      provider: provider.name,
      maxTokenAllowed: 8000,
    })),
    discovery: {
      url: (baseUrl) => (baseUrl ? `${baseUrl}/models` : undefined),
      defaultMaxTokens: 8000,
    },

    /*
     * `createOpenAICompatible`, not `createOpenAI`. The official OpenAI client
     * speaks to OpenAI's own current surface — it posts to /responses — and an
     * arbitrary third-party endpoint that implements /chat/completions answers
     * that with a 404 or a 410. Same lesson as the built-in OpenAI-compatible
     * providers in `moreProviders.ts`.
     */
    client: ({ apiKey, baseURL }) =>
      createOpenAICompatible({
        name: provider.name,
        apiKey: apiKey ?? provider.apiKey ?? 'not-needed',
        baseURL: baseURL ?? provider.baseUrl,
      }),
  };
}

/** Reads the providers a browser sent with its request. Never throws. */
export function readCustomProvidersFromCookie(cookieHeader: string | null): CustomProvider[] {
  if (!cookieHeader) {
    return [];
  }

  const entry = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${CUSTOM_PROVIDERS_COOKIE}=`));

  if (!entry) {
    return [];
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(entry.slice(CUSTOM_PROVIDERS_COOKIE.length + 1)));

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (item): item is CustomProvider =>
        typeof item?.name === 'string' && item.name.length > 0 && typeof item?.baseUrl === 'string',
    );
  } catch {
    // Someone else's cookie, or a truncated one. Nothing to add.
    return [];
  }
}
