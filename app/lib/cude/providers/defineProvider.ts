/**
 * Cude.new — describing a model provider instead of writing one.
 *
 * Every hosted provider Cude talks to is the same three facts: where its key
 * comes from, which models it publishes, and which client constructor from the
 * `ai` SDK speaks its protocol. The adapters this replaces were around a
 * hundred and thirty lines each, twenty of them, and the two methods that
 * mattered were copied verbatim between almost all of them — including the
 * bugs, which is why some swallowed a discovery failure silently and others
 * logged it.
 *
 * A provider is now a value. `defineProvider` turns it into the class the
 * manager expects.
 */

import type { LanguageModelV1 } from 'ai';
import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import { discoverOpenAICompatibleModels } from '~/lib/modules/llm/providers/openai-compatible-models';
import { isChatCompletionModel } from '~/lib/modules/llm/providers/openai-models';

/**
 * A provider that has not been given a key, or a local server that is not
 * running.
 *
 * Distinct from a failure: it is the ordinary state of every provider a person
 * has not set up, and the caller asking all of them at once should not report
 * twenty errors because of it.
 */
export class ProviderNotConfiguredError extends Error {
  readonly notConfigured = true;

  constructor(providerName: string, reason = 'Add one in Settings.') {
    super(`Missing API key for ${providerName}. ${reason}`);
    this.name = 'ProviderNotConfiguredError';
  }
}

/** True when a rejection means "not set up" rather than "went wrong". */
export function isNotConfigured(error: unknown): boolean {
  return Boolean((error as { notConfigured?: boolean })?.notConfigured);
}

/** A client constructor from the `ai` SDK, e.g. `createDeepSeek`. */
export type ClientFactory = (options: { apiKey: string; baseURL?: string }) => (model: string) => LanguageModelV1;

export interface ModelDiscovery {
  /**
   * Endpoint that lists the provider's models.
   *
   * A function when the URL depends on the configured base URL, which is the
   * case for anything self-hosted.
   */
  url: string | ((baseUrl: string | undefined) => string | undefined);

  /**
   * True when the endpoint lists models without a key.
   *
   * OpenRouter publishes its whole catalogue — four hundred models, updated
   * the day a vendor ships one — to anybody who asks. Requiring a key before
   * looking meant a person saw nine hand-written entries instead, and had no
   * way to discover what was actually on offer.
   */
  public?: boolean;

  /** Context window to assume for a model the endpoint does not describe. */
  defaultMaxTokens?: number;
  defaultMaxCompletionTokens?: number;

  /**
   * Per-model context window, when the family implies one.
   *
   * OpenAI is the case that matters: a 128k model and an 8k model come back
   * from the same endpoint with nothing to tell them apart but the name.
   */
  contextWindowFor?: (id: string) => number;
  completionCeilingFor?: (id: string) => number;

  /**
   * Reads the response into model ids.
   *
   * Defaults to the OpenAI shape, `{ data: [{ id }] }`, which most providers
   * follow. Supply one only when a provider does something else.
   */
  parse?: (payload: unknown) => DiscoveredModel[];

  /** Sent with the request. Defaults to a bearer token. */
  headers?: (apiKey: string) => Record<string, string>;
}

export interface ProviderDefinition {
  name: string;

  /**
   * What this provider is, in one line, for the settings list.
   *
   * Written per provider rather than defaulted, because "Standard AI provider
   * integration" on fifteen cards tells a person nothing about which one they
   * want.
   */
  description: string;

  /** Environment variable holding the key. */
  apiTokenKey?: string;

  /** Environment variable holding the base URL, for self-hosted providers. */
  baseUrlKey?: string;

  /** Fallback base URL when neither settings nor environment supply one. */
  baseUrl?: string;

  /** Where a person gets a key. */
  getApiKeyLink?: string;
  labelForGetApiKey?: string;
  icon?: string;

  /** Models Cude knows about without asking. */
  staticModels: ModelInfo[];

  /** How to ask the provider what else it has. Omitted when it cannot be asked. */
  discovery?: ModelDiscovery;

  /** Builds the SDK client. */
  client: ClientFactory;

  /** True when the provider runs on the user's own machine and needs no key. */
  local?: boolean;
}

/** What a discovery endpoint tells us about one model. */
export interface DiscoveredModel {
  id: string;
  label?: string;
  maxTokens?: number;
}

/** A provider built from a definition. Discovery is always present. */
export type DefinedProviderClass = new () => BaseProvider & {
  getDynamicModels(
    apiKeys?: Record<string, string>,
    settings?: IProviderSetting,
    serverEnv?: Record<string, string>,
  ): Promise<ModelInfo[]>;
};

