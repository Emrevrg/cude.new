/**
 * Cude.new — the model providers, as data.
 *
 * Each entry says where a key comes from, which models the provider publishes,
 * how to ask it for the rest, and which client from the `ai` SDK speaks its
 * protocol. `defineProvider` turns any of them into the class the manager
 * expects.
 *
 * The static model lists are the product's catalogue — real names, real labels,
 * real context windows — and are carried across unchanged.
 */

import type { LanguageModelV1 } from 'ai';
import { inferContextWindow, inferMaxCompletionTokens } from '~/lib/modules/llm/providers/openai-models';
import type { ProviderDefinition } from './defineProvider';
import { ADDITIONAL_PROVIDERS } from './moreProviders';

import { createAnthropic } from '@ai-sdk/anthropic';
import { createCerebras } from '@ai-sdk/cerebras';
import { createCohere } from '@ai-sdk/cohere';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createFireworks } from '@ai-sdk/fireworks';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createMistral } from '@ai-sdk/mistral';
import { createOllama } from 'ollama-ai-provider';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

export const ANTHROPIC: ProviderDefinition = {
  name: 'Anthropic',
  description: 'Claude models — strong at long documents and careful code changes.',
  apiTokenKey: 'ANTHROPIC_API_KEY',
  getApiKeyLink: 'https://console.anthropic.com/settings/keys',
  staticModels: [
    {
      name: 'claude-opus-5',
      label: 'Claude Opus 5',
      provider: 'Anthropic',
      maxTokenAllowed: 200000,
      maxCompletionTokens: 64000,
    },
    {
      name: 'claude-sonnet-5',
      label: 'Claude Sonnet 5',
      provider: 'Anthropic',
      maxTokenAllowed: 200000,
      maxCompletionTokens: 64000,
    },
    {
      name: 'claude-fable-5-1',
      label: 'Claude Fable 5.1',
      provider: 'Anthropic',
      maxTokenAllowed: 200000,
      maxCompletionTokens: 64000,
    },
    {
      name: 'claude-sonnet-4-5-20250929',
      label: 'Claude Sonnet 4.5',
      provider: 'Anthropic',
      maxTokenAllowed: 200000,
      maxCompletionTokens: 64000,
    },
    {
      name: 'claude-opus-4-1-20250805',
      label: 'Claude Opus 4.1',
      provider: 'Anthropic',
      maxTokenAllowed: 200000,
      maxCompletionTokens: 32000,
    },
    {
      name: 'claude-haiku-4-5-20251001',
      label: 'Claude Haiku 4.5',
      provider: 'Anthropic',
      maxTokenAllowed: 200000,
      maxCompletionTokens: 64000,
    },
    {
      name: 'claude-3-5-sonnet-20241022',
      label: 'Claude 3.5 Sonnet',
      provider: 'Anthropic',
      maxTokenAllowed: 200000,
      maxCompletionTokens: 8192,
    },
  ],
  discovery: {
    url: 'https://api.anthropic.com/v1/models',
    defaultMaxTokens: 32000,
    defaultMaxCompletionTokens: 8000,
    parse: (payload) =>
      ((payload as { data?: Array<{ id: string; display_name?: string }> }).data ?? []).map((entry) => ({
        id: entry.id,
        label: entry.display_name,
      })),
    headers: (apiKey) => ({ 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }),
  },
  client: ({ apiKey, baseURL }) => createAnthropic({ apiKey, baseURL }),
};

export const OPENAI: ProviderDefinition = {
  name: 'OpenAI',
  description: 'GPT models, plus the reasoning series for harder problems.',
  apiTokenKey: 'OPENAI_API_KEY',
  getApiKeyLink: 'https://platform.openai.com/api-keys',
  staticModels: [
    { name: 'gpt-5.6', label: 'GPT-5.6', provider: 'OpenAI', maxTokenAllowed: 200000, maxCompletionTokens: 32768 },
    { name: 'gpt-5', label: 'GPT-5', provider: 'OpenAI', maxTokenAllowed: 128000, maxCompletionTokens: 32768 },
    {
      name: 'gpt-5-mini',
      label: 'GPT-5 Mini',
      provider: 'OpenAI',
      maxTokenAllowed: 128000,
      maxCompletionTokens: 32768,
    },
    {
      name: 'gpt-5-nano',
      label: 'GPT-5 Nano',
      provider: 'OpenAI',
      maxTokenAllowed: 128000,
      maxCompletionTokens: 32768,
    },
    { name: 'gpt-4.1', label: 'GPT-4.1', provider: 'OpenAI', maxTokenAllowed: 128000, maxCompletionTokens: 32768 },
    {
      name: 'gpt-4.1-mini',
      label: 'GPT-4.1 Mini',
      provider: 'OpenAI',
      maxTokenAllowed: 128000,
      maxCompletionTokens: 32768,
    },
    { name: 'o4-mini', label: 'o4 Mini', provider: 'OpenAI', maxTokenAllowed: 128000, maxCompletionTokens: 100000 },
    { name: 'gpt-4o', label: 'GPT-4o', provider: 'OpenAI', maxTokenAllowed: 128000, maxCompletionTokens: 16384 },
    {
      name: 'gpt-4o-mini',
      label: 'GPT-4o Mini',
      provider: 'OpenAI',
      maxTokenAllowed: 128000,
      maxCompletionTokens: 16384,
    },
  ],
  discovery: {
    url: 'https://api.openai.com/v1/models',
    defaultMaxTokens: 128000,
    defaultMaxCompletionTokens: 16384,
    contextWindowFor: inferContextWindow,
    completionCeilingFor: inferMaxCompletionTokens,
  },
  client: ({ apiKey, baseURL }) => createOpenAI({ apiKey, baseURL }),
};

