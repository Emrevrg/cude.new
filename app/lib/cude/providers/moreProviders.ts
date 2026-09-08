/**
 * Cude.new — the rest of the providers.
 *
 * Every one of these speaks the OpenAI API, which is why they fit in a file
 * this short: the declarative provider gives them discovery, key handling,
 * caching and error classification, and all that is left to say is where they
 * live and what they are known for.
 *
 * They are kept apart from `definitions.ts` only because that file already
 * holds the ones with bespoke clients — Anthropic's SDK, Cohere's own shape,
 * Google's. Nothing here needs any of that.
 *
 * Two things are deliberate. The static lists are short: they exist so the
 * picker is not empty before a key is pasted, and discovery replaces them the
 * moment there is one. And several take a base URL, because a person running
 * vLLM or llama.cpp has their own address and no key at all.
 */

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { ProviderDefinition } from './defineProvider';

/**
 * Every provider here answers the same way, so the client is the same.
 *
 * `createOpenAICompatible`, not `createOpenAI`. The official OpenAI client
 * speaks to OpenAI's own current surface — it posts to /responses — and a
 * third-party endpoint that implements /chat/completions answers that with a
 * 404 or a 410. NVIDIA returned "Gone" for every model it had just listed,
 * which is what sent us looking.
 */
const openAiCompatible = ({ apiKey, baseURL }: { apiKey?: string; baseURL?: string }) =>
  createOpenAICompatible({
    name: 'openai-compatible',
    apiKey: apiKey ?? 'not-needed',
    baseURL: baseURL ?? '',
  });

export const AZURE_OPENAI: ProviderDefinition = {
  name: 'Azure OpenAI',
  description: 'OpenAI models inside your own Azure tenancy, billed by Microsoft.',
  apiTokenKey: 'AZURE_OPENAI_API_KEY',

  /* No fixed address: every Azure deployment has its own resource hostname. */
  baseUrlKey: 'AZURE_OPENAI_API_BASE_URL',
  getApiKeyLink: 'https://portal.azure.com/',
  labelForGetApiKey: 'Open the Azure portal',
  staticModels: [],
  discovery: {
    url: (baseUrl) => (baseUrl ? `${baseUrl}/models` : undefined),
    defaultMaxTokens: 128000,
  },
  client: openAiCompatible,
};

export const DEEPINFRA: ProviderDefinition = {
  name: 'DeepInfra',
  description: 'Open models on shared GPUs, priced per token with no minimum.',
  apiTokenKey: 'DEEPINFRA_API_KEY',
  baseUrl: 'https://api.deepinfra.com/v1/openai',
  getApiKeyLink: 'https://deepinfra.com/dash/api_keys',
  staticModels: [
    {
      name: 'zai-org/GLM-5.3',
      label: 'GLM-5.3',
      provider: 'DeepInfra',
      maxTokenAllowed: 1048576,
      maxCompletionTokens: 131072,
    },
    {
      name: 'meta-llama/Llama-3.3-70B-Instruct',
      label: 'Llama 3.3 70B Instruct',
      provider: 'DeepInfra',
      maxTokenAllowed: 128000,
    },
    {
      name: 'deepseek-ai/DeepSeek-V3',
      label: 'DeepSeek V3',
      provider: 'DeepInfra',
      maxTokenAllowed: 64000,
    },
    {
      name: 'Qwen/Qwen2.5-Coder-32B-Instruct',
      label: 'Qwen2.5 Coder 32B',
      provider: 'DeepInfra',
      maxTokenAllowed: 32000,
    },
  ],
  discovery: { url: 'https://api.deepinfra.com/v1/openai/models', defaultMaxTokens: 32000 },
  client: openAiCompatible,
};