export function defineProvider(definition: ProviderDefinition): DefinedProviderClass {
  return class DefinedProvider extends BaseProvider {
    name = definition.name;
    getApiKeyLink = definition.getApiKeyLink;
    labelForGetApiKey = definition.labelForGetApiKey;
    icon = definition.icon;
    staticModels = definition.staticModels;

    config = {
      apiTokenKey: definition.apiTokenKey,
      baseUrlKey: definition.baseUrlKey,
      baseUrl: definition.baseUrl,
    };

    async getDynamicModels(
      apiKeys?: Record<string, string>,
      settings?: IProviderSetting,
      serverEnv?: Record<string, string>,
    ): Promise<ModelInfo[]> {
      const { discovery } = definition;

      if (!discovery) {
        return [];
      }

      const { apiKey, baseUrl } = this.getProviderBaseUrlAndKey({
        apiKeys,
        providerSettings: settings,
        serverEnv: serverEnv as Record<string, string>,
        defaultBaseUrlKey: definition.baseUrlKey ?? '',
        defaultApiTokenKey: definition.apiTokenKey ?? '',
      });

      /*
       * A missing key is a misconfiguration, not an empty catalogue. Returning
       * nothing here is what made a provider look like it simply had no models.
       */
      if (!apiKey && !definition.local && !discovery.public) {
        throw new ProviderNotConfiguredError(definition.name);
      }

      const url = typeof discovery.url === 'function' ? discovery.url(baseUrl) : discovery.url;

      if (!url) {
        return [];
      }

      /*
       * Anything already in the static list stays as written there: those
       * entries carry a real label and a real context window, and a discovery
       * endpoint reports neither.
       */
      const known = new Set(this.staticModels.map((model) => model.name));

      /*
       * The OpenAI-shaped case goes through the shared discovery helper, which
       * filters out the embedding, audio and moderation models the same
       * endpoint returns. Only a provider that answers differently supplies its
       * own parser.
       */
      if (!discovery.parse) {
        const discovered = await discoverOpenAICompatibleModels({
          url,
          apiKey: apiKey ?? '',
          provider: definition.name,
          knownIds: known,
          defaultMaxTokens: discovery.defaultMaxTokens,
        });

        return discovered.map((model) => ({
          ...model,
          maxTokenAllowed: discovery.contextWindowFor?.(model.name) ?? model.maxTokenAllowed,
          maxCompletionTokens: discovery.completionCeilingFor?.(model.name) ?? discovery.defaultMaxCompletionTokens,
        }));
      }

      const response = await fetch(url, {
        headers: discovery.headers?.(apiKey ?? '') ?? (apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        signal: this.createTimeoutSignal(),
      });

      if (!response.ok) {
        const failure = new Error(
          `${definition.name} model discovery failed with status ${response.status}`,
        ) as Error & { statusCode: number };
        failure.statusCode = response.status;

        throw failure;
      }

      return (
        discovery
          .parse(await response.json())
          .filter((entry) => !known.has(entry.id))
          /*
           * The shared non-chat filter, applied no matter who parsed. A custom
           * parser exists because the endpoint answers in its own shape, not to
           * skip the filtering — OpenRouter's public catalogue lists guard and
           * moderation models next to the chat ones, and without this they land
           * in the picker and only fail on use.
           */
          .filter((entry) => isChatCompletionModel(entry.id))
          .map((entry) => ({
            name: entry.id,
            label: entry.label ?? entry.id,
            provider: definition.name,
            maxTokenAllowed:
              entry.maxTokens ?? discovery.contextWindowFor?.(entry.id) ?? discovery.defaultMaxTokens ?? 8000,
            maxCompletionTokens: discovery.completionCeilingFor?.(entry.id) ?? discovery.defaultMaxCompletionTokens,
          }))
      );
    }

    getModelInstance(options: {
      model: string;
      serverEnv: Env;
      apiKeys?: Record<string, string>;
      providerSettings?: Record<string, IProviderSetting>;
    }): LanguageModelV1 {
      const { model, serverEnv, apiKeys, providerSettings } = options;

      const { apiKey, baseUrl } = this.getProviderBaseUrlAndKey({
        apiKeys,
        providerSettings: providerSettings?.[this.name],
        serverEnv: serverEnv as unknown as Record<string, string>,
        defaultBaseUrlKey: definition.baseUrlKey ?? '',
        defaultApiTokenKey: definition.apiTokenKey ?? '',
      });

      if (!apiKey && !definition.local) {
        throw new ProviderNotConfiguredError(this.name);
      }

      /*
       * A local provider has no key but the SDK clients require the field, so
       * it gets a placeholder. The server it talks to ignores it.
       */
      const client = definition.client({ apiKey: apiKey ?? 'local', baseURL: baseUrl });

      return client(model);
    }
  };
}
