/**
 * Cude.new — the public model registry.
 *
 * The problem this solves: a provider will not tell you what models it has
 * until you give it a key. Groq, Mistral, DeepSeek, Together, xAI all answer
 * 401 to an anonymous request. So before a key is pasted, the only models Cude
 * could offer were the handful written into the source — and those are stale
 * the day a vendor ships something.
 *
 * models.dev publishes what every provider currently offers, as one JSON
 * document, to anybody. Reading it means a person sees Anthropic's fourteen
 * models and NVIDIA's hundred before configuring anything, and a model
 * released this morning appears without this repository being touched.
 *
 * The registry is a source of names and limits, not of trust: everything from
 * it is data. It is fetched server-side, so a slow or unreachable registry
 * costs one request rather than blocking a page, and a failure is silent —
 * the built-in catalogues are still there.
 */

import type { ModelInfo } from '~/lib/modules/llm/types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('modelRegistry');

export const REGISTRY_URL = 'https://models.dev/api.json';

/**
 * How long a fetched registry is reused before asking again.
 *
 * An hour, matching the interval an open tab refreshes on: any longer and the
 * client asks for a list the server will not have updated, so a model released
 * this morning could sit unseen for most of the day.
 */
export const REGISTRY_TTL_MS = 60 * 60 * 1000;

/** How long to wait before giving up and serving what we already have. */
const REGISTRY_TIMEOUT_MS = 8000;

/**
 * Registry provider id to the name Cude uses.
 *
 * Written out rather than guessed: the registry calls Together "togetherai"
 * and Z.ai "zhipuai", and a fuzzy match would quietly attribute one vendor's
 * models to another.
 */
export const REGISTRY_TO_PROVIDER: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  deepseek: 'Deepseek',
  mistral: 'Mistral',
  groq: 'Groq',
  xai: 'xAI',
  cerebras: 'Cerebras',
  cohere: 'Cohere',
  'fireworks-ai': 'Fireworks',
  huggingface: 'HuggingFace',
  moonshotai: 'Moonshot',
  openrouter: 'OpenRouter',
  perplexity: 'Perplexity',
  togetherai: 'Together',
  zhipuai: 'Z.ai',
  nvidia: 'NVIDIA',
  azure: 'Azure OpenAI',
  deepinfra: 'DeepInfra',
  nebius: 'Nebius',
  baseten: 'Baseten',
  upstage: 'Upstage',
  venice: 'Venice',
  chutes: 'Chutes',
  'novita-ai': 'Novita',
  lmstudio: 'LMStudio',
};

interface RegistryModel {
  id?: string;
  name?: string;
  family?: string;
  limit?: { context?: number; output?: number };
  reasoning?: boolean;
  tool_call?: boolean;
  release_date?: string;
  modalities?: { input?: string[]; output?: string[] };
}

interface RegistryProvider {
  name?: string;
  models?: Record<string, RegistryModel>;
}

type Registry = Record<string, RegistryProvider>;

let cached: { at: number; models: Map<string, ModelInfo[]> } | null = null;
let inFlight: Promise<Map<string, ModelInfo[]>> | null = null;

/**
 * Model families that never hold a conversation, however the registry
 * describes them.
 *
 * models.dev lists everything a provider offers, and several entries claim a
 * text→text shape while being nothing of the sort: `bge` is an embedding
 * family, `esm` predicts protein structures. Their descriptions even read like
 * chat models, so neither the modalities nor the prose can be trusted — only
 * the family name says what they are.
 */
const NON_CHAT_FAMILIES = new Set(['bge', 'esm']);

/**
 * True when this is a model you can hold a conversation with.
 *
 * The registry lists everything a provider offers, which includes image and
 * video generators, transcription, embedding and protein models. Offering
 * `grok-imagine-video` in a chat model picker is a bug, not a feature: it
 * cannot answer.
 */
function isChatModel(model: RegistryModel): boolean {
  const family = (model.family ?? '').toLowerCase();

  if (family && NON_CHAT_FAMILIES.has(family)) {
    return false;
  }

  const input = model.modalities?.input;

  /*
   * A model that does not take text in — a vision or video model, a speech
   * recogniser — cannot take part in a text conversation, whatever it claims
   * to output.
   */
  if (input && !input.includes('text')) {
    return false;
  }

  const output = model.modalities?.output;

  if (output && !output.includes('text')) {
    return false;
  }

  const id = (model.id ?? '').toLowerCase();

  /*
   * Embedding, reranking, retrieval, protein and speech models all answer in
   * text-shaped JSON. Kept narrow on purpose: a multimodal chat model has an
   * id full of vision words and must stay offered — those are told apart by
   * their declared input above, not by name.
   */
  if (/(^|[/\-_.])(embed|embedding|rerank|moderation|whisper|tts|stt|guard|safety|ocr|detection)/.test(id)) {
    return false;
  }

  /*
   * Short family names need a boundary on both sides where one exists:
   * `bge` without a trailing one would also match a hypothetical `bgemma`,
   * while `bge-m3` still matches through the dash that follows it. `esm`
   * keeps only the leading boundary — the family spells it `esm2`, `esmfold`,
   * with no separator at all, and no chat model starts a token that way.
   */
  return !/(^|[/\-_.])(bge|retriev)(?=[/\-_.0-9]|$)/.test(id) && !/(^|[/\-_.])esm/.test(id);
}

/** A context window we are willing to act on. */
function contextFor(model: RegistryModel): number {
  const context = model.limit?.context;

  return typeof context === 'number' && context > 0 ? context : 8000;
}

/**
 * Turns the registry into models, grouped by the provider Cude knows.
 *
 * Anything the registry lists under a provider Cude does not have is dropped:
 * offering a model with nothing to send it to is worse than not offering it.
 */
