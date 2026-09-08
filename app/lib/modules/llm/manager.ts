// Cude.new - manager.ts (Cude product surface, 2026)
import type { IProviderSetting } from '~/types/model';
import { BaseProvider } from './base-provider';
import type { ModelInfo, ProviderInfo } from './types';
import { PROVIDER_CLASSES, createProvider } from '~/lib/cude/providers';
import type { ProviderDefinition } from '~/lib/cude/providers/defineProvider';
import { isNotConfigured } from '~/lib/cude/providers/defineProvider';
import { createScopedLogger } from '~/utils/logger';

/*
 * A provider without a key, or a local server that is not running, is the
 * ordinary state of everything a person has not set up. Reporting each one as
 * an error filled the log with twenty lines on every model-list request and
 * buried the failures that matter.
 */
/**
 * Says what happened, at the level it deserves.
 *
 * A provider with no key, and a local model server nobody is running, are both
 * the ordinary state of a fresh install — four of those logged as errors on
 * every page load is how a log stops being read. A provider that answered with
 * something wrong is a real error and stays one.
 */
function reportDiscoveryFailure(providerName: string, error: unknown): void {
  const unreachable = (error as { unreachable?: boolean })?.unreachable === true;

  if (isNotConfigured(error) || unreachable || (error as Error)?.name === 'TypeError') {
    logger.debug(`No models from ${providerName}: not configured or not reachable.`);
    return;
  }

  logger.error(`Could not list models for ${providerName}:`, error);
}

const logger = createScopedLogger('LLMManager');
export class LLMManager {
  private static _instance: LLMManager;
  private _providers: Map<string, BaseProvider> = new Map();
  private _modelList: ModelInfo[] = [];
  private _env: Record<string, string> = {};

  private constructor(_env: Record<string, string>) {
    this._registerProviders();
    this._env = _env;
  }

  static getInstance(env: Record<string, string> = {}): LLMManager {
    if (!LLMManager._instance) {
      LLMManager._instance = new LLMManager(env);
    } else if (Object.keys(env).length > 0) {
      // Update env on subsequent calls so Cloudflare Workers get fresh bindings
      LLMManager._instance._env = env;
    }

    return LLMManager._instance;
  }
  get env() {
    return this._env;
  }

  /**
   * Registers every provider Cude knows about.
   *
   * The list comes from `~/lib/cude/providers`, which builds most of them from
   * declarations. This used to iterate the exports of a barrel file and pick
   * out whatever happened to extend BaseProvider, so a provider could be added
   * to the directory and silently never register.
   */
  private _registerProviders() {
    for (const providerClass of PROVIDER_CLASSES) {
      const provider = new providerClass();

      try {
        this.registerProvider(provider);
      } catch (error) {
        logger.warn('Could not register provider', provider.name, error);
      }
    }

    // One line for the whole set, which is the part worth seeing.
    logger.info(`${this._providers.size} providers registered`);
  }

  /**
   * Registers providers a browser described in its request.
   *
   * A provider somebody added lives in their browser, and discovery happens
   * here, so without this step it appeared in settings and was never asked for
   * anything. Idempotent: registering the same name twice replaces it, which
   * is what happens when someone edits the endpoint.
   */
  registerDescribedProviders(definitions: ProviderDefinition[]): void {
    const wanted = new Set(definitions.map((definition) => definition.name));

    /*
     * Drop the ones this caller no longer describes. Without this the registry
     * only ever grows: every endpoint anyone ever configured stays registered
     * for the life of the process, and gets asked for models on every request.
     */
    for (const [name, provider] of this._providers) {
      if ((provider as { isDescribed?: boolean }).isDescribed === true && !wanted.has(name)) {
        this._providers.delete(name);
      }
    }

    for (const definition of definitions) {
      const existing = this._providers.get(definition.name);

      if (existing && (existing as { isDescribed?: boolean }).isDescribed !== true) {
        // Never shadow a built-in provider with one from a cookie.
        continue;
      }

      const provider = createProvider(definition);
      (provider as unknown as { isDescribed: boolean }).isDescribed = true;
      this._providers.set(definition.name, provider);
    }
  }

  /**
   * Runs `run` with the described providers registered, then puts the registry
   * back the way it was.
   *
   * A described provider belongs to one caller — it arrives in that caller's
   * cookies — but the manager lives as long as the server process. Leaving it
   * registered means the next caller, a different person, is offered somebody
   * else's endpoint, and discovery probes an address from their network. The
   * snapshot covers the same name arriving twice: an edit replaces the entry
   * for the duration of the call, then the previous one is restored.
   */
  async withDescribedProviders<T>(definitions: ProviderDefinition[], run: () => Promise<T>): Promise<T> {
    const previous = new Map<string, BaseProvider | undefined>();

    for (const definition of definitions) {
      const existing = this._providers.get(definition.name);

      if (existing && (existing as { isDescribed?: boolean }).isDescribed !== true) {
        // Never shadow a built-in provider with one from a cookie.
        continue;
      }

      if (!previous.has(definition.name)) {
        previous.set(definition.name, existing);
      }

      const provider = createProvider(definition);
      (provider as unknown as { isDescribed: boolean }).isDescribed = true;
      this._providers.set(definition.name, provider);
    }

    try {
      return await run();
    } finally {
      for (const [name, entry] of previous) {
        if (entry) {
          this._providers.set(name, entry);
        } else {
          this._providers.delete(name);
        }
      }
    }
  }