export const GOOGLE: ProviderDefinition = {
  name: 'Google',
  description: 'Gemini models, with very large context windows.',
  apiTokenKey: 'GOOGLE_GENERATIVE_AI_API_KEY',
  getApiKeyLink: 'https://aistudio.google.com/app/apikey',
  staticModels: [
    {
      name: 'gemini-2.5-pro',
      label: 'Gemini 2.5 Pro',
      provider: 'Google',
      maxTokenAllowed: 1048576,
      maxCompletionTokens: 65536,
    },
    {
      name: 'gemini-2.5-flash',
      label: 'Gemini 2.5 Flash',
      provider: 'Google',
      maxTokenAllowed: 1048576,
      maxCompletionTokens: 65536,
    },
    {
      name: 'gemini-2.0-flash',
      label: 'Gemini 2.0 Flash',
      provider: 'Google',
      maxTokenAllowed: 1048576,
      maxCompletionTokens: 8192,
    },
    {
      name: 'gemini-1.5-pro',
      label: 'Gemini 1.5 Pro',
      provider: 'Google',
      maxTokenAllowed: 2000000,
      maxCompletionTokens: 8192,
    },
  ],
  discovery: {
    url: 'https://generativelanguage.googleapis.com/v1beta/models',
    defaultMaxTokens: 8000,
    defaultMaxCompletionTokens: 8000,
    parse: (payload) => {
      const models =
        (
          payload as {
            models?: Array<{ name: string; displayName?: string; inputTokenLimit?: number; description?: string }>;
          }
        ).models ?? [];
      return models
        .filter((m) => !/embedding|aqa|imagen|veo|tts|chirp/i.test(m.name))
        .map((entry) => ({
          id: entry.name.replace('models/', ''),
          label: entry.displayName,
          maxTokens: entry.inputTokenLimit,
        }));
    },
    headers: (apiKey) => ({ 'x-goog-api-key': apiKey }),
  },
  client: ({ apiKey, baseURL }) => createGoogleGenerativeAI({ apiKey, baseURL }),
};

export const DEEPSEEK: ProviderDefinition = {
  name: 'Deepseek',
  description: 'Open-weight models priced low, with a dedicated coding line.',
  apiTokenKey: 'DEEPSEEK_API_KEY',
  getApiKeyLink: 'https://platform.deepseek.com/apiKeys',
  staticModels: [
    {
      name: 'deepseek-v4-pro',
      label: 'DeepSeek V4 Pro',
      provider: 'Deepseek',
      maxTokenAllowed: 1000000,
      maxCompletionTokens: 384000,
    },
    {
      name: 'deepseek-coder',
      label: 'Deepseek-Coder',
      provider: 'Deepseek',
      maxTokenAllowed: 8000,
      maxCompletionTokens: 8192,
    },
    {
      name: 'deepseek-chat',
      label: 'Deepseek-Chat',
      provider: 'Deepseek',
      maxTokenAllowed: 8000,
      maxCompletionTokens: 8192,
    },
    {
      name: 'deepseek-reasoner',
      label: 'Deepseek-Reasoner',
      provider: 'Deepseek',
      maxTokenAllowed: 8000,
      maxCompletionTokens: 8192,
    },
    {
      name: 'deepseek-v3.2',
      label: 'DeepSeek V3.2 (Coding + Tool Use)',
      provider: 'Deepseek',
      maxTokenAllowed: 64000,
      maxCompletionTokens: 8192,
    },
    {
      name: 'deepseek-v3.2-speciale',
      label: 'DeepSeek V3.2 Speciale (High-Compute)',
      provider: 'Deepseek',
      maxTokenAllowed: 64000,
      maxCompletionTokens: 8192,
    },
  ],
  discovery: {
    url: 'https://api.deepseek.com/models',
    defaultMaxTokens: 64000,
    defaultMaxCompletionTokens: 8192,
  },
  client: ({ apiKey, baseURL }) => createDeepSeek({ apiKey, baseURL }),
};

