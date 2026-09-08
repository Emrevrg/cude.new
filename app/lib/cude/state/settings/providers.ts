/**
 * Cude.new - provider configuration.
 *
 * Which providers are enabled, and where the self-hosted ones live. This
 * domain never holds a credential: API keys are supplied per request from the
 * browser and are deliberately not part of persisted settings.
 *
 * A `baseUrl` is scrubbed of embedded credentials before it is stored. A URL
 * of the form `https://user:token@host` would otherwise put a secret into
 * `localStorage` through a field nobody thinks of as sensitive.
 */

import { map } from 'nanostores';
import type { ProviderConfiguration, ProviderConfigurations, SettingsStorage } from './types';
import { createSettingsStorage, isPlainObject, readJson, writeJson } from './storage';
import { PROVIDER_DEFINITIONS } from '~/lib/cude/providers/definitions';

export const PROVIDERS_KEY = 'providers';

/** Providers whose endpoint the user hosts and can point elsewhere. */
export const SELF_HOSTED_PROVIDERS = ['Ollama', 'LMStudio', 'OpenAILike'];

/** Providers that run on the user's own machine. */
/**
 * Providers that run on the person's own machine or network.
 *
 * Derived from the definitions rather than written out, because a hand-kept
 * list goes wrong the moment a provider is added: vLLM, llama.cpp, Jan and
 * LiteLLM all run locally and were being offered under Cloud Providers, next
 * to the ones that bill you.
 */
export const LOCAL_PROVIDERS: string[] = PROVIDER_DEFINITIONS.filter((definition) => definition.local).map(
  (definition) => definition.name,
);

/** Remove credentials embedded in a URL's authority. */
export function scrubBaseUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }

  const trimmed = url.trim();

  if (!trimmed) {
    return undefined;
  }

  try {
    const parsed = new URL(trimmed);

    if (parsed.username || parsed.password) {
      parsed.username = '';
      parsed.password = '';
    }

    return parsed.toString().replace(/\/$/, '');
  } catch {
    // Not a parseable URL; store it as typed so the user can correct it.
    return trimmed;
  }
}

function normalizeOne(value: unknown): ProviderConfiguration {
  if (!isPlainObject(value)) {
    return { enabled: false };
  }

  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : false,
    baseUrl: typeof value.baseUrl === 'string' ? scrubBaseUrl(value.baseUrl) : undefined,
    modelList: typeof value.modelList === 'string' ? value.modelList : undefined,
  };
}

export function normalizeProviders(value: unknown): ProviderConfigurations {
  if (!isPlainObject(value)) {
    return {};
  }

  const out: ProviderConfigurations = {};

  for (const [name, config] of Object.entries(value)) {
    out[name] = normalizeOne(config);
  }

  return out;
}

export class ProvidersDomain {
  readonly store = map<ProviderConfigurations>({});

  constructor(private readonly _storage: SettingsStorage) {
    this.store.set(normalizeProviders(readJson<unknown>(this._storage, PROVIDERS_KEY, null)));
  }

  get(): ProviderConfigurations {
    return this.store.get();
  }

  configFor(name: string): ProviderConfiguration {
    return this.store.get()[name] ?? { enabled: false };
  }

  isEnabled(name: string): boolean {
    return this.configFor(name).enabled;
  }

  /**
   * Merge the registry with stored choices.
   *
   * The registry says which providers exist in this build; storage only records
   * what the user decided about them. Reading only storage would show an empty
   * list until the user had already configured something, which is exactly
   * backwards for a screen whose job is to let them configure it.
   */
  withRegistry(registryNames: string[]): ProviderConfigurations {
    const stored = this.store.get();
    const merged: ProviderConfigurations = {};

    for (const name of registryNames) {
      merged[name] = stored[name] ?? { enabled: false };
    }

    // Keep anything configured for a provider this build no longer registers.
    for (const [name, config] of Object.entries(stored)) {
      if (!merged[name]) {
        merged[name] = config;
      }
    }

    return merged;
  }

  /** Update one provider and persist. */
  update(name: string, patch: Partial<ProviderConfiguration>): ProviderConfiguration {
    const next = normalizeOne({ ...this.configFor(name), ...patch });
    this.store.setKey(name, next);
    this._persist();

    return next;
  }

  setEnabled(name: string, enabled: boolean): void {
    this.update(name, { enabled });
  }

  /**
   * Turn on every provider the server reports as configured.
   *
   * Only applied to providers the user has not already made a choice about, so
   * this never silently re-enables something they turned off.
   */
  autoEnable(configuredProviderNames: string[]): string[] {
    const current = this.store.get();
    const enabled: string[] = [];

    for (const name of configuredProviderNames) {
      if (current[name] === undefined) {
        this.store.setKey(name, { enabled: true });
        enabled.push(name);
      }
    }

    if (enabled.length > 0) {
      this._persist();
    }

    return enabled;
  }

  private _persist(): void {
    writeJson(this._storage, PROVIDERS_KEY, this.store.get());
  }
}

/** The application's provider configuration. */
export const providers = new ProvidersDomain(createSettingsStorage());
