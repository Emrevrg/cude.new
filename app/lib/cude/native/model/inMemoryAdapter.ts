import type { ModelAdapter, ModelAdapterContext, ModelAdapterEvent, ModelRequest } from './contracts';

export interface InMemoryResponse {
  readonly events?: readonly ModelAdapterEvent[];
  readonly error?: unknown;
}

/** Deterministic adapter for domain tests, demos and offline development. */
export class InMemoryModelAdapter implements ModelAdapter {
  readonly providerId: string;
  readonly requests: ModelRequest[] = [];
  readonly #responses: InMemoryResponse[];

  constructor(providerId: string, responses: readonly InMemoryResponse[] = []) {
    this.providerId = providerId;
    this.#responses = [...responses];
  }

  enqueue(response: InMemoryResponse): void {
    this.#responses.push(response);
  }

  async *stream(request: ModelRequest, context: ModelAdapterContext): AsyncIterable<ModelAdapterEvent> {
    this.requests.push(request);

    const response = this.#responses.shift() ?? { events: [] };

    for (const event of response.events ?? []) {
      assertActive(context.signal);
      yield event;
      await Promise.resolve();
    }

    if (response.error !== undefined) {
      throw response.error;
    }
  }
}

function assertActive(signal: AbortSignal): void {
  if (!signal.aborted) {
    return;
  }

  throw new DOMException('The operation was aborted.', 'AbortError');
}