export const MISTRAL: ProviderDefinition = {
  name: 'Mistral',
  description: 'European models, from small and fast up to frontier size.',
  apiTokenKey: 'MISTRAL_API_KEY',
  getApiKeyLink: 'https://console.mistral.ai/api-keys/',
  staticModels: [
    {
      name: 'mistral-medium-latest',
      label: 'Mistral Medium',
      provider: 'Mistral',
      maxTokenAllowed: 262144,
      maxCompletionTokens: 262144,
    },
    {
      name: 'open-mistral-7b',
      label: 'Mistral 7B',
      provider: 'Mistral',
      maxTokenAllowed: 8000,
      maxCompletionTokens: 8192,
    },
    {
      name: 'open-mixtral-8x7b',
      label: 'Mistral 8x7B',
      provider: 'Mistral',
      maxTokenAllowed: 8000,
      maxCompletionTokens: 8192,
    },
    {
      name: 'open-mixtral-8x22b',
      label: 'Mistral 8x22B',
      provider: 'Mistral',
      maxTokenAllowed: 8000,
      maxCompletionTokens: 8192,
    },
    {
      name: 'open-codestral-mamba',
      label: 'Codestral Mamba',
      provider: 'Mistral',
      maxTokenAllowed: 8000,
      maxCompletionTokens: 8192,
    },
    {
      name: 'open-mistral-nemo',
      label: 'Mistral Nemo',
      provider: 'Mistral',
      maxTokenAllowed: 8000,
      maxCompletionTokens: 8192,
    },
    {
      name: 'ministral-8b-latest',
      label: 'Mistral 8B',
      provider: 'Mistral',
      maxTokenAllowed: 8000,
      maxCompletionTokens: 8192,
    },
    {
      name: 'mistral-small-latest',
      label: 'Mistral Small',
      provider: 'Mistral',
      maxTokenAllowed: 8000,
      maxCompletionTokens: 8192,
    },
    {
      name: 'codestral-latest',
      label: 'Codestral',
      provider: 'Mistral',
      maxTokenAllowed: 8000,
      maxCompletionTokens: 8192,
    },
    {
      name: 'mistral-large-latest',
      label: 'Mistral Large Latest',
      provider: 'Mistral',
      maxTokenAllowed: 8000,
      maxCompletionTokens: 8192,
    },
  ],
  discovery: {
    url: 'https://api.mistral.ai/v1/models',
    defaultMaxTokens: 8000,
    defaultMaxCompletionTokens: 4096,
  },
  client: ({ apiKey, baseURL }) => createMistral({ apiKey, baseURL }),
};

export const GROQ: ProviderDefinition = {
  name: 'Groq',
  description: 'Open models on custom silicon — the fastest tokens per second here.',
  apiTokenKey: 'GROQ_API_KEY',
  getApiKeyLink: 'https://console.groq.com/keys',
  staticModels: [
    {
      name: 'llama-3.3-70b-versatile',
      label: 'Llama 3.3 70B',
      provider: 'Groq',
      maxTokenAllowed: 128000,
      maxCompletionTokens: 8192,
    },
    {
      name: 'llama-3.1-8b-instant',
      label: 'Llama 3.1 8B',
      provider: 'Groq',
      maxTokenAllowed: 128000,
      maxCompletionTokens: 8192,
    },
    {
      name: 'llama-3.1-70b-versatile',
      label: 'Llama 3.1 70B',
      provider: 'Groq',
      maxTokenAllowed: 128000,
      maxCompletionTokens: 8192,
    },
    {
      name: 'mixtral-8x7b-32768',
      label: 'Mixtral 8x7B',
      provider: 'Groq',
      maxTokenAllowed: 32768,
      maxCompletionTokens: 8192,
    },
    { name: 'gemma2-9b-it', label: 'Gemma 2 9B', provider: 'Groq', maxTokenAllowed: 8192, maxCompletionTokens: 8192 },
    {
      name: 'qwen-qwq-32b',
      label: 'QwQ 32B Preview',
      provider: 'Groq',
      maxTokenAllowed: 128000,
      maxCompletionTokens: 8192,
    },
    {
      name: 'deepseek-r1-distill-llama-70b',
      label: 'DeepSeek R1 Distill 70B',
      provider: 'Groq',
      maxTokenAllowed: 128000,
      maxCompletionTokens: 8192,
    },
  ],
  discovery: {
    url: 'https://api.groq.com/openai/v1/models',
    defaultMaxTokens: 8000,
    defaultMaxCompletionTokens: 8000,
  },
  client: ({ apiKey, baseURL }) => createOpenAI({ apiKey, baseURL }),
};

export const XAI: ProviderDefinition = {
  name: 'xAI',
  description: 'Grok models, with live access to posts on X.',
  apiTokenKey: 'XAI_API_KEY',
  getApiKeyLink: 'https://docs.x.ai/docs/quickstart#creating-an-api-key',
  staticModels: [
    { name: 'grok-4.6', label: 'xAI Grok 4.6', provider: 'xAI', maxTokenAllowed: 256000 },
    { name: 'grok-4', label: 'xAI Grok 4', provider: 'xAI', maxTokenAllowed: 256000 },
    { name: 'grok-4-07-09', label: 'xAI Grok 4 (07-09)', provider: 'xAI', maxTokenAllowed: 256000 },
    {
      name: 'grok-4.6-thinking',
      label: 'xAI Grok 4.6 Thinking',
      provider: 'xAI',
      maxTokenAllowed: 256000,
      maxCompletionTokens: 32000,
    },
    { name: 'grok-4.6-fast', label: 'xAI Grok 4.6 Fast', provider: 'xAI', maxTokenAllowed: 256000 },
    { name: 'grok-3-mini', label: 'xAI Grok 3 Mini', provider: 'xAI', maxTokenAllowed: 131000 },
    { name: 'grok-3-mini-fast', label: 'xAI Grok 3 Mini Fast', provider: 'xAI', maxTokenAllowed: 131000 },
    { name: 'grok-code-fast-1', label: 'xAI Grok Code Fast 1', provider: 'xAI', maxTokenAllowed: 131000 },
  ],
  discovery: {
    url: 'https://api.x.ai/v1/models',
    defaultMaxTokens: 8000,
    defaultMaxCompletionTokens: 8000,
  },
  client: ({ apiKey, baseURL }) => createOpenAI({ apiKey, baseURL }),
};