export const NEBIUS: ProviderDefinition = {
  name: 'Nebius',
  description: 'Open models on European infrastructure, with data kept in the EU.',
  apiTokenKey: 'NEBIUS_API_KEY',
  baseUrl: 'https://api.studio.nebius.ai/v1',
  getApiKeyLink: 'https://studio.nebius.ai/settings/api-keys',
  staticModels: [
    {
      name: 'moonshotai/Kimi-K3',
      label: 'Kimi K3',
      provider: 'Nebius',
      maxTokenAllowed: 1048576,
      maxCompletionTokens: 8000,
    },
    {
      name: 'deepseek-ai/DeepSeek-V3',
      label: 'DeepSeek V3',
      provider: 'Nebius',
      maxTokenAllowed: 64000,
    },
    {
      name: 'meta-llama/Meta-Llama-3.1-70B-Instruct',
      label: 'Llama 3.1 70B Instruct',
      provider: 'Nebius',
      maxTokenAllowed: 128000,
    },
    {
      name: 'Qwen/Qwen2.5-Coder-32B-Instruct',
      label: 'Qwen2.5 Coder 32B',
      provider: 'Nebius',
      maxTokenAllowed: 32000,
    },
  ],
  discovery: { url: 'https://api.studio.nebius.ai/v1/models', defaultMaxTokens: 32000 },
  client: openAiCompatible,
};

export const SAMBANOVA: ProviderDefinition = {
  name: 'SambaNova',
  description: 'Open models on reconfigurable dataflow chips, built for speed.',
  apiTokenKey: 'SAMBANOVA_API_KEY',
  baseUrl: 'https://api.sambanova.ai/v1',
  getApiKeyLink: 'https://cloud.sambanova.ai/apis',
  staticModels: [
    {
      name: 'Meta-Llama-3.3-70B-Instruct',
      label: 'Llama 3.3 70B Instruct',
      provider: 'SambaNova',
      maxTokenAllowed: 128000,
    },
    {
      name: 'DeepSeek-R1-Distill-Llama-70B',
      label: 'DeepSeek R1 Distill 70B',
      provider: 'SambaNova',
      maxTokenAllowed: 32000,
    },
  ],
  discovery: { url: 'https://api.sambanova.ai/v1/models', defaultMaxTokens: 32000 },
  client: openAiCompatible,
};

export const NOVITA: ProviderDefinition = {
  name: 'Novita',
  description: 'A broad open-model catalogue, priced to undercut the first-party APIs.',
  apiTokenKey: 'NOVITA_API_KEY',
  baseUrl: 'https://api.novita.ai/v3/openai',
  getApiKeyLink: 'https://novita.ai/settings/key-management',
  staticModels: [
    {
      name: 'deepseek/deepseek-v3-0324',
      label: 'DeepSeek V3',
      provider: 'Novita',
      maxTokenAllowed: 64000,
    },
    {
      name: 'meta-llama/llama-3.3-70b-instruct',
      label: 'Llama 3.3 70B Instruct',
      provider: 'Novita',
      maxTokenAllowed: 128000,
    },
  ],
  discovery: { url: 'https://api.novita.ai/v3/openai/models', defaultMaxTokens: 32000 },
  client: openAiCompatible,
};

export const BASETEN: ProviderDefinition = {
  name: 'Baseten',
  description: 'Open models on dedicated deployments, for when shared capacity is not enough.',
  apiTokenKey: 'BASETEN_API_KEY',
  baseUrl: 'https://inference.baseten.co/v1',
  getApiKeyLink: 'https://app.baseten.co/settings/api_keys',
  staticModels: [
    {
      name: 'zai-org/GLM-5.3',
      label: 'GLM 5.3',
      provider: 'Baseten',
      maxTokenAllowed: 1048576,
      maxCompletionTokens: 262144,
    },
    {
      name: 'deepseek-ai/DeepSeek-V3-0324',
      label: 'DeepSeek V3',
      provider: 'Baseten',
      maxTokenAllowed: 64000,
    },
  ],
  discovery: { url: 'https://inference.baseten.co/v1/models', defaultMaxTokens: 32000 },
  client: openAiCompatible,
};

export const LAMBDA: ProviderDefinition = {
  name: 'Lambda',
  description: 'Open models from the GPU cloud, billed by the token rather than the hour.',
  apiTokenKey: 'LAMBDA_API_KEY',
  baseUrl: 'https://api.lambda.ai/v1',
  getApiKeyLink: 'https://cloud.lambda.ai/api-keys',
  staticModels: [
    {
      name: 'deepseek-v3-0324',
      label: 'DeepSeek V3',
      provider: 'Lambda',
      maxTokenAllowed: 64000,
    },
    {
      name: 'llama3.3-70b-instruct-fp8',
      label: 'Llama 3.3 70B Instruct',
      provider: 'Lambda',
      maxTokenAllowed: 128000,
    },
  ],
  discovery: { url: 'https://api.lambda.ai/v1/models', defaultMaxTokens: 32000 },
  client: openAiCompatible,
};

