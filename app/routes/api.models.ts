// Cude.new - api.models.ts (Cude product surface, 2026)
import { json } from '@remix-run/cloudflare';
import { LLMManager } from '~/lib/modules/llm/manager';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { ProviderInfo } from '~/types/model';
import { getApiKeysFromCookie, getProviderSettingsFromCookie } from '~/lib/api/cookies';
import { isUsableKey } from '~/lib/modules/llm/base-provider';
import { defineCustomProvider, readCustomProvidersFromCookie } from '~/lib/cude/providers/customProviders';
import { fetchModelRegistry, mergeRegistryModels } from '~/lib/cude/providers/modelRegistry';

interface ModelsResponse {
  modelList: ModelInfo[];
  providers: ProviderInfo[];
  defaultProvider: ProviderInfo;

  /*
   * Providers this deployment already holds a key for. The client uses it to
   * turn those on the first time someone opens Cude — without it a new user
   * lands on a composer whose provider control is disabled and no way to reach
   * the list it is asking them to choose from.
   */
  configured: string[];
}

let cachedProviders: ProviderInfo[] | null = null;
let cachedDefaultProvider: ProviderInfo | null = null;

function isDescribedProvider(provider: { name: string }): boolean {
  return (provider as { isDescribed?: boolean }).isDescribed === true;
}

function getProviderInfo(llmManager: LLMManager) {
  if (!cachedProviders) {
    /*
     * Built-ins only. Described providers belong to one caller and are only
     * registered for the duration of that caller's request — caching them here
     * would offer one person's endpoint to the next caller.
     */
    cachedProviders = llmManager
      .getAllProviders()
      .filter((provider) => !isDescribedProvider(provider))
      .map((provider) => ({
        name: provider.name,
        staticModels: provider.staticModels,
        getApiKeyLink: provider.getApiKeyLink,
        labelForGetApiKey: provider.labelForGetApiKey,
        icon: provider.icon,
      }));
  }

  if (!cachedDefaultProvider) {
    const defaultProvider = llmManager.getDefaultProvider();
    cachedDefaultProvider = {
      name: defaultProvider.name,
      staticModels: defaultProvider.staticModels,
      getApiKeyLink: defaultProvider.getApiKeyLink,
      labelForGetApiKey: defaultProvider.labelForGetApiKey,
      icon: defaultProvider.icon,
    };
  }

  return { providers: cachedProviders, defaultProvider: cachedDefaultProvider };
}

export async function loader({
  request,
  params,
  context,
}: {
  request: Request;
  params: { provider?: string };
  context: {
    cloudflare?: {
      env: Record<string, string>;
    };
  };
}): Promise<Response> {
  const llmManager = LLMManager.getInstance(context.cloudflare?.env);

  // Get client side maintained API keys and provider settings from cookies
  const cookieHeader = request.headers.get('Cookie');
  const apiKeys = getApiKeysFromCookie(cookieHeader);
  const providerSettings = getProviderSettingsFromCookie(cookieHeader);

  /*
   * Providers the caller added themselves. They are registered for the
   * duration of this request only, so one person's endpoint is never offered
   * to the next caller — and never lingers in the cached provider list.
   */
  const described = readCustomProvidersFromCookie(cookieHeader).map(defineCustomProvider);

  /* `?refresh=1` asks every source again, for when somebody wants it now. */
  const refreshRequested = new URL(request.url).searchParams.get('refresh') === '1';

  const modelList = await llmManager.withDescribedProviders(described, async () => {
    const { providers } = getProviderInfo(llmManager);

    const env = { ...(context.cloudflare?.env ?? {}) } as Record<string, string | undefined>;

    /*
     * `isUsableKey`, not truthiness.
     *
     * A .env copied from the example ships `ANTHROPIC_API_KEY=
     * your_anthropic_api_key_here`, which is a non-empty string. Counting
     * that as configured turned twenty providers on for a person who had set
     * up none of them — every one answering 401, with nothing saying the fix
     * was to paste a real key. The same rule the provider layer applies when
     * it decides whether it can be reached at all.
     */
    const configured = llmManager
      .getAllProviders()
      .filter((provider) => {
        const key = provider.config.apiTokenKey;

        return Boolean(key) && (isUsableKey(env[key!]) || isUsableKey(process.env[key!]));
      })
      .map((provider) => provider.name);

    let models: ModelInfo[] = [];

    /*
     * Discovering models means calling the providers, and a provider that is
     * enabled but has no key yet will refuse. That is an ordinary state — a
     * person turns a provider on before pasting the key — so it must not take
     * down the whole list. Fall back to the models we know statically.
     */
    try {
      if (params.provider) {
        const provider = llmManager.getProvider(params.provider);

        if (provider) {
          models = await llmManager.getModelListFromProvider(provider, {
            apiKeys,
            providerSettings,
            serverEnv: context.cloudflare?.env,
            forceRefresh: refreshRequested,
          });
        }
      } else {
        models = await llmManager.updateModelList({
          apiKeys,
          providerSettings,
          serverEnv: context.cloudflare?.env,
          forceRefresh: refreshRequested,
        });
      }
    } catch {
      models = providers.flatMap((provider) => provider.staticModels);
    }

    /*
     * Fill in from the public registry.
     *
     * A provider will not say what it offers without a key, so before one is
     * pasted the only models here are those written into the source — a handful
     * per provider, stale the day a vendor ships. The registry knows what every
     * provider currently has, and asks nobody for credentials. Anything already
     * in the list wins: a model the provider itself reported is better than the
     * registry's account of it.
     */
    try {
      models = mergeRegistryModels(models, await fetchModelRegistry(refreshRequested));
    } catch {
      // A smaller list, not a broken one.
    }

    /*
     * The caller's own providers sit alongside the built-ins in this response,
     * but are never written into the cache above.
     */
    const customProviders: ProviderInfo[] = described
      .filter((definition) => !providers.some((provider) => provider.name === definition.name))
      .map((definition) => ({
        name: definition.name,
        staticModels: definition.staticModels,
        getApiKeyLink: definition.getApiKeyLink,
        labelForGetApiKey: definition.labelForGetApiKey,
        icon: definition.icon,
      }));

    return { models, providers: [...providers, ...customProviders], configured };
  });

  const { defaultProvider } = getProviderInfo(llmManager);

  /*
   * Never cached by the browser.
   *
   * The answer depends on the caller's cookies — which providers they enabled,
   * which keys they pasted — and it changes the moment a vendor ships a model.
   * With no Cache-Control at all a browser applies its own heuristic and
   * happily reuses a response, so configuring a provider appeared to do
   * nothing until a hard reload.
   */
  return json<ModelsResponse>(
    {
      modelList: modelList.models,
      providers: modelList.providers,
      defaultProvider,
      configured: modelList.configured,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