export const CEREBRAS: ProviderDefinition = {
  name: 'Cerebras',
  description: 'Llama models on wafer-scale hardware, built for very low latency.',
  apiTokenKey: 'CEREBRAS_API_KEY',
  getApiKeyLink: 'https://cloud.cerebras.ai/settings',
  staticModels: [
    {
      name: 'gemma-4-31b',
      label: 'Gemma 4 31B',
      provider: 'Cerebras',
      maxTokenAllowed: 131072,
      maxCompletionTokens: 40960,
    },
    {
      name: 'qwen3-coder-480b',
      label: 'Qwen3-Coder 480B (2000 tok/s, Best for Coding)',
      provider: 'Cerebras',
      maxTokenAllowed: 262000,
    },
    {
      name: 'llama3.1-8b',
      label: 'Llama 3.1 8B',
      provider: 'Cerebras',
      maxTokenAllowed: 8000,
    },
    {
      name: 'gpt-oss-120b',
      label: 'GPT OSS 120B (Reasoning)',
      provider: 'Cerebras',
      maxTokenAllowed: 8000,
    },
    {
      name: 'qwen-3-235b-a22b-instruct-2507',
      label: 'Qwen 3 235B A22B Instruct',
      provider: 'Cerebras',
      maxTokenAllowed: 8000,
    },
    {
      name: 'qwen-3-235b-a22b-thinking-2507',
      label: 'Qwen 3 235B A22B Thinking',
      provider: 'Cerebras',
      maxTokenAllowed: 8000,
    },
    {
      name: 'zai-glm-4.6',
      label: 'ZAI GLM 4.6 (Coding: 73.8% SWE-bench)',
      provider: 'Cerebras',
      maxTokenAllowed: 8000,
    },
    {
      name: 'zai-glm-4.7',
      label: 'ZAI GLM 4.7 (Reasoning)',
      provider: 'Cerebras',
      maxTokenAllowed: 8000,
    },
  ],
  discovery: {
    url: 'https://api.cerebras.ai/v1/models',
    defaultMaxTokens: 8000,
    defaultMaxCompletionTokens: 8000,
  },
  client: ({ apiKey, baseURL }) => createCerebras({ apiKey, baseURL }),
};

export const COHERE: ProviderDefinition = {
  name: 'Cohere',
  description: 'Command models, aimed at retrieval and business writing.',
  apiTokenKey: 'COHERE_API_KEY',
  getApiKeyLink: 'https://dashboard.cohere.com/api-keys',
  staticModels: [
    {
      name: 'command-a-plus-05-2026',
      label: 'Command A Plus',
      provider: 'Cohere',
      maxTokenAllowed: 128000,
      maxCompletionTokens: 64000,
    },
    {
      name: 'command-r-plus-08-2024',
      label: 'Command R plus Latest',
      provider: 'Cohere',
      maxTokenAllowed: 4096,
      maxCompletionTokens: 4000,
    },
    {
      name: 'command-r-08-2024',
      label: 'Command R Latest',
      provider: 'Cohere',
      maxTokenAllowed: 4096,
      maxCompletionTokens: 4000,
    },
    {
      name: 'command-r-plus',
      label: 'Command R plus',
      provider: 'Cohere',
      maxTokenAllowed: 4096,
      maxCompletionTokens: 4000,
    },
    { name: 'command-r', label: 'Command R', provider: 'Cohere', maxTokenAllowed: 4096, maxCompletionTokens: 4000 },
    { name: 'command', label: 'Command', provider: 'Cohere', maxTokenAllowed: 4096, maxCompletionTokens: 4000 },
    {
      name: 'command-nightly',
      label: 'Command Nightly',
      provider: 'Cohere',
      maxTokenAllowed: 4096,
      maxCompletionTokens: 4000,
    },
    {
      name: 'command-light',
      label: 'Command Light',
      provider: 'Cohere',
      maxTokenAllowed: 4096,
      maxCompletionTokens: 4000,
    },
    {
      name: 'command-light-nightly',
      label: 'Command Light Nightly',
      provider: 'Cohere',
      maxTokenAllowed: 4096,
      maxCompletionTokens: 4000,
    },
    {
      name: 'c4ai-aya-expanse-8b',
      label: 'c4AI Aya Expanse 8b',
      provider: 'Cohere',
      maxTokenAllowed: 4096,
      maxCompletionTokens: 4000,
    },
    {
      name: 'c4ai-aya-expanse-32b',
      label: 'c4AI Aya Expanse 32b',
      provider: 'Cohere',
      maxTokenAllowed: 4096,
      maxCompletionTokens: 4000,
    },
  ],
  discovery: {
    url: 'https://api.cohere.com/v1/models?page_size=100',
    defaultMaxTokens: 4096,

    /* Cohere answers with its own shape, and says which models can chat. */
    parse: (payload) => {
      const models = (payload as { models?: { name?: string; endpoints?: string[]; context_length?: number }[] })
        .models;

      return (models ?? [])
        .filter((model) => model.name && model.endpoints?.includes('chat'))
        .map((model) => ({
          id: model.name as string,
          label: model.name as string,
          maxTokens: model.context_length,
        }));
    },
  },
  client: ({ apiKey, baseURL }) => createCohere({ apiKey, baseURL }),
};

