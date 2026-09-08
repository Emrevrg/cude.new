import { LLMManager } from '~/lib/modules/llm/manager';

const manager = LLMManager.getInstance(import.meta.env);

export const SERVER_PROVIDER_LIST = manager.getAllProviders();
export const DEFAULT_SERVER_PROVIDER = manager.getDefaultProvider();
