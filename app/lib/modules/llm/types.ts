// Cude.new - types.ts (Cude product surface, 2026)
import type { LanguageModelV1 } from 'ai';
import type { IProviderSetting } from '~/types/model';

export interface ModelInfo {
  name: string;
  label: string;
  provider: string;

  /** Maximum context window size (input tokens) - how many tokens the model can process */
  maxTokenAllowed: number;

  /** Maximum completion/output tokens - how many tokens the model can generate. If not specified, falls back to provider defaults */
  maxCompletionTokens?: number;

  /**
   * Whether this model reasons before it answers, when that is known.
   *
   * A reasoning model takes `maxCompletionTokens` rather than `maxTokens` and
   * refuses some ordinary parameters. This used to be guessed from the name by
   * regex, which called NVIDIA's Kimi K3 an ordinary model and sent it the
   * wrong ones. Left undefined when nobody has said, so the guess still runs.
   */
  reasoning?: boolean;

  /** Whether the model accepts tool definitions, when that is known. */
  toolCall?: boolean;

  /**
   * True when the public registry currently lists this model.
   *
   * The hand-written catalogues in the source are the only thing that fills
   * the picker before a key is pasted, and they rot: ten providers were
   * leading with a model their vendor has since retired. A model the registry
   * still knows about is one that can still be reached, which is what makes it
   * a safe thing to open on.
   */
  published?: boolean;
}

export interface ProviderInfo {
  name: string;
  staticModels: ModelInfo[];
  getDynamicModels?: (
    apiKeys?: Record<string, string>,
    settings?: IProviderSetting,
    serverEnv?: Record<string, string>,
  ) => Promise<ModelInfo[]>;
  getModelInstance: (options: {
    model: string;
    serverEnv: Env;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }) => LanguageModelV1;
  getApiKeyLink?: string;
  labelForGetApiKey?: string;
  icon?: string;
}
export interface ProviderConfig {
  baseUrlKey?: string;
  baseUrl?: string;
  apiTokenKey?: string;
}