export const FIREWORKS: ProviderDefinition = {
  name: 'Fireworks',
  description: 'Open models served fast, with your own fine-tunes alongside.',
  apiTokenKey: 'FIREWORKS_API_KEY',
  getApiKeyLink: 'https://fireworks.ai/api-keys',
  staticModels: [
    {
      name: 'accounts/fireworks/models/glm-5p3',
      label: 'GLM 5.3',
      provider: 'Fireworks',
      maxTokenAllowed: 1000000,
      maxCompletionTokens: 131072,
    },
    {
      name: 'accounts/fireworks/models/qwen3-coder-480b-a35b-instruct',
      label: 'Qwen3-Coder 480B (Best for Coding)',
      provider: 'Fireworks',
      maxTokenAllowed: 262000,
    },
    {
      name: 'accounts/fireworks/models/qwen3-coder-30b-a3b-instruct',
      label: 'Qwen3-Coder 30B (Fast Coding)',
      provider: 'Fireworks',
      maxTokenAllowed: 262000,
    },
    {
      name: 'accounts/fireworks/models/llama-v3p1-405b-instruct',
      label: 'Llama 3.1 405B Instruct',
      provider: 'Fireworks',
      maxTokenAllowed: 128000,
    },
    {
      name: 'accounts/fireworks/models/llama-v3p1-70b-instruct',
      label: 'Llama 3.1 70B Instruct',
      provider: 'Fireworks',
      maxTokenAllowed: 128000,
    },
    {
      name: 'accounts/fireworks/models/llama-v3p1-8b-instruct',
      label: 'Llama 3.1 8B Instruct',
      provider: 'Fireworks',
      maxTokenAllowed: 128000,
    },
    {
      name: 'accounts/fireworks/models/deepseek-r1',
      label: 'DeepSeek R1 (Reasoning)',
      provider: 'Fireworks',
      maxTokenAllowed: 64000,
    },
    {
      name: 'accounts/fireworks/models/qwen2p5-72b-instruct',
      label: 'Qwen 2.5 72B Instruct',
      provider: 'Fireworks',
      maxTokenAllowed: 128000,
    },
    {
      name: 'accounts/fireworks/models/firefunction-v2',
      label: 'FireFunction V2',
      provider: 'Fireworks',
      maxTokenAllowed: 8000,
    },
  ],
  discovery: {
    url: 'https://api.fireworks.ai/inference/v1/models',
    defaultMaxTokens: 8000,
    defaultMaxCompletionTokens: 4096,
  },
  client: ({ apiKey, baseURL }) => createFireworks({ apiKey, baseURL }),
};

/*
 * GitHub Models is not here.
 *
 * It was, offering eight models through models.inference.ai.azure.com. That
 * hostname stopped resolving — an eight-second DNS failure paid on every model
 * listing — and its replacement, models.github.ai, answers 410:
 * "GitHub Models is temporarily unavailable as part of a scheduled retirement
 * brownout". The service is being withdrawn, so offering it would mean a
 * person picking a model that cannot answer.
 */

export const HUGGINGFACE: ProviderDefinition = {
  name: 'HuggingFace',
  description: 'The open model hub: thousands of community models behind one key.',
  apiTokenKey: 'HUGGINGFACE_API_KEY',
  getApiKeyLink: 'https://huggingface.co/settings/tokens',
  staticModels: [
    { name: 'Qwen/Qwen3-32B', label: 'Qwen3 32B (HuggingFace)', provider: 'HuggingFace', maxTokenAllowed: 32000 },
    {
      name: 'Qwen/Qwen2.5-Coder-32B-Instruct',
      label: 'Qwen2.5-Coder-32B (HuggingFace)',
      provider: 'HuggingFace',
      maxTokenAllowed: 32000,
    },
    {
      name: 'meta-llama/Llama-3.3-70B-Instruct',
      label: 'Llama 3.3 70B (HuggingFace)',
      provider: 'HuggingFace',
      maxTokenAllowed: 128000,
    },
    {
      name: 'meta-llama/Llama-3.1-405B-Instruct',
      label: 'Llama 3.1 405B (HuggingFace)',
      provider: 'HuggingFace',
      maxTokenAllowed: 128000,
    },
    {
      name: 'deepseek-ai/DeepSeek-R1',
      label: 'DeepSeek R1 (HuggingFace)',
      provider: 'HuggingFace',
      maxTokenAllowed: 64000,
    },
    {
      name: 'NousResearch/Hermes-3-Llama-3.1-8B',
      label: 'Hermes 3 8B (HuggingFace)',
      provider: 'HuggingFace',
      maxTokenAllowed: 32000,
    },
    { name: 'Qwen/QwQ-32B-Preview', label: 'QwQ 32B (HuggingFace)', provider: 'HuggingFace', maxTokenAllowed: 32000 },
    {
      name: 'mistralai/Mistral-Nemo-Instruct-2407',
      label: 'Mistral Nemo (HuggingFace)',
      provider: 'HuggingFace',
      maxTokenAllowed: 128000,
    },
  ],
  discovery: {
    url: 'https://router.huggingface.co/v1/models',
    defaultMaxTokens: 8000,
  },
  client: ({ apiKey, baseURL }) => createOpenAI({ apiKey, baseURL }),
};

