/**
 * Cude.new - settings contract.
 *
 * Settings split into the domains they actually belong to rather than one
 * grab bag: what the product should do (preferences), which providers the user
 * has turned on (providers), keyboard bindings (shortcuts), and how the
 * settings surface is laid out (workspace layout).
 *
 * Persistence is an injected interface, so every domain is verifiable in a
 * plain Node process. The inherited store read and wrote `localStorage`
 * directly from a dozen places, with each read doing its own ad-hoc parsing and
 * its own fallback, so a single corrupt value behaved differently depending on
 * which setting it belonged to.
 */

/** Product behaviour the user controls. */
export interface CudePreferences {
  /** Follow the pre-release branch when checking for updates. */
  latestBranch: boolean;

  /** Let Cude pick a starter template rather than starting empty. */
  autoSelectTemplate: boolean;

  /** Trim context sent to the provider to what the task needs. */
  contextOptimization: boolean;

  /** Record pipeline events. */
  eventLogs: boolean;

  /** Which system prompt to use. */
  promptId: string;

  /** Surface internal diagnostics. */
  developerMode: boolean;
}

export const DEFAULT_PREFERENCES: CudePreferences = {
  latestBranch: false,
  autoSelectTemplate: true,
  contextOptimization: true,
  eventLogs: true,
  promptId: 'cude',
  developerMode: false,
};

/** Per-provider configuration. Never holds a credential. */
export interface ProviderConfiguration {
  enabled: boolean;

  /** For providers whose endpoint the user hosts themselves. */
  baseUrl?: string;

  /** Model list for OpenAI-compatible endpoints that cannot be discovered. */
  modelList?: string;
}

export type ProviderConfigurations = Record<string, ProviderConfiguration>;

/** A keyboard binding. The handler is supplied at registration, not stored. */
export interface ShortcutBinding {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;

  /** Ctrl on Windows and Linux, Command on macOS. */
  ctrlOrMetaKey?: boolean;
  description: string;
  preventDefault?: boolean;
}

export type ShortcutId = 'toggleTheme' | 'toggleTerminal';

export type ShortcutBindings = Record<ShortcutId, ShortcutBinding>;

/** One tab in the settings surface. */
export interface LayoutTab {
  id: string;
  visible: boolean;
  order: number;
}

export interface WorkspaceLayout {
  tabs: LayoutTab[];
}

/**
 * Where settings are kept.
 *
 * Deliberately synchronous and string-valued: settings are read during the
 * first render, so an async contract would force every consumer to handle a
 * loading state for a value that is already on the machine.
 */
export interface SettingsStorage {
  readonly kind: string;
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}
