import type { ModelAdapter, ModelAdapterContext, ModelAdapterEvent, ModelMessage, ModelRequest } from './contracts';

interface OpenAICompatibleAdapterOptions {
  readonly endpoint: string;
  readonly apiKey?: string;
  readonly fetcher?: typeof fetch;
}

export class OpenAICompatibleAdapter implements ModelAdapter {
  readonly providerId = 'openai-compatible';
  readonly #endpoint: string;
  readonly #apiKey?: string;
  readonly #fetcher: typeof fetch;

  constructor(options: OpenAICompatibleAdapterOptions) {
    this.#endpoint = options.endpoint;
    this.#apiKey = options.apiKey;
    this.#fetcher = options.fetcher ?? fetch;
  }

  async *stream(request: ModelRequest, context: ModelAdapterContext): AsyncIterable<ModelAdapterEvent> {
    const response = await this.#fetcher(this.#endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.#apiKey ? { authorization: `Bearer ${this.#apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: request.target.modelId,
        messages: request.messages.map(toProviderMessage),
        ...(request.tools?.length
          ? {
              tools: request.tools.map((tool) => ({
                type: 'function',
                function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
              })),
            }
          : {}),
        ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
        ...(request.maxOutputTokens === undefined ? {} : { max_tokens: request.maxOutputTokens }),
      }),
      signal: context.signal,
    });

    if (!response.ok) {
      throw Object.assign(new Error(`Model endpoint returned ${response.status}.`), { status: response.status });
    }

    const payload: unknown = await response.json();
    const result = readResponse(payload);

    if (result.text) {
      yield { type: 'text-delta', text: result.text };
    }

    if (result.usage) {
      yield { type: 'usage', usage: result.usage };
    }

    yield { type: 'completed', finishReason: result.finishReason };
  }
}

function toProviderMessage(message: ModelMessage): { role: string; content: string } {
  const content = message.content
    .map((part) => {
      if (part.type === 'text') {
        return part.text;
      }

      if (part.type === 'tool-result') {
        return JSON.stringify(part.result);
      }

      return `[image:${part.mediaType}]`;
    })
    .join('\n');

  return { role: message.role, content };
}

function readResponse(value: unknown): {
  text: string;
  usage?: { inputTokens: number; outputTokens: number; cachedInputTokens?: number };
  finishReason: 'stop' | 'length' | 'tool-call' | 'content-filter' | 'unknown';
} {
  if (!isRecord(value) || !Array.isArray(value.choices) || !isRecord(value.choices[0])) {
    throw new Error('The model endpoint returned an unsupported response.');
  }

  const choice = value.choices[0];
  const message = isRecord(choice.message) ? choice.message : undefined;
  const text = typeof message?.content === 'string' ? message.content : '';
  const usageValue = isRecord(value.usage) ? value.usage : undefined;
  const inputTokens = integer(usageValue?.prompt_tokens);
  const outputTokens = integer(usageValue?.completion_tokens);
  const cachedInputTokens = isRecord(usageValue?.prompt_tokens_details)
    ? integer(usageValue.prompt_tokens_details.cached_tokens)
    : undefined;

  return {
    text,
    ...(inputTokens === undefined || outputTokens === undefined
      ? {}
      : {
          usage: {
            inputTokens,
            outputTokens,
            ...(cachedInputTokens === undefined ? {} : { cachedInputTokens }),
          },
        }),
    finishReason: normalizeFinishReason(choice.finish_reason),
  };
}

function normalizeFinishReason(value: unknown): 'stop' | 'length' | 'tool-call' | 'content-filter' | 'unknown' {
  if (value === 'stop' || value === 'length') {
    return value;
  }

  if (value === 'tool_calls' || value === 'function_call') {
    return 'tool-call';
  }

  return value === 'content_filter' ? 'content-filter' : 'unknown';
}

function integer(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