export const HYPERBOLIC: ProviderDefinition = {
  name: 'Hyperbolic',
  description: 'Open models on rented GPUs, cheaper than the first-party APIs.',
  apiTokenKey: 'HYPERBOLIC_API_KEY',
  getApiKeyLink: 'https://app.hyperbolic.xyz/settings',
  staticModels: [
    { name: 'Qwen/Qwen3-32B', label: 'Qwen3 32B', provider: 'Hyperbolic', maxTokenAllowed: 32768 },
    {
      name: 'Qwen/Qwen2.5-Coder-32B-Instruct',
      label: 'Qwen 2.5 Coder 32B',
      provider: 'Hyperbolic',
      maxTokenAllowed: 32768,
    },
    { name: 'deepseek-ai/DeepSeek-R1', label: 'DeepSeek R1', provider: 'Hyperbolic', maxTokenAllowed: 64000 },
    {
      name: 'meta-llama/Llama-3.3-70B-Instruct',
      label: 'Llama 3.3 70B',
      provider: 'Hyperbolic',
      maxTokenAllowed: 128000,
    },
    { name: 'Qwen/QwQ-32B-Preview', label: 'QwQ 32B', provider: 'Hyperbolic', maxTokenAllowed: 32768 },
    { name: 'Qwen/Qwen2-VL-72B-Instruct', label: 'Qwen2-VL 72B', provider: 'Hyperbolic', maxTokenAllowed: 32768 },
  ],
  discovery: {
    url: 'https://api.hyperbolic.xyz/v1/models',
    defaultMaxTokens: 8000,
    defaultMaxCompletionTokens: 4096,
  },
  client: ({ apiKey, baseURL }) => createOpenAI({ apiKey, baseURL }),
};

export const MOONSHOT: ProviderDefinition = {
  name: 'Moonshot',
  description: 'Kimi models, with unusually long context and Chinese-language strength.',
  apiTokenKey: 'MOONSHOT_API_KEY',
  getApiKeyLink: 'https://platform.moonshot.ai/console/api-keys',
  staticModels: [
    {
      name: 'kimi-k3',
      label: 'Kimi K3',
      provider: 'Moonshot',
      maxTokenAllowed: 1048576,
      maxCompletionTokens: 131072,
    },
    { name: 'moonshot-v1-8k', label: 'Moonshot v1 8K', provider: 'Moonshot', maxTokenAllowed: 8000 },
    { name: 'moonshot-v1-32k', label: 'Moonshot v1 32K', provider: 'Moonshot', maxTokenAllowed: 32000 },
    { name: 'moonshot-v1-128k', label: 'Moonshot v1 128K', provider: 'Moonshot', maxTokenAllowed: 128000 },
    { name: 'moonshot-v1-auto', label: 'Moonshot v1 Auto', provider: 'Moonshot', maxTokenAllowed: 128000 },
    {
      name: 'moonshot-v1-8k-vision-preview',
      label: 'Moonshot v1 8K Vision',
      provider: 'Moonshot',
      maxTokenAllowed: 8000,
    },
    {
      name: 'moonshot-v1-32k-vision-preview',
      label: 'Moonshot v1 32K Vision',
      provider: 'Moonshot',
      maxTokenAllowed: 32000,
    },
    {
      name: 'moonshot-v1-128k-vision-preview',
      label: 'Moonshot v1 128K Vision',
      provider: 'Moonshot',
      maxTokenAllowed: 128000,
    },
    { name: 'kimi-latest', label: 'Kimi Latest', provider: 'Moonshot', maxTokenAllowed: 128000 },
    { name: 'kimi-k2-0711-preview', label: 'Kimi K2 Preview', provider: 'Moonshot', maxTokenAllowed: 128000 },
    { name: 'kimi-k2-turbo-preview', label: 'Kimi K2 Turbo', provider: 'Moonshot', maxTokenAllowed: 128000 },
    { name: 'kimi-thinking-preview', label: 'Kimi Thinking', provider: 'Moonshot', maxTokenAllowed: 128000 },
  ],
  discovery: {
    url: 'https://api.moonshot.ai/v1/models',
    defaultMaxTokens: 128000,
    defaultMaxCompletionTokens: 8192,
  },
  client: ({ apiKey, baseURL }) => createOpenAI({ apiKey, baseURL }),
};

export const OPENROUTER: ProviderDefinition = {
  name: 'OpenRouter',
  description: 'One key for many vendors, and automatic failover between them.',
  apiTokenKey: 'OPEN_ROUTER_API_KEY',
  getApiKeyLink: 'https://openrouter.ai/settings/keys',
  staticModels: [
    {
      name: 'anthropic/claude-opus-5',
      label: 'Claude Opus 5',
      provider: 'OpenRouter',
      maxTokenAllowed: 1000000,
      maxCompletionTokens: 128000,
    },
    {
      name: 'anthropic/claude-3.5-sonnet',
      label: 'Claude 3.5 Sonnet',
      provider: 'OpenRouter',
      maxTokenAllowed: 200000,
    },
    { name: 'anthropic/claude-opus-4', label: 'Claude Opus 4', provider: 'OpenRouter', maxTokenAllowed: 200000 },
    { name: 'openai/gpt-4o', label: 'GPT-4o', provider: 'OpenRouter', maxTokenAllowed: 128000 },
    { name: 'openai/gpt-4o-mini', label: 'GPT-4o Mini', provider: 'OpenRouter', maxTokenAllowed: 128000 },
    { name: 'openai/o1', label: 'o1', provider: 'OpenRouter', maxTokenAllowed: 200000 },
    {
      name: 'google/gemini-2.0-flash-001',
      label: 'Gemini 2.0 Flash',
      provider: 'OpenRouter',
      maxTokenAllowed: 1000000,
    },
    {
      name: 'meta-llama/llama-3.3-70b-instruct',
      label: 'Llama 3.3 70B',
      provider: 'OpenRouter',
      maxTokenAllowed: 128000,
    },
    { name: 'deepseek/deepseek-r1', label: 'DeepSeek R1', provider: 'OpenRouter', maxTokenAllowed: 64000 },
    { name: 'x-ai/grok-4', label: 'Grok 4', provider: 'OpenRouter', maxTokenAllowed: 256000 },
  ],
  discovery: {
    url: 'https://openrouter.ai/api/v1/models',
    public: true,
    defaultMaxTokens: 8000,
    defaultMaxCompletionTokens: 4096,

    /*
     * OpenRouter says what each model is and how much context it takes, so
     * there is no reason to guess either. The label is what a person reads in
     * the picker; the id is what gets sent.
     */
    parse: (payload) => {
      const models = (payload as { data?: { id?: string; name?: string; context_length?: number }[] }).data;

      return (models ?? [])
        .filter((model) => typeof model.id === 'string')
        .map((model) => ({
          id: model.id as string,
          label: model.name ?? (model.id as string),
          maxTokens: model.context_length,
        }));
    },
  },
  client:
    ({ apiKey }) =>
    (model: string) =>
      createOpenAI({ apiKey, baseURL: 'https://openrouter.ai/api/v1' })(model) as LanguageModelV1,
};

