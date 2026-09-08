// Cude.new - useSettings.ts (Cude product surface, 2026)
import { useStore } from '@nanostores/react';
import {
  preferences,
  providers as providerSettings,
  providersStore,
  tabConfigurationStore,
  resetTabConfiguration as resetTabConfig,
} from '~/lib/cude/state/settings';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Cookies from 'js-cookie';
import { PROVIDER_LIST } from '~/utils/constants';
import type { IProviderSetting, ProviderInfo, IProviderConfig } from '~/types/model';
import type { TabWindowConfig } from '~/components/@settings/core/types';
import { logStore } from '~/lib/cude/state/logStoreAdapter';
import { readStored, writeStored } from '~/lib/cude/state/browserStore';

export interface Settings {
  theme: 'light' | 'dark' | 'system';
  language: string;
  notifications: boolean;
  eventLogs: boolean;
  timezone: string;
  tabConfiguration: TabWindowConfig;
}

export interface UseSettingsReturn {
  // Theme and UI settings
  setTheme: (theme: Settings['theme']) => void;
  setLanguage: (language: string) => void;
  setNotifications: (enabled: boolean) => void;
  setEventLogs: (enabled: boolean) => void;
  setTimezone: (timezone: string) => void;
  settings: Settings;

  // Provider settings
  providers: Record<string, IProviderConfig>;
  activeProviders: ProviderInfo[];
  updateProviderSettings: (provider: string, config: IProviderSetting) => void;

  // Debug and development settings
  debug: boolean;
  enableDebugMode: (enabled: boolean) => void;
  eventLogs: boolean;
  promptId: string;
  setPromptId: (promptId: string) => void;
  isLatestBranch: boolean;
  enableLatestBranch: (enabled: boolean) => void;
  autoSelectTemplate: boolean;
  setAutoSelectTemplate: (enabled: boolean) => void;
  contextOptimizationEnabled: boolean;
  enableContextOptimization: (enabled: boolean) => void;

  // Tab configuration
  tabConfiguration: TabWindowConfig;
  resetTabConfiguration: () => void;
}

// Add interface to match ProviderSetting type
interface ProviderSettingWithIndex extends IProviderSetting {
  [key: string]: any;
}

export function useSettings(): UseSettingsReturn {
  const storedProviders = useStore(providersStore);

  /*
   * The screen lists every provider this build registers, with the user's
   * choice applied. Reading only what was stored would show an empty list until
   * something had already been configured.
   */
  const providers = useMemo(() => {
    const merged = providerSettings.withRegistry(PROVIDER_LIST.map((provider) => provider.name));
    const out: Record<string, IProviderConfig> = {};

    for (const provider of PROVIDER_LIST) {
      const config = merged[provider.name] ?? { enabled: false };
      out[provider.name] = {
        ...provider,
        settings: { enabled: config.enabled, baseUrl: config.baseUrl },
      } as unknown as IProviderConfig;
    }

    return out;
  }, [storedProviders]);
  const prefs = useStore(preferences.store);
  const debug = prefs.developerMode;
  const eventLogs = prefs.eventLogs;
  const promptId = prefs.promptId;
  const isLatestBranch = prefs.latestBranch;
  const autoSelectTemplate = prefs.autoSelectTemplate;
  const [activeProviders, setActiveProviders] = useState<ProviderInfo[]>([]);
  const contextOptimizationEnabled = prefs.contextOptimization;
  const tabConfiguration = useStore(tabConfigurationStore);
  const [settings, setSettings] = useState<Settings>(() => {
    const storedSettings = readStored<Record<string, any>>('settings');
    return {
      theme: storedSettings?.theme || 'system',
      language: storedSettings?.language || 'en',
      notifications: storedSettings?.notifications ?? true,
      eventLogs: storedSettings?.eventLogs ?? true,
      timezone: storedSettings?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      tabConfiguration,
    };
  });

  useEffect(() => {
    const active = Object.entries(providers)
      .filter(([_key, provider]) => provider.settings.enabled)
      .map(([_k, p]) => p);

    setActiveProviders(active);
  }, [providers]);

  const saveSettings = useCallback((newSettings: Partial<Settings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      writeStored('settings', updated);

      return updated;
    });
  }, []);

  const updateProviderSettings = useCallback((provider: string, config: ProviderSettingWithIndex) => {
    /*
     * `enabled` was hard-coded to true here, so turning a provider off wrote
     * it straight back on — the switch moved and nothing changed. It takes
     * what the caller asked for now, and keeps the endpoint alongside it.
     */
    providerSettings.update(provider, { enabled: config.enabled !== false, baseUrl: config.baseUrl });
  }, []);

  const enableDebugMode = useCallback((enabled: boolean) => {
    preferences.update({ developerMode: enabled });
    logStore.logSystem(`Debug mode ${enabled ? 'enabled' : 'disabled'}`);
    Cookies.set('isDebugEnabled', String(enabled));
  }, []);

  const setEventLogs = useCallback((enabled: boolean) => {
    preferences.update({ eventLogs: enabled });
    logStore.logSystem(`Event logs ${enabled ? 'enabled' : 'disabled'}`);
  }, []);

  const setPromptId = useCallback((id: string) => {
    preferences.update({ promptId: id });
    logStore.logSystem(`Prompt template updated to ${id}`);
  }, []);

  const enableLatestBranch = useCallback((enabled: boolean) => {
    preferences.update({ latestBranch: enabled });
    logStore.logSystem(`Main branch updates ${enabled ? 'enabled' : 'disabled'}`);
  }, []);

  const setAutoSelectTemplate = useCallback((enabled: boolean) => {
    preferences.update({ autoSelectTemplate: enabled });
    logStore.logSystem(`Auto select template ${enabled ? 'enabled' : 'disabled'}`);
  }, []);

  const enableContextOptimization = useCallback((enabled: boolean) => {
    preferences.update({ contextOptimization: enabled });
    logStore.logSystem(`Context optimization ${enabled ? 'enabled' : 'disabled'}`);
  }, []);

  const setTheme = useCallback(
    (theme: Settings['theme']) => {
      saveSettings({ theme });
    },
    [saveSettings],
  );

  const setLanguage = useCallback(
    (language: string) => {
      saveSettings({ language });
    },
    [saveSettings],
  );

  const setNotifications = useCallback(
    (enabled: boolean) => {
      saveSettings({ notifications: enabled });
    },
    [saveSettings],
  );

  const setTimezone = useCallback(
    (timezone: string) => {
      saveSettings({ timezone });
    },
    [saveSettings],
  );

  useEffect(() => {
    /*
     * Only enablement and endpoint travel to the server. Credentials are sent
     * per request from the browser and are deliberately not part of this cookie.
     */
    const configured = providerSettings.get();
    const providerSetting: Record<string, IProviderSetting> = {};

    for (const [name, config] of Object.entries(configured)) {
      providerSetting[name] = { enabled: config.enabled, baseUrl: config.baseUrl };
    }

    Cookies.set('providers', JSON.stringify(providerSetting));
  }, [providers]);

  return {
    ...settings,
    providers,
    activeProviders,
    updateProviderSettings,
    debug,
    enableDebugMode,
    eventLogs,
    setEventLogs,
    promptId,
    setPromptId,
    isLatestBranch,
    enableLatestBranch,
    autoSelectTemplate,
    setAutoSelectTemplate,
    contextOptimizationEnabled,
    enableContextOptimization,
    setTheme,
    setLanguage,
    setNotifications,
    setTimezone,
    settings,
    tabConfiguration,
    resetTabConfiguration: resetTabConfig,
  };
}