export const AI21: ProviderDefinition = {
  name: 'AI21',
  description: 'The Jamba family — hybrid attention models with very long context.',
  apiTokenKey: 'AI21_API_KEY',
  baseUrl: 'https://api.ai21.com/studio/v1',
  getApiKeyLink: 'https://studio.ai21.com/account/api-key',
  staticModels: [
    {
      name: 'jamba-large',
      label: 'Jamba Large',
      provider: 'AI21',
      maxTokenAllowed: 256000,
    },
    {
      name: 'jamba-mini',
      label: 'Jamba Mini',
      provider: 'AI21',
      maxTokenAllowed: 256000,
    },
  ],
  discovery: { url: 'https://api.ai21.com/studio/v1/models', defaultMaxTokens: 256000 },
  client: openAiCompatible,
};

export const UPSTAGE: ProviderDefinition = {
  name: 'Upstage',
  description: 'The Solar family, strong on Korean and on document work.',
  apiTokenKey: 'UPSTAGE_API_KEY',
  baseUrl: 'https://api.upstage.ai/v1',
  getApiKeyLink: 'https://console.upstage.ai/api-keys',
  staticModels: [
    {
      name: 'solar-pro2',
      label: 'Solar Pro 2',
      provider: 'Upstage',
      maxTokenAllowed: 64000,
    },
    {
      name: 'solar-mini',
      label: 'Solar Mini',
      provider: 'Upstage',
      maxTokenAllowed: 32000,
    },
  ],
  discovery: { url: 'https://api.upstage.ai/v1/models', defaultMaxTokens: 32000 },
  client: openAiCompatible,
};

export const FEATHERLESS: ProviderDefinition = {
  name: 'Featherless',
  description: 'Thousands of community fine-tunes from Hugging Face, on one subscription.',
  apiTokenKey: 'FEATHERLESS_API_KEY',
  baseUrl: 'https://api.featherless.ai/v1',
  getApiKeyLink: 'https://featherless.ai/account/api-keys',
  staticModels: [
    {
      name: 'meta-llama/Meta-Llama-3.1-70B-Instruct',
      label: 'Llama 3.1 70B Instruct',
      provider: 'Featherless',
      maxTokenAllowed: 16000,
    },
    {
      name: 'Qwen/Qwen2.5-72B-Instruct',
      label: 'Qwen2.5 72B Instruct',
      provider: 'Featherless',
      maxTokenAllowed: 16000,
    },
  ],
  discovery: { url: 'https://api.featherless.ai/v1/models', defaultMaxTokens: 16000 },
  client: openAiCompatible,
};

export const VENICE: ProviderDefinition = {
  name: 'Venice',
  description: 'Open models with no logging and no retention, for private work.',
  apiTokenKey: 'VENICE_API_KEY',
  baseUrl: 'https://api.venice.ai/api/v1',
  getApiKeyLink: 'https://venice.ai/settings/api',
  staticModels: [
    {
      name: 'llama-3.3-70b',
      label: 'Llama 3.3 70B',
      provider: 'Venice',
      maxTokenAllowed: 65536,
    },
    {
      name: 'qwen-2.5-coder-32b',
      label: 'Qwen2.5 Coder 32B',
      provider: 'Venice',
      maxTokenAllowed: 32768,
    },
  ],
  discovery: { url: 'https://api.venice.ai/api/v1/models', defaultMaxTokens: 32000 },
  client: openAiCompatible,
};