export const PERPLEXITY: ProviderDefinition = {
  name: 'Perplexity',
  description: 'Models that search the web as they answer, and cite what they used.',
  apiTokenKey: 'PERPLEXITY_API_KEY',
  getApiKeyLink: 'https://www.perplexity.ai/settings/api',
  staticModels: [
    { name: 'sonar', label: 'Sonar', provider: 'Perplexity', maxTokenAllowed: 128000 },
    { name: 'sonar-pro', label: 'Sonar Pro', provider: 'Perplexity', maxTokenAllowed: 200000 },
    { name: 'sonar-reasoning-pro', label: 'Sonar Reasoning Pro', provider: 'Perplexity', maxTokenAllowed: 128000 },
    { name: 'sonar-reasoning', label: 'Sonar Reasoning', provider: 'Perplexity', maxTokenAllowed: 128000 },
    { name: 'sonar-deep-research', label: 'Sonar Deep Research', provider: 'Perplexity', maxTokenAllowed: 128000 },
    { name: 'r1-1776', label: 'R1 1776', provider: 'Perplexity', maxTokenAllowed: 128000 },
  ],
  discovery: {
    url: 'https://api.perplexity.ai/models',
    defaultMaxTokens: 8000,
    defaultMaxCompletionTokens: 4096,
  },
  client: ({ apiKey, baseURL }) => createOpenAI({ apiKey, baseURL }),
};

export const TOGETHER: ProviderDefinition = {
  name: 'Together',
  description: 'A broad catalogue of open models, with fine-tuning and dedicated capacity.',
  apiTokenKey: 'TOGETHER_API_KEY',
  baseUrlKey: 'TOGETHER_API_BASE_URL',
  getApiKeyLink: 'https://api.together.xyz/settings/api-keys',
  staticModels: [
    {
      name: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
      label: 'Llama 3.3 70B',
      provider: 'Together',
      maxTokenAllowed: 128000,
      maxCompletionTokens: 8192,
    },
    {
      name: 'meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo',
      label: 'Llama 3.2 90B Vision',
      provider: 'Together',
      maxTokenAllowed: 128000,
      maxCompletionTokens: 8192,
    },
    {
      name: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
      label: 'Mixtral 8x7B Instruct',
      provider: 'Together',
      maxTokenAllowed: 32000,
      maxCompletionTokens: 8192,
    },
    {
      name: 'Qwen/Qwen2.5-72B-Instruct-Turbo',
      label: 'Qwen2.5 72B',
      provider: 'Together',
      maxTokenAllowed: 32768,
      maxCompletionTokens: 8192,
    },
    {
      name: 'deepseek-ai/DeepSeek-R1',
      label: 'DeepSeek R1',
      provider: 'Together',
      maxTokenAllowed: 64000,
      maxCompletionTokens: 8192,
    },
    {
      name: 'Qwen/QwQ-32B-Preview',
      label: 'QwQ 32B',
      provider: 'Together',
      maxTokenAllowed: 32768,
      maxCompletionTokens: 8192,
    },
  ],
  discovery: {
    url: 'https://api.together.xyz/v1/models',
    defaultMaxTokens: 8000,
    defaultMaxCompletionTokens: 4096,
  },
  client: ({ apiKey, baseURL }) => createOpenAI({ apiKey, baseURL }),
};

