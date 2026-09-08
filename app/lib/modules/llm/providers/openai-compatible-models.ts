/**
 * Cude.new - shared model discovery for OpenAI-compatible `/v1/models` endpoints.
 *
 * Several providers (xAI, Mistral, Perplexity, ...) expose the same listing
 * shape as OpenAI. Each of them used to ship a hand-maintained array and no
 * discovery at all, which is why their selectors went stale. This helper gives
 * them discovery without duplicating the fetch, the error classification, or
 * the non-chat filtering in every adapter.
 */

import type { ModelInfo } from '~/lib/modules/llm/types';
import { isChatCompletionModel } from './openai-models';

interface ModelListEntry {
  id: string;
  object?: string;
}

export interface DiscoverOptions {
  /** Full URL of the models endpoint. */
  url: string;
  apiKey: string;

  /** Provider name, used for ModelInfo.provider and error messages. */
  provider: string;

  /** Ids already present in the static list, so they are not offered twice. */
  knownIds?: Set<string>;

  /** Context window applied to discovered models when the API does not say. */
  defaultMaxTokens?: number;

  /** Optional extra filter on top of the shared non-chat exclusions. */
  accept?: (id: string) => boolean;

  /** How long to wait before giving up. See DISCOVERY_TIMEOUT_MS. */
  timeoutMs?: number;
}

/**
 * How long a provider gets to say what models it has.
 *
 * There has to be a deadline. The model list asks every provider at once and
 * answers with all of them, so one slow endpoint delays the whole picker — and
 * "slow" includes a hostname that no longer resolves, which is not a quick
 * failure: GitHub's old endpoint took nearly nine seconds to fail DNS, and
 * every page load paid it.
 *
 * Five seconds is well beyond what a healthy /models call takes and well
 * inside what a person will wait.
 */
export const DISCOVERY_TIMEOUT_MS = 5000;

/**
 * Names that carry capitals a machine cannot infer.
 *
 * Only the ones that are actually wrong when title-cased: "DeepSeek", not
 * "Deepseek"; "CodeLlama", not "Codellama". A vendor whose name is an ordinary
 * word — Google, Microsoft, Databricks — is left to the general rule.
 */
const KNOWN_NAMES: Record<string, string> = {
  /* Looked up whole before being split, so this does not become "01.AI AI". */
  '01-ai': '01.AI',
  moe: 'MoE',
  ai21labs: 'AI21 Labs',
  aisingapore: 'AI Singapore',
  bigcode: 'BigCode',
  codegemma: 'CodeGemma',
  codellama: 'CodeLlama',
  deepseek: 'DeepSeek',
  diffusiongemma: 'DiffusionGemma',
  llama2: 'Llama 2',
  llama3: 'Llama 3',
  minimax: 'MiniMax',
  mistralai: 'Mistral AI',
  moonshotai: 'Moonshot AI',
  nemotron: 'Nemotron',
  openai: 'OpenAI',
  recurrentgemma: 'RecurrentGemma',
  starcoder2: 'StarCoder2',
};

/** Tokens that are initialisms, and read wrong in any other case. */
const INITIALISMS = new Set([
  'ai',
  'api',
  'awq',
  'dbrx',
  'fp8',
  'fp16',
  'gguf',
  'hf',
  'ibm',
  'int4',
  'int8',
  'llm',
  'gpt',
  'nim',
  'nvidia',
  'ocr',
  'rl',
  'sft',
  'vl',
]);

/** One dash-separated token, cased the way a person writes it. */
function humanizeToken(token: string): string {
  const lower = token.toLowerCase();

  if (KNOWN_NAMES[lower]) {
    return KNOWN_NAMES[lower];
  }

  if (INITIALISMS.has(lower)) {
    return lower.toUpperCase();
  }

  /*
   * Parameter counts and context windows: 70b, 6.7b, a800m, 128k. The unit is
   * a capital in every published name — "Llama 3.3 70B", never "70b".
   */
  if (/^[a-z]?\d+(\.\d+)?[bmk]$/i.test(lower)) {
    return lower.toUpperCase();
  }

  // A version suffix keeps its lowercase v: "Instruct v0.1".
  if (/^v\d/.test(lower)) {
    return lower;
  }

  if (/^\d/.test(token)) {
    return token;
  }

  return token.charAt(0).toUpperCase() + token.slice(1);
}