export function readRegistry(payload: unknown): Map<string, ModelInfo[]> {
  const registry = (payload ?? {}) as Registry;
  const byProvider = new Map<string, ModelInfo[]>();

  for (const [registryId, entry] of Object.entries(registry)) {
    const provider = REGISTRY_TO_PROVIDER[registryId];

    if (!provider || !entry?.models) {
      continue;
    }

    const models: ModelInfo[] = [];

    for (const [id, model] of Object.entries(entry.models)) {
      const name = model?.id ?? id;

      if (typeof name !== 'string' || !name) {
        continue;
      }

      if (!isChatModel({ ...model, id: name })) {
        continue;
      }

      models.push({
        name,
        label: model.name ?? name,
        provider,
        maxTokenAllowed: contextFor(model),
        maxCompletionTokens: model.limit?.output,
        reasoning: model.reasoning,
        toolCall: model.tool_call,
        published: true,
      });
    }

    if (models.length > 0) {
      // Newest first is not knowable from a name, so sort by label for the eye.
      models.sort((a, b) => a.label.localeCompare(b.label));
      byProvider.set(provider, models);
    }
  }

  return byProvider;
}

/**
 * The registry, fetched at most once every few hours.
 *
 * Concurrent callers share one request: the model list is asked for on every
 * page load, and twenty tabs opening at once should not mean twenty fetches of
 * a four-megabyte document.
 */
export async function fetchModelRegistry(force = false): Promise<Map<string, ModelInfo[]>> {
  if (!force && cached && Date.now() - cached.at < REGISTRY_TTL_MS) {
    return cached.models;
  }

  if (inFlight) {
    return inFlight;
  }

  inFlight = (async () => {
    try {
      const response = await fetch(REGISTRY_URL, {
        signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS),
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`registry answered ${response.status}`);
      }

      const models = readRegistry(await response.json());
      cached = { at: Date.now(), models };
      logger.info(`Registry: ${models.size} providers, ${[...models.values()].flat().length} models`);

      return models;
    } catch (error) {
      /*
       * Offline, blocked, or slow. The built-in catalogues still work, so this
       * is a smaller list rather than a broken one. Keep whatever we had.
       */
      logger.debug('Could not read the model registry:', error);

      return cached?.models ?? new Map<string, ModelInfo[]>();
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * Adds the registry's models to a list, without displacing what is already there.
 *
 * A model the provider itself reported, or one written into the source with a
 * hand-checked context window, is better than the registry's version of the
 * same model — so those win, and the registry fills the gaps.
 */
export function mergeRegistryModels(existing: ModelInfo[], registry: Map<string, ModelInfo[]>): ModelInfo[] {
  const fromRegistry = new Map<string, ModelInfo>();

  for (const models of registry.values()) {
    for (const model of models) {
      fromRegistry.set(`${model.provider}:${model.name}`, model);
    }
  }

  /*
   * A model can arrive twice: once because the provider listed it, once
   * because the registry did. The provider is authoritative that it exists,
   * and nothing else — its /models endpoint returns an id and no more, so the
   * label is generated from the id and the context window is a house default.
   * The registry has the published name and the real limit.
   *
   * NVIDIA's Kimi K3 is the case that made this obvious: discovered, it read
   * "Moonshotai/kimi K3" with a 32k window; the registry knows better. Taking
   * the id from one and the description from the other gives a list that is
   * both complete and correct.
   */
  const merged = existing.map((model) => {
    const known = fromRegistry.get(`${model.provider}:${model.name}`);

    if (!known) {
      return model;
    }

    return {
      ...model,
      label: preferPublishedLabel(model, known),
      maxTokenAllowed: Math.max(model.maxTokenAllowed ?? 0, known.maxTokenAllowed ?? 0) || model.maxTokenAllowed,

      /*
       * The larger, exactly as for the context window above — and for the same
       * reason, which `??` here quietly defeated.
       *
       * A discovered model carries a house default, because a provider's
       * /models endpoint returns an id and nothing else. `??` treats that
       * default as knowledge and keeps it, so every OpenRouter model was
       * capped at the 4096 written into the discovery block while the registry
       * knew the real figure was half a million. Four thousand tokens is not
       * enough to write one HTML file: a follow-up asking for a change came
       * back as a long explanation with the file missing, and the turn still
       * read as finished.
       */
      maxCompletionTokens:
        Math.max(model.maxCompletionTokens ?? 0, known.maxCompletionTokens ?? 0) || model.maxCompletionTokens,

      /* A discovered model says nothing about itself; the registry does. */
      reasoning: model.reasoning ?? known.reasoning,
      toolCall: model.toolCall ?? known.toolCall,

      /* The registry lists it, so it is a model that can still be reached. */
      published: true,
    };
  });

  const seen = new Set(merged.map((model) => `${model.provider}:${model.name}`));
  const added: ModelInfo[] = [];

  for (const [key, model] of fromRegistry) {
    if (!seen.has(key)) {
      added.push(model);
      seen.add(key);
    }
  }

  return [...merged, ...added];
}

/**
 * The label a person should read.
 *
 * A discovered model's label is derived from its id, so it comes out as
 * "Moonshotai/kimi K3". Where the registry has a published name, that is the
 * one somebody would recognise.
 */
function preferPublishedLabel(discovered: ModelInfo, published: ModelInfo): string {
  const looksGenerated =
    !discovered.label ||
    discovered.label === discovered.name ||
    discovered.label.replace(/[\s/_-]/g, '').toLowerCase() === discovered.name.replace(/[\s/_-]/g, '').toLowerCase();

  return looksGenerated ? published.label : discovered.label;
}

/** Forgets the cached registry. For tests. */
export function resetRegistryCache(): void {
  cached = null;
  inFlight = null;
}
