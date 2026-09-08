// Cude.new - CloudProvidersTab.tsx (Cude product surface, 2026)
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Switch } from '~/components/ui/Switch';
import { useSettings } from '~/lib/hooks/useSettings';
import { URL_CONFIGURABLE_PROVIDERS } from '~/lib/cude/state/settings';
import type { IProviderConfig } from '~/types/model';
import type { ModelInfo } from '~/lib/modules/llm/types';
import { logStore } from '~/lib/cude/state/logStoreAdapter';
import { motion } from 'framer-motion';
import { classNames } from '~/utils/classNames';
import { toast } from 'react-toastify';
import { providerBaseUrlEnvKeys, PROVIDER_LIST } from '~/utils/constants';
import { Bot, Brain, Cloud, Code2, Cpu, type LucideIcon } from 'lucide-react';
import { PROVIDER_DEFINITIONS } from '~/lib/cude/providers/definitions';
import { readCustomProviders, type CustomProvider } from '~/lib/cude/providers/customProviders';
import { AddProviderDialog } from '~/components/cude/settings/AddProviderDialog';
import { LOCAL_PROVIDERS } from '~/lib/cude/state/settings';

// Add type for provider names to ensure type safety
type ProviderName =
  | 'AmazonBedrock'
  | 'Anthropic'
  | 'Cohere'
  | 'Deepseek'
  | 'Google'
  | 'Groq'
  | 'HuggingFace'
  | 'Hyperbolic'
  | 'Mistral'
  | 'OpenAI'
  | 'OpenRouter'
  | 'Perplexity'
  | 'Together'
  | 'XAI';

// Update the PROVIDER_ICONS type to use the ProviderName type
const PROVIDER_ICONS: Record<ProviderName, LucideIcon> = {
  AmazonBedrock: Cloud,
  Anthropic: Brain,
  Cohere: Cpu,
  Deepseek: Code2,
  Google: Bot,
  Groq: Cloud,
  HuggingFace: Bot,
  Hyperbolic: Cloud,
  Mistral: Brain,
  OpenAI: Brain,
  OpenRouter: Cloud,
  Perplexity: Brain,
  Together: Cloud,
  XAI: Bot,
};

/*
 * Descriptions come from the provider definitions, so a provider is described
 * where it is declared. They used to live here, which is why fifteen of the
 * eighteen cards read "Standard AI provider integration".
 */
const PROVIDER_DESCRIPTIONS: Record<string, string> = {
  ...Object.fromEntries(PROVIDER_DEFINITIONS.map((definition) => [definition.name, definition.description])),
  AmazonBedrock: 'Claude, Llama and Mistral through your AWS account, billed by Amazon.',
};