/**
 * Turn a raw model id into something readable in the selector.
 *
 * Ids arrive as `deepseek-ai/deepseek-coder-6.7b-instruct`. Splitting on
 * dashes alone left the slash inside a token, so the vendor and the model
 * fused into one unreadable word: "Deepseek Ai/deepseek Coder 6.7b Instruct".
 * Fifty-two of NVIDIA's hundred and twenty models read like that.
 *
 * The vendor is kept — with a hundred models from a dozen labs in one list,
 * "Google Gemma 2B" and "Meta CodeLlama 70B" are worth telling apart — except
 * where it only repeats what the model is already called.
 */
export function humanizeModelId(id: string): string {
  const segments = id.split('/').filter(Boolean);
  const name = segments.pop() ?? id;
  const vendor = segments.join(' ');

  /* A name whose dashes are part of it — `01-ai` — is matched whole first. */
  const humanized = (value: string) =>
    KNOWN_NAMES[value.toLowerCase()] ?? value.split(/[-_]/).filter(Boolean).map(humanizeToken).join(' ');

  const modelName = humanized(name);

  if (!vendor) {
    return modelName;
  }

  const vendorName = humanized(vendor);

  /*
   * `deepseek-ai/deepseek-coder` would read "DeepSeek AI DeepSeek Coder".
   * Where the model already names its maker, saying it twice adds nothing.
   */
  const firstWord = vendorName.split(' ')[0].toLowerCase();

  if (modelName.toLowerCase().startsWith(firstWord)) {
    return modelName;
  }

  return `${vendorName} ${modelName}`;
}

/**
 * Fetch and normalize the model list from an OpenAI-compatible endpoint.
 *
 * Throws on a non-2xx so the caller's error normalizer can classify it (401,
 * 429, ...) instead of failing later on a missing `data` array.
 */
export async function discoverOpenAICompatibleModels(options: DiscoverOptions): Promise<ModelInfo[]> {
  const { url, apiKey, provider, knownIds, defaultMaxTokens = 32000, accept, timeoutMs } = options;

  let response: Response;

  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(timeoutMs ?? DISCOVERY_TIMEOUT_MS),
    });
  } catch (error) {
    /*
     * A timeout, a refused connection, a hostname that no longer exists. Said
     * plainly and attributed, because the alternative — "fetch failed" with no
     * provider name — is what made the eight-second stall hard to find.
     *
     * `unreachable` is set because the caller has to tell this apart from a
     * provider that answered with a problem. A local model server nobody is
     * running is the ordinary state of a fresh install, not a fault, and
     * logging four of those as errors on every page load is how a log stops
     * being read. Rewriting the message alone broke that: the classification
     * was matching on the error's name, and wrapping it changed the name.
     */
    const timedOut = (error as Error)?.name === 'TimeoutError';
    const failure = new Error(`${provider} ${timedOut ? 'did not answer in time' : 'could not be reached'} at ${url}`, {
      cause: error,
    }) as Error & { unreachable: boolean };
    failure.unreachable = true;

    throw failure;
  }

  if (!response.ok) {
    const failure = new Error(`${provider} model discovery failed with status ${response.status}`) as Error & {
      statusCode: number;
    };
    failure.statusCode = response.status;

    throw failure;
  }

  const body = (await response.json()) as { data?: ModelListEntry[] };

  if (!Array.isArray(body.data)) {
    throw new Error(`${provider} model discovery returned an unexpected response shape`);
  }

  return body.data
    .filter((model) => typeof model?.id === 'string')
    .filter((model) => !knownIds?.has(model.id))
    .filter((model) => isChatCompletionModel(model.id))
    .filter((model) => (accept ? accept(model.id) : true))
    .map((model) => ({
      name: model.id,
      label: humanizeModelId(model.id),
      provider,
      maxTokenAllowed: defaultMaxTokens,
    }));
}
