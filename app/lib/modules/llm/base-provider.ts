// Cude.new - base-provider.ts (Cude product surface, 2026)
import type { LanguageModelV1 } from 'ai';
import type { ProviderInfo, ProviderConfig, ModelInfo } from './types';
import type { IProviderSetting } from '~/types/model';
import { createOpenAI } from '@ai-sdk/openai';
import { LLMManager } from './manager';

/*
 * The placeholders a .env.example ships with, which get copied to .env.local
 * and left as they are.
 *
 * Treating one as a real key is worse than having no key at all: the provider
 * looks configured, every request comes back 401, and nothing tells the person
 * that the fix is to paste an actual key.
 */
const PLACEHOLDER_KEY = /^(your[_-]?|<|\{\{|xxx+$|changeme$|placeholder$|todo$|example$|sk-xxx)/i;

/*
 * The same placeholders, when they do not start at the beginning.
 *
 * `GITHUB_API_KEY=github_pat_your_personal_access_token_here` looked like a
 * real token to the rule above — it starts with the prefix GitHub's tokens
 * actually use — so the provider was treated as configured and asked for its
 * models on every request. What gives it away is in the middle and at the end.
 */
const PLACEHOLDER_ANYWHERE = /([_-]your[_-])|([_-]here$)/i;

/** True when a value is a real key rather than a leftover placeholder. */
export function isUsableKey(value: string | undefined): value is string {
  const trimmed = value?.trim();

  if (!trimmed) {
    return false;
  }

  return !PLACEHOLDER_KEY.test(trimmed) && !PLACEHOLDER_ANYWHERE.test(trimmed);
}

function firstUsableKey(...candidates: (string | undefined)[]): string | undefined {
  return candidates.find(isUsableKey);
}

/**
 * True when a value is an address we could actually call.
 *
 * The same trap as the placeholder keys: a .env copied from the example ships
 * `OPENAI_LIKE_API_BASE_URL=your_openai_like_base_url_here`, and treating that
 * as configured means every model listing tries to fetch a URL that cannot
 * exist, then reports it as a provider failure.
 */
export function isUsableBaseUrl(value: string | undefined): value is string {
  const trimmed = value?.trim();

  if (!trimmed || !isUsableKey(trimmed)) {
    return false;
  }

  try {
    const { protocol } = new URL(trimmed);

    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function firstUsableBaseUrl(...candidates: (string | undefined)[]): string | undefined {
  return candidates.find(isUsableBaseUrl);
}

/** Default timeout for model listing API calls (5 seconds) */
const MODEL_FETCH_TIMEOUT = 5_000;

/**
 * How long a discovered model list stays fresh.
 *
 * Long enough that normal use never re-hits the provider's /models endpoint,
 * short enough that a model released today is selectable today.
 */
export const MODEL_CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * How long a failed discovery is remembered before trying again.
 *
 * Only successes were ever cached, so a provider that could not answer was
 * asked again on every single request — and the ones that cannot answer are
 * exactly the slow ones. One dead endpoint cost eight seconds on every page
 * load, forever.
 *
 * A minute, not the hour a success gets: a local model server someone has just
 * started, or a provider recovering from an outage, should appear soon rather
 * than after an hour of being written off.
 */
export const DISCOVERY_FAILURE_TTL_MS = 60 * 1000;

export abstract class BaseProvider implements ProviderInfo {
  abstract name: string;
  abstract staticModels: ModelInfo[];
  abstract config: ProviderConfig;
  cachedDynamicModels?: {
    cacheId: string;
    models: ModelInfo[];

    /** Epoch ms the entry was written. See MODEL_CACHE_TTL_MS. */
    cachedAt: number;
  };

  /**
   * When discovery last failed, and for which credentials.
   *
   * Keyed the same way as the success cache: pasting a key must retry at once
   * rather than wait out the interval.
   */
  private _lastDiscoveryFailure?: { cacheId: string; at: number };

  getApiKeyLink?: string;
  labelForGetApiKey?: string;
  icon?: string;

  /**
   * True when this provider failed to answer moments ago.
   *
   * The caller uses it to skip a provider it already knows is not answering,
   * so one broken endpoint costs one request rather than every request.
   */
  discoveryFailedRecently(options: {
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
    serverEnv?: Record<string, string>;
  }): boolean {
    const failure = this._lastDiscoveryFailure;

    if (!failure) {
      return false;
    }

    if (failure.cacheId !== this.getDynamicModelsCacheKey(options)) {
      // Different credentials: the reason it failed may be gone.
      this._lastDiscoveryFailure = undefined;

      return false;
    }

    if (Date.now() - failure.at > DISCOVERY_FAILURE_TTL_MS) {
      this._lastDiscoveryFailure = undefined;

      return false;
    }

    return true;
  }

  /** Records that discovery just failed, so it is not retried immediately. */
  storeDiscoveryFailure(options: {
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
    serverEnv?: Record<string, string>;
  }): void {
    this._lastDiscoveryFailure = { cacheId: this.getDynamicModelsCacheKey(options), at: Date.now() };
  }

  /**
   * Convert Cloudflare Env bindings to a plain Record<string, string>.
   * Useful because provider methods expect Record<string, string> but
   * Cloudflare Workers pass an Env interface.
   */
  protected convertEnvToRecord(env?: Env): Record<string, string> {
    if (!env) {
      return {};
    }

    return Object.entries(env).reduce(
      (acc, [key, value]) => {
        acc[key] = String(value);

        return acc;
      },
      {} as Record<string, string>,
    );
  }

  /**
   * Rewrite localhost / 127.0.0.1 URLs to host.docker.internal when
   * running inside Docker. Only applies on the server side.
   */
  protected resolveDockerUrl(baseUrl: string, serverEnv?: Record<string, string>): string {
    const isDocker = process?.env?.RUNNING_IN_DOCKER === 'true' || serverEnv?.RUNNING_IN_DOCKER === 'true';

    if (!isDocker) {
      return baseUrl;
    }

    return baseUrl.replace('localhost', 'host.docker.internal').replace('127.0.0.1', 'host.docker.internal');
  }

  /**
   * Create an AbortSignal that times out after the given milliseconds.
   * Used to prevent model-listing fetches from hanging indefinitely.
   */
  protected createTimeoutSignal(ms: number = MODEL_FETCH_TIMEOUT): AbortSignal {
    return AbortSignal.timeout(ms);
  }

  getProviderBaseUrlAndKey(options: {
    apiKeys?: Record<string, string>;
    providerSettings?: IProviderSetting;
    serverEnv?: Record<string, string>;
    defaultBaseUrlKey: string;
    defaultApiTokenKey: string;
  }) {
    const { apiKeys, providerSettings, serverEnv, defaultBaseUrlKey, defaultApiTokenKey } = options;
    let settingsBaseUrl = providerSettings?.baseUrl;
    const manager = LLMManager.getInstance();

    if (settingsBaseUrl && settingsBaseUrl.length == 0) {
      settingsBaseUrl = undefined;
    }

    const baseUrlKey = this.config.baseUrlKey || defaultBaseUrlKey;
    let baseUrl = firstUsableBaseUrl(
      settingsBaseUrl,
      serverEnv?.[baseUrlKey],
      process?.env?.[baseUrlKey],
      manager.env?.[baseUrlKey],
      this.config.baseUrl,
    );

    if (baseUrl && baseUrl.endsWith('/')) {
      baseUrl = baseUrl.slice(0, -1);
    }

    const apiTokenKey = this.config.apiTokenKey || defaultApiTokenKey;
    const apiKey = firstUsableKey(
      apiKeys?.[this.name],
      serverEnv?.[apiTokenKey],
      process?.env?.[apiTokenKey],
      manager.env?.[apiTokenKey],
    );

    return {
      baseUrl,
      apiKey,
    };
  }
  getModelsFromCache(options: {
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
    serverEnv?: Record<string, string>;
  }): ModelInfo[] | null {
    if (!this.cachedDynamicModels) {
      return null;
    }

    const cacheKey = this.cachedDynamicModels.cacheId;
    const generatedCacheKey = this.getDynamicModelsCacheKey(options);

    if (cacheKey !== generatedCacheKey) {
      this.cachedDynamicModels = undefined;

      return null;
    }

    /*
     * Without a TTL the cache was only ever invalidated by a credential change,
     * so a long-lived server process would keep serving the model list it
     * discovered at boot and never notice a newly released model. Expiring the
     * entry lets the next request re-discover in the background.
     */
    if (Date.now() - this.cachedDynamicModels.cachedAt > MODEL_CACHE_TTL_MS) {
      this.cachedDynamicModels = undefined;

      return null;
    }

    return this.cachedDynamicModels.models;
  }
  getDynamicModelsCacheKey(options: {
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
    serverEnv?: Record<string, string>;
  }) {
    // Only include provider-relevant env keys, not the entire server environment
    const relevantEnvKeys = [this.config.baseUrlKey, this.config.apiTokenKey].filter(Boolean) as string[];
    const relevantEnv: Record<string, string> = {};

    for (const key of relevantEnvKeys) {
      if (options.serverEnv?.[key]) {
        relevantEnv[key] = options.serverEnv[key];
      }
    }

    return JSON.stringify({
      apiKeys: options.apiKeys?.[this.name],
      providerSettings: options.providerSettings?.[this.name],
      serverEnv: relevantEnv,
    });
  }
  storeDynamicModels(
    options: {
      apiKeys?: Record<string, string>;
      providerSettings?: Record<string, IProviderSetting>;
      serverEnv?: Record<string, string>;
    },
    models: ModelInfo[],
  ) {
    const cacheId = this.getDynamicModelsCacheKey(options);

    this.cachedDynamicModels = {
      cacheId,
      models,
      cachedAt: Date.now(),
    };
  }

  // Declare the optional getDynamicModels method
  getDynamicModels?(
    apiKeys?: Record<string, string>,
    settings?: IProviderSetting,
    serverEnv?: Record<string, string>,
  ): Promise<ModelInfo[]>;

  abstract getModelInstance(options: {
    model: string;
    serverEnv?: Env;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }): LanguageModelV1;
}

type OptionalApiKey = string | undefined;

export function getOpenAILikeModel(baseURL: string, apiKey: OptionalApiKey, model: string) {
  const openai = createOpenAI({
    baseURL,
    apiKey,
  });

  return openai(model);
}