const CloudProvidersTab = () => {
  const settings = useSettings();
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [filteredProviders, setFilteredProviders] = useState<IProviderConfig[]>([]);
  const [categoryEnabled, setCategoryEnabled] = useState<boolean>(false);
  const [addingProvider, setAddingProvider] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [modelCount, setModelCount] = useState<number | null>(null);

  /*
   * Asks every source again, now.
   *
   * The list refreshes on its own — hourly, and when a tab comes back into
   * view — but "on its own" is no comfort when you know a model shipped this
   * morning and you want to see it. This is the button for that.
   */
  const refreshModels = useCallback(async () => {
    setRefreshing(true);

    try {
      const response = await fetch('/api/models?refresh=1', { headers: { 'Cache-Control': 'no-cache' } });

      if (response.ok) {
        const data = (await response.json()) as { modelList?: ModelInfo[] };
        setModelCount(data.modelList?.length ?? null);

        /*
         * The picker lives in BaseChat, not here. Hand it the fresh list so a
         * model released this morning is selectable now, not on the next
         * hourly refresh — otherwise this button only updates its own count.
         */
        if (data.modelList && data.modelList.length > 0) {
          window.dispatchEvent(new CustomEvent<ModelInfo[]>('cude:models-updated', { detail: data.modelList }));
        }
      }
    } catch {
      // Offline. The list already on screen is still the one in use.
    } finally {
      setRefreshing(false);
    }
  }, []);

  /*
   * Providers the person added. Kept as a set of names because the only thing
   * the list needs to know is which cards to stamp.
   */
  const [custom, setCustom] = useState<CustomProvider[]>([]);

  const refreshCustom = useCallback(() => {
    setCustom(readCustomProviders());
  }, []);

  const customNames = useMemo(() => new Set(custom.map((provider) => provider.name)), [custom]);

  /* A provider you added is described by where it points. */
  const customDescriptions = useMemo(
    () => Object.fromEntries(custom.map((provider) => [provider.name, `Your own endpoint at ${provider.baseUrl}`])),
    [custom],
  );

  useEffect(() => {
    refreshCustom();
  }, [refreshCustom]);

  const builtInNames = useMemo(() => PROVIDER_LIST.map((provider) => provider.name), []);

  // Load and filter providers
  useEffect(() => {
    const newFilteredProviders = Object.entries(settings.providers || {})
      /* Local ones have their own tab; this list is what you pay somebody for. */
      .filter(([key]) => !LOCAL_PROVIDERS.includes(key))
      .map(([key, value]) => ({
        name: key,
        settings: value.settings,
        staticModels: value.staticModels || [],
        getDynamicModels: value.getDynamicModels,
        getApiKeyLink: value.getApiKeyLink,
        labelForGetApiKey: value.labelForGetApiKey,
        icon: value.icon,
      }));

    /*
     * Providers the person added sit in the same list as the built-in ones,
     * because that is where someone looks for them. They carry a badge so the
     * two are never confused, and their own settings if they have been
     * toggled before.
     */
    const customEntries = readCustomProviders().map((provider) => ({
      name: provider.name,
      settings: settings.providers?.[provider.name]?.settings ?? { enabled: true },
      staticModels: (provider.models ?? []).map((model) => ({
        name: model,
        label: model,
        provider: provider.name,
        maxTokenAllowed: 8000,
      })),
      getApiKeyLink: undefined,
      labelForGetApiKey: undefined,
      icon: undefined,
    })) as IProviderConfig[];

    const known = new Set(newFilteredProviders.map((provider) => provider.name));
    const sorted = [...newFilteredProviders, ...customEntries.filter((provider) => !known.has(provider.name))].sort(
      (a, b) => a.name.localeCompare(b.name),
    );
    setFilteredProviders(sorted);

    // Update category enabled state
    const allEnabled = newFilteredProviders.every((p) => p.settings.enabled);
    setCategoryEnabled(allEnabled);
  }, [settings.providers, customNames]);

  const handleToggleCategory = useCallback(
    (enabled: boolean) => {
      // Update all providers
      filteredProviders.forEach((provider) => {
        settings.updateProviderSettings(provider.name, { ...provider.settings, enabled });
      });

      setCategoryEnabled(enabled);
      toast.success(enabled ? 'All cloud providers enabled' : 'All cloud providers disabled');
    },
    [filteredProviders, settings],
  );

  const handleToggleProvider = useCallback(
    (provider: IProviderConfig, enabled: boolean) => {
      // Update the provider settings in the store
      settings.updateProviderSettings(provider.name, { ...provider.settings, enabled });

      if (enabled) {
        logStore.logProvider(`Provider ${provider.name} enabled`, { provider: provider.name });
        toast.success(`${provider.name} enabled`);
      } else {
        logStore.logProvider(`Provider ${provider.name} disabled`, { provider: provider.name });
        toast.success(`${provider.name} disabled`);
      }
    },
    [settings],
  );

  const handleUpdateBaseUrl = useCallback(
    (provider: IProviderConfig, baseUrl: string) => {
      const newBaseUrl: string | undefined = baseUrl.trim() || undefined;

      // Update the provider settings in the store
      settings.updateProviderSettings(provider.name, { ...provider.settings, baseUrl: newBaseUrl });

      logStore.logProvider(`Base URL updated for ${provider.name}`, {
        provider: provider.name,
        baseUrl: newBaseUrl,
      });
      toast.success(`${provider.name} base URL updated`);
      setEditingProvider(null);
    },
    [settings],
  );

  return (
    <div className="space-y-6">
      <motion.div
        className="space-y-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-center justify-between gap-4 mt-8 mb-4">
          <div className="flex items-center gap-2">
            <div
              className={classNames(
                'w-8 h-8 flex items-center justify-center rounded-lg',
                'bg-cude-background-depth-3',
                'text-gray-500',
              )}
            >
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-md font-medium text-cude-textPrimary">Cloud Providers</h4>
              <p className="text-sm text-cude-textSecondary">
                Connect to cloud-based AI models and services
                {modelCount !== null && ` — ${modelCount} models available`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={refreshModels}
              disabled={refreshing}
              title="Ask every provider, and the public registry, what they have now"
              className={classNames(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors',
                'border border-cude-borderColor text-cude-textPrimary',
                'hover:bg-cude-background-depth-3 disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              <div className={classNames('i-ph:arrows-clockwise text-base', { 'animate-spin': refreshing })} />
              {refreshing ? 'Refreshing' : 'Refresh models'}
            </button>
            <button
              type="button"
              onClick={() => setAddingProvider(true)}
              className={classNames(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors',
                'border border-cude-borderColor text-cude-textPrimary',
                'hover:bg-cude-background-depth-3',
              )}
            >
              <div className="i-ph:plus text-base" />
              Add provider
            </button>
            <span className="text-sm text-cude-textSecondary">Enable All Cloud</span>
            <Switch checked={categoryEnabled} onCheckedChange={handleToggleCategory} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredProviders.map((provider, index) => (
            <motion.div
              key={provider.name}
              className={classNames(
                'rounded-lg border bg-cude-background text-cude-textPrimary shadow-sm',
                'bg-cude-background-depth-2',
                'hover:bg-cude-background-depth-3',
                'transition-all duration-200',
                'relative overflow-hidden group',
                'flex flex-col',
              )}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ scale: 1.02 }}
            >
              <div className="absolute top-0 right-0 p-2 flex gap-1">
                {URL_CONFIGURABLE_PROVIDERS.includes(provider.name) && (
                  <motion.span
                    className="px-2 py-0.5 text-xs rounded-full bg-cude-background-depth-20/10 text-gray-500 font-medium"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    Configurable
                  </motion.span>
                )}
              </div>

              <div className="flex items-start gap-4 p-4">
                <motion.div
                  className={classNames(
                    'w-10 h-10 flex items-center justify-center rounded-xl',
                    'bg-cude-background-depth-3 group-hover:bg-cude-background-depth-4',
                    'transition-all duration-200',
                    provider.settings.enabled ? 'text-gray-500' : 'text-cude-textSecondary',
                  )}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <div className={classNames('w-6 h-6', 'transition-transform duration-200', 'group-hover:rotate-12')}>
                    {React.createElement(PROVIDER_ICONS[provider.name as ProviderName] || Bot, {
                      className: 'w-full h-full',
                      'aria-label': `${provider.name} logo`,
                    })}
                  </div>
                </motion.div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-4 mb-2">
                    <div>
                      <h4 className="flex items-center gap-2 text-sm font-medium text-cude-textPrimary group-hover:text-gray-500 transition-colors">
                        {provider.name}
                        {/* Stamped, so a provider you added is never mistaken for one that ships with Cude. */}
                        {customNames.has(provider.name) && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] tracking-wide font-semibold uppercase bg-cude-item-backgroundAccent text-cude-item-contentAccent">
                            Yours
                          </span>
                        )}
                      </h4>
                      <p className="text-xs text-cude-textSecondary mt-0.5">
                        {customDescriptions[provider.name] ??
                          PROVIDER_DESCRIPTIONS[provider.name] ??
                          'Connects over the OpenAI-compatible API.'}
                      </p>
                    </div>
                    <Switch
                      checked={provider.settings.enabled}
                      onCheckedChange={(checked) => handleToggleProvider(provider, checked)}
                    />
                  </div>

                  {provider.settings.enabled && URL_CONFIGURABLE_PROVIDERS.includes(provider.name) && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="flex items-center gap-2 mt-4">
                        {editingProvider === provider.name ? (
                          <input
                            type="text"
                            defaultValue={provider.settings.baseUrl}
                            placeholder={`Enter ${provider.name} base URL`}
                            className={classNames(
                              'flex-1 px-3 py-1.5 rounded-lg text-sm',
                              'bg-cude-background-depth-3 border border-cude-borderColor',
                              'text-cude-textPrimary placeholder-cude-textTertiary',
                              'focus:outline-none focus:ring-2 focus:ring-gray-500/30',
                              'transition-all duration-200',
                            )}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleUpdateBaseUrl(provider, e.currentTarget.value);
                              } else if (e.key === 'Escape') {
                                setEditingProvider(null);
                              }
                            }}
                            onBlur={(e) => handleUpdateBaseUrl(provider, e.target.value)}
                            autoFocus
                          />
                        ) : (
                          <div
                            className="flex-1 px-3 py-1.5 rounded-lg text-sm cursor-pointer group/url"
                            onClick={() => setEditingProvider(provider.name)}
                          >
                            <div className="flex items-center gap-2 text-cude-textSecondary">
                              <div className="i-ph:link text-sm" />
                              <span className="group-hover/url:text-gray-500 transition-colors">
                                {provider.settings.baseUrl || 'Click to set base URL'}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      {providerBaseUrlEnvKeys[provider.name]?.baseUrlKey && (
                        <div className="mt-2 text-xs text-cude-icon-success">
                          <div className="flex items-center gap-1">
                            <div className="i-ph:info" />
                            <span>Environment URL set in .env file</span>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </div>
              </div>

              <motion.div
                className="absolute inset-0 border-2 border-gray-500/0 rounded-lg pointer-events-none"
                animate={{
                  borderColor: provider.settings.enabled ? 'rgba(168, 85, 247, 0.2)' : 'rgba(168, 85, 247, 0)',
                  scale: provider.settings.enabled ? 1 : 0.98,
                }}
                transition={{ duration: 0.2 }}
              />
            </motion.div>
          ))}
        </div>
      </motion.div>

      <AddProviderDialog
        open={addingProvider}
        onClose={() => setAddingProvider(false)}
        onAdded={refreshCustom}
        builtInNames={builtInNames}
      />
    </div>
  );
};

export default CloudProvidersTab;
