import type { ModelAdapter, ModelAdapterEvent, ModelRequest, ModelStream, ModelStreamEvent } from './contracts';
import { ModelGatewayError, normalizeModelError } from './errors';

export class ModelGateway {
  readonly #adapters = new Map<string, ModelAdapter>();

  constructor(adapters: readonly ModelAdapter[] = []) {
    for (const adapter of adapters) {
      this.register(adapter);
    }
  }

  register(adapter: ModelAdapter): void {
    const providerId = adapter.providerId.trim();

    if (!providerId || providerId !== adapter.providerId) {
      throw new ModelGatewayError('invalid-request', 'A model adapter requires a normalized provider id.');
    }

    if (this.#adapters.has(providerId)) {
      throw new ModelGatewayError('invalid-request', `Provider "${providerId}" is already registered.`);
    }

    this.#adapters.set(providerId, adapter);
  }

  hasProvider(providerId: string): boolean {
    return this.#adapters.has(providerId);
  }

  openStream(request: ModelRequest, options: { readonly signal?: AbortSignal } = {}): ModelStream {
    validateRequest(request);

    const adapter = this.#adapters.get(request.target.providerId);

    if (!adapter) {
      throw new ModelGatewayError(
        'provider-unavailable',
        `Provider "${request.target.providerId}" is not registered.`,
        {
          providerId: request.target.providerId,
        },
      );
    }

    const controller = new AbortController();
    const detachExternalSignal = forwardAbort(options.signal, controller);
    const events = consumeAdapter(adapter, request, controller.signal, detachExternalSignal);

    return {
      events,
      signal: controller.signal,
      cancel: (reason?: unknown) => controller.abort(reason),
    };
  }
}

async function* consumeAdapter(
  adapter: ModelAdapter,
  request: ModelRequest,
  signal: AbortSignal,
  cleanup: () => void,
): AsyncIterable<ModelStreamEvent> {
  let sequence = 1;
  let completion: Extract<ModelAdapterEvent, { readonly type: 'completed' }> | undefined;

  try {
    yield { type: 'started', requestId: request.requestId, sequence: sequence++, target: request.target };
    throwIfAborted(signal);

    for await (const event of adapter.stream(request, { signal })) {
      throwIfAborted(signal);

      if (completion) {
        throw new ModelGatewayError('invalid-request', 'The model adapter emitted an event after completion.', {
          providerId: adapter.providerId,
        });
      }

      validateAdapterEvent(event, adapter.providerId);

      if (event.type === 'completed') {
        completion = event;
      } else {
        yield { ...event, requestId: request.requestId, sequence: sequence++ };
      }
    }

    yield completion
      ? { ...completion, requestId: request.requestId, sequence }
      : { type: 'completed', requestId: request.requestId, sequence, finishReason: 'unknown' };
  } catch (error) {
    yield {
      type: 'failed',
      requestId: request.requestId,
      sequence,
      error: normalizeModelError(error, { providerId: adapter.providerId, signal }),
    };
  } finally {
    cleanup();
  }
}

function validateRequest(request: ModelRequest): void {
  if (!request.requestId.trim()) {
    throw new ModelGatewayError('invalid-request', 'A model request requires a stable request id.');
  }

  if (!request.target.providerId.trim() || !request.target.modelId.trim()) {
    throw new ModelGatewayError('invalid-request', 'A model request requires provider and model ids.');
  }

  if (request.messages.length === 0 || request.messages.some((message) => message.content.length === 0)) {
    throw new ModelGatewayError('invalid-request', 'A model request requires at least one non-empty message.');
  }

  if (request.temperature !== undefined && (!Number.isFinite(request.temperature) || request.temperature < 0)) {
    throw new ModelGatewayError('invalid-request', 'Temperature must be a finite, non-negative number.');
  }

  if (
    request.maxOutputTokens !== undefined &&
    (!Number.isInteger(request.maxOutputTokens) || request.maxOutputTokens <= 0)
  ) {
    throw new ModelGatewayError('invalid-request', 'Maximum output tokens must be a positive integer.');
  }
}

function validateAdapterEvent(event: ModelAdapterEvent, providerId: string): void {
  if (event.type === 'text-delta' && event.text.length === 0) {
    throw new ModelGatewayError('invalid-request', 'A model adapter emitted an empty text delta.', { providerId });
  }

  if (event.type === 'usage') {
    const counts = [event.usage.inputTokens, event.usage.outputTokens, event.usage.cachedInputTokens ?? 0];

    if (counts.some((count) => !Number.isInteger(count) || count < 0)) {
      throw new ModelGatewayError('invalid-request', 'A model adapter emitted invalid token usage.', { providerId });
    }
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) {
    return;
  }

  if (typeof signal.throwIfAborted === 'function') {
    signal.throwIfAborted();
  }

  throw new DOMException('The operation was aborted.', 'AbortError');
}

function forwardAbort(externalSignal: AbortSignal | undefined, controller: AbortController): () => void {
  if (!externalSignal) {
    return () => undefined;
  }

  const forward = () => controller.abort(externalSignal.reason);

  if (externalSignal.aborted) {
    forward();
    return () => undefined;
  }

  externalSignal.addEventListener('abort', forward, { once: true });

  return () => externalSignal.removeEventListener('abort', forward);
}