  registerProvider(provider: BaseProvider) {
    if (this._providers.has(provider.name)) {
      logger.warn(`Provider ${provider.name} is already registered. Skipping.`);
      return;
    }

    /*
     * Debug, not info. Registration happens for every provider on every page
     * load, so at info level it is forty lines of console before the app has
     * done anything — enough noise to bury a real message. What matters is the
     * count, and that is logged once when the set is complete.
     */
    logger.debug('Registering Provider: ', provider.name);
    this._providers.set(provider.name, provider);
    this._modelList = [...this._modelList, ...provider.staticModels];
  }

  getProvider(name: string): BaseProvider | undefined {
    return this._providers.get(name);
  }

  getAllProviders(): BaseProvider[] {
    return Array.from(this._providers.values());
  }

  getModelList(): ModelInfo[] {
    return this._modelList;
  }

  async updateModelList(options: {
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
    serverEnv?: Record<string, string>;
    forceRefresh?: boolean;
  }): Promise<ModelInfo[]> {
    const { apiKeys, providerSettings, serverEnv, forceRefresh } = options;

    let enabledProviders = Array.from(this._providers.values()).map((p) => p.name);

    if (providerSettings && Object.keys(providerSettings).length > 0) {
      /*
       * The settings cookie only carries providers the person has touched, but
       * this list is every registered provider — so most names have no entry,
       * and reading `.enabled` off the missing one threw and took the whole
       * model list with it. `enabled` is optional: absent means unspecified,
       * which is how a fresh install shows every provider.
       */
      enabledProviders = enabledProviders.filter((name) => providerSettings[name]?.enabled !== false);
    }

    // Get dynamic models from all providers that support them
    const dynamicModels = await Promise.all(
      Array.from(this._providers.values())
        .filter((provider) => enabledProviders.includes(provider.name))
        .filter(
          (provider): provider is BaseProvider & Required<Pick<ProviderInfo, 'getDynamicModels'>> =>
            !!provider.getDynamicModels,
        )
        .map(async (provider) => {
          const cachedModels = forceRefresh ? null : provider.getModelsFromCache(options);

          if (cachedModels) {
            return cachedModels;
          }

          /*
           * A provider that just failed is not asked again.
           *
           * Without this, only successes were remembered: every request retried
           * every provider that could not answer, and those are the slow ones.
           * GitHub's retired endpoint took nearly nine seconds to fail DNS
           * resolution and did it on every page load.
           */
          if (!forceRefresh && provider.discoveryFailedRecently(options)) {
            return [];
          }

          const dynamicModels = await provider
            .getDynamicModels(apiKeys, providerSettings?.[provider.name], serverEnv)
            .then((models) => {
              logger.info(`Caching ${models.length} dynamic models for ${provider.name}`);
              provider.storeDynamicModels(options, models);

              return models;
            })
            .catch((error) => {
              reportDiscoveryFailure(provider.name, error);
              provider.storeDiscoveryFailure(options);

              return [];
            });

          return dynamicModels;
        }),
    );
    const staticModels = Array.from(this._providers.values()).flatMap((p) => p.staticModels || []);
    const dynamicModelsFlat = dynamicModels.flat();
    const dynamicModelKeys = dynamicModelsFlat.map((d) => `${d.name}-${d.provider}`);
    const filteredStaticModels = staticModels.filter((m) => !dynamicModelKeys.includes(`${m.name}-${m.provider}`));

    // Combine static and dynamic models
    const modelList = [...dynamicModelsFlat, ...filteredStaticModels];
    modelList.sort((a, b) => a.name.localeCompare(b.name));
    this._modelList = modelList;

    return modelList;
  }
  getStaticModelList() {
    return [...this._providers.values()].flatMap((p) => p.staticModels || []);
  }
  async getModelListFromProvider(
    providerArg: BaseProvider,
    options: {
      apiKeys?: Record<string, string>;
      providerSettings?: Record<string, IProviderSetting>;
      serverEnv?: Record<string, string>;
      forceRefresh?: boolean;
    },
  ): Promise<ModelInfo[]> {
    const provider = this._providers.get(providerArg.name);

    if (!provider) {
      throw new Error(`Provider ${providerArg.name} not found`);
    }

    const staticModels = provider.staticModels || [];

    if (!provider.getDynamicModels) {
      return staticModels;
    }

    const { apiKeys, providerSettings, serverEnv, forceRefresh } = options;

    const cachedModels = forceRefresh
      ? null
      : provider.getModelsFromCache({
          apiKeys,
          providerSettings,
          serverEnv,
        });

    if (cachedModels) {
      logger.info(`Found ${cachedModels.length} cached models for ${provider.name}`);
      return [...cachedModels, ...staticModels];
    }

    logger.info(`Getting dynamic models for ${provider.name}`);

    const dynamicModels = await provider
      .getDynamicModels?.(apiKeys, providerSettings?.[provider.name], serverEnv)
      .then((models) => {
        logger.info(`Got ${models.length} dynamic models for ${provider.name}`);
        provider.storeDynamicModels(options, models);

        return models;
      })
      .catch((err) => {
        reportDiscoveryFailure(provider.name, err);
        return [];
      });
    const dynamicModelsName = dynamicModels.map((d) => d.name);
    const filteredStaticList = staticModels.filter((m) => !dynamicModelsName.includes(m.name));
    const modelList = [...dynamicModels, ...filteredStaticList];
    modelList.sort((a, b) => a.name.localeCompare(b.name));

    return modelList;
  }
  getStaticModelListFromProvider(providerArg: BaseProvider) {
    const provider = this._providers.get(providerArg.name);

    if (!provider) {
      throw new Error(`Provider ${providerArg.name} not found`);
    }

    return [...(provider.staticModels || [])];
  }

  getDefaultProvider(): BaseProvider {
    const firstProvider = this._providers.values().next().value;

    if (!firstProvider) {
      throw new Error('No providers registered');
    }

    return firstProvider;
  }
}