export const ZAI: ProviderDefinition = {
  name: 'Z.ai',
  description: 'GLM models, capable general-purpose models from Zhipu.',
  apiTokenKey: 'ZAI_API_KEY',
  baseUrlKey: 'ZAI_BASE_URL',
  baseUrl: 'https://api.z.ai/api/coding/paas/v4',
  getApiKeyLink: 'https://open.bigmodel.cn/usercenter/apikeys',
  staticModels: [
    { name: 'glm-4.7', label: 'GLM-4.7 (200K)', provider: 'Z.ai', maxTokenAllowed: 200000, maxCompletionTokens: 65536 },
    { name: 'glm-4.6', label: 'GLM-4.6 (200K)', provider: 'Z.ai', maxTokenAllowed: 200000, maxCompletionTokens: 65536 },
    { name: 'glm-4.5', label: 'GLM-4.5 (128K)', provider: 'Z.ai', maxTokenAllowed: 128000, maxCompletionTokens: 65536 },
    {
      name: 'glm-4.5-flash',
      label: 'GLM-4.5 Flash (128K)',
      provider: 'Z.ai',
      maxTokenAllowed: 128000,
      maxCompletionTokens: 65536,
    },
    {
      name: 'glm-4-flash',
      label: 'GLM-4 Flash',
      provider: 'Z.ai',
      maxTokenAllowed: 128000,
      maxCompletionTokens: 65536,
    },
    { name: 'glm-4-air', label: 'GLM-4 Air', provider: 'Z.ai', maxTokenAllowed: 128000, maxCompletionTokens: 8192 },
  ],
  discovery: {
    url: 'https://api.z.ai/api/paas/v4/models',
    defaultMaxTokens: 128000,
    defaultMaxCompletionTokens: 8192,
  },
  client: ({ apiKey, baseURL }) => createOpenAI({ apiKey, baseURL }),
};

export const OLLAMA: ProviderDefinition = {
  name: 'Ollama',
  description: 'Models running on this machine, through Ollama. No key, no network.',
  baseUrlKey: 'OLLAMA_API_BASE_URL',
  getApiKeyLink: 'https://ollama.com/download',
  labelForGetApiKey: 'Download Ollama',
  icon: 'i-ph:cloud-arrow-down',
  local: true,
  staticModels: [],
  discovery: {
    url: (baseUrl) => (baseUrl ? `${baseUrl}/api/tags` : undefined),
    defaultMaxTokens: 8000,
    parse: (payload) =>
      ((payload as { models?: Array<{ name: string }> }).models ?? []).map((entry) => ({ id: entry.name })),
  },
  client:
    ({ baseURL }) =>
    (model: string) =>
      createOllama({ baseURL })(model),
};

export const LMSTUDIO: ProviderDefinition = {
  name: 'LMStudio',
  description: 'Models running on this machine, through LM Studio. No key, no network.',
  baseUrlKey: 'LMSTUDIO_API_BASE_URL',
  baseUrl: 'http://localhost:1234/',
  getApiKeyLink: 'https://lmstudio.ai/',
  labelForGetApiKey: 'Get LMStudio',
  icon: 'i-ph:cloud-arrow-down',
  local: true,
  staticModels: [],
  discovery: {
    url: (baseUrl) => (baseUrl ? `${baseUrl}/v1/models` : undefined),
    defaultMaxTokens: 8000,
  },
  client: ({ apiKey, baseURL }) => createOpenAI({ apiKey, baseURL }),
};

export const OPENAILIKE: ProviderDefinition = {
  name: 'OpenAILike',
  description: 'Any server that speaks the OpenAI API — a proxy, a gateway, your own.',
  apiTokenKey: 'OPENAI_LIKE_API_KEY',
  baseUrlKey: 'OPENAI_LIKE_API_BASE_URL',
  local: true,
  staticModels: [],
  discovery: {
    url: (baseUrl) => (baseUrl ? `${baseUrl}/models` : undefined),
    defaultMaxTokens: 8000,
  },
  client: ({ apiKey, baseURL }) => createOpenAI({ apiKey, baseURL }),
};

export const NVIDIA: ProviderDefinition = {
  name: 'NVIDIA',
  description: 'NVIDIA NIM — open models served on NVIDIA infrastructure, OpenAI-compatible.',
  apiTokenKey: 'NVIDIA_API_KEY',
  getApiKeyLink: 'https://build.nvidia.com/explore/discover',
  labelForGetApiKey: 'Get an NVIDIA API key',
  icon: 'i-ph:graphics-card',

  /*
   * No hand-written catalogue.
   *
   * There was one, and NVIDIA answered 410 Gone for most of it: the ids were
   * written from documentation and the models had since been retired. A model
   * in the picker that the provider refuses is worse than a shorter list — the
   * person only finds out when their message fails. The public registry and
   * NVIDIA's own /models between them supply more than a hundred, and both
   * stay current without anyone editing this file.
   */
  staticModels: [],
  discovery: {
    url: 'https://integrate.api.nvidia.com/v1/models',
    defaultMaxTokens: 32000,
  },

  /* The compatible client: NVIDIA implements /chat/completions, not /responses. */
  client: ({ apiKey }) =>
    createOpenAICompatible({
      name: 'nvidia',
      apiKey: apiKey ?? 'not-needed',
      baseURL: 'https://integrate.api.nvidia.com/v1',
    }),
};

/*
 * The OpenAI-compatible providers live in their own file: they need nothing
 * from this one but the shape, and keeping them apart stops this file growing
 * without limit as more are added.
 */
export const PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  ANTHROPIC,
  OPENAI,
  GOOGLE,
  DEEPSEEK,
  MISTRAL,
  GROQ,
  XAI,
  CEREBRAS,
  COHERE,
  FIREWORKS,
  HUGGINGFACE,
  HYPERBOLIC,
  MOONSHOT,
  OPENROUTER,
  NVIDIA,
  PERPLEXITY,
  TOGETHER,
  ZAI,
  OLLAMA,
  LMSTUDIO,
  OPENAILIKE,

  /*
   * Appended, not prepended. The first provider in this list is what a fresh
   * install selects, and putting these first meant Cude opened on Azure —
   * which has no models until someone supplies a resource URL, so the picker
   * was empty on the very first screen.
   */
  ...ADDITIONAL_PROVIDERS,
];