export const CHUTES: ProviderDefinition = {
  name: 'Chutes',
  description: 'Open models on a decentralised network, often free at low volume.',
  apiTokenKey: 'CHUTES_API_KEY',
  baseUrl: 'https://llm.chutes.ai/v1',
  getApiKeyLink: 'https://chutes.ai/app/api',
  staticModels: [
    {
      name: 'moonshotai/Kimi-K3-TEE',
      label: 'Kimi K3 TEE',
      provider: 'Chutes',
      maxTokenAllowed: 1048576,
      maxCompletionTokens: 65535,
    },
    {
      name: 'deepseek-ai/DeepSeek-V3-0324',
      label: 'DeepSeek V3',
      provider: 'Chutes',
      maxTokenAllowed: 64000,
    },
    {
      name: 'Qwen/Qwen2.5-Coder-32B-Instruct',
      label: 'Qwen2.5 Coder 32B',
      provider: 'Chutes',
      maxTokenAllowed: 32000,
    },
  ],
  discovery: { url: 'https://llm.chutes.ai/v1/models', defaultMaxTokens: 32000 },
  client: openAiCompatible,
};

/*
 * The rest run on the person's own machine or network. They need an address
 * rather than a key, and `local` says so: Cude will not refuse to talk to them
 * for want of a credential they do not have.
 */

export const VLLM: ProviderDefinition = {
  name: 'vLLM',
  description: 'A vLLM server of your own — your GPUs, your weights, no key.',
  baseUrlKey: 'VLLM_API_BASE_URL',
  getApiKeyLink: 'https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html',
  labelForGetApiKey: 'How to serve with vLLM',
  icon: 'i-ph:hard-drives',
  local: true,
  staticModels: [],
  discovery: {
    url: (baseUrl) => (baseUrl ? `${baseUrl}/models` : undefined),
    defaultMaxTokens: 32000,
  },
  client: openAiCompatible,
};

export const LLAMA_CPP: ProviderDefinition = {
  name: 'llama.cpp',
  description: 'A llama.cpp server on this machine. Runs on a laptop, needs no key.',
  baseUrlKey: 'LLAMA_CPP_API_BASE_URL',
  baseUrl: 'http://127.0.0.1:8080/v1',
  getApiKeyLink: 'https://github.com/ggml-org/llama.cpp',
  labelForGetApiKey: 'Get llama.cpp',
  icon: 'i-ph:desktop-tower',
  local: true,
  staticModels: [],
  discovery: {
    url: (baseUrl) => (baseUrl ? `${baseUrl}/models` : undefined),
    defaultMaxTokens: 8000,
  },
  client: openAiCompatible,
};

export const JAN: ProviderDefinition = {
  name: 'Jan',
  description: 'Models running in Jan on this machine, offline and private.',
  baseUrlKey: 'JAN_API_BASE_URL',
  baseUrl: 'http://127.0.0.1:1337/v1',
  getApiKeyLink: 'https://jan.ai/',
  labelForGetApiKey: 'Get Jan',
  icon: 'i-ph:desktop',
  local: true,
  staticModels: [],
  discovery: {
    url: (baseUrl) => (baseUrl ? `${baseUrl}/models` : undefined),
    defaultMaxTokens: 8000,
  },
  client: openAiCompatible,
};

export const LITELLM: ProviderDefinition = {
  name: 'LiteLLM',
  description: 'A LiteLLM proxy — one address in front of every provider you already pay for.',
  apiTokenKey: 'LITELLM_API_KEY',
  baseUrlKey: 'LITELLM_API_BASE_URL',
  baseUrl: 'http://127.0.0.1:4000',
  getApiKeyLink: 'https://docs.litellm.ai/docs/simple_proxy',
  labelForGetApiKey: 'Set up a LiteLLM proxy',
  icon: 'i-ph:shuffle',
  local: true,
  staticModels: [],
  discovery: {
    url: (baseUrl) => (baseUrl ? `${baseUrl}/v1/models` : undefined),
    defaultMaxTokens: 32000,
  },
  client: openAiCompatible,
};

/** Everything in this file, in the order it is offered. */
export const ADDITIONAL_PROVIDERS: ProviderDefinition[] = [
  AZURE_OPENAI,
  DEEPINFRA,
  NEBIUS,
  SAMBANOVA,
  NOVITA,
  BASETEN,
  LAMBDA,
  AI21,
  UPSTAGE,
  FEATHERLESS,
  VENICE,
  CHUTES,
  VLLM,
  LLAMA_CPP,
  JAN,
  LITELLM,
];
