import { describe, expect, it } from 'vitest';
import type { ModelAdapter, ModelRequest, ModelStreamEvent } from './contracts';
import { ModelGatewayError, normalizeModelError } from './errors';
import { ModelGateway } from './gateway';
import { InMemoryModelAdapter } from './inMemoryAdapter';

const request: ModelRequest = {
  requestId: 'request-1',
  target: { providerId: 'memory', modelId: 'test-model' },
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Build a field app.' }] }],
};

async function collect(stream: AsyncIterable<ModelStreamEvent>): Promise<ModelStreamEvent[]> {
  const events: ModelStreamEvent[] = [];

  for await (const event of stream) {
    events.push(event);
  }

  return events;
}

describe('Cude native model gateway', () => {
  it('streams provider-neutral events with stable lifecycle metadata', async () => {
    const adapter = new InMemoryModelAdapter('memory', [
      {
        events: [
          { type: 'text-delta', text: 'Hello' },
          { type: 'tool-call', callId: 'call-1', name: 'write_file', arguments: { path: 'README.md' } },
          { type: 'usage', usage: { inputTokens: 8, outputTokens: 2, cachedInputTokens: 3 } },
          { type: 'completed', finishReason: 'tool-call' },
        ],
      },
    ]);
    const events = await collect(new ModelGateway([adapter]).openStream(request).events);

    expect(events.map((event) => event.type)).toEqual(['started', 'text-delta', 'tool-call', 'usage', 'completed']);
    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5]);
    expect(events.every((event) => event.requestId === request.requestId)).toBe(true);
    expect(adapter.requests).toEqual([request]);
  });

  it('adds a safe completion when an adapter ends without one', async () => {
    const adapter = new InMemoryModelAdapter('memory', [{ events: [{ type: 'text-delta', text: 'Done' }] }]);
    const events = await collect(new ModelGateway([adapter]).openStream(request).events);

    expect(events.at(-1)).toMatchObject({ type: 'completed', finishReason: 'unknown', sequence: 3 });
  });

  it('normalizes adapter failures into a terminal failed event', async () => {
    const providerError = Object.assign(new Error('Service is overloaded'), { status: 503 });
    const adapter = new InMemoryModelAdapter('memory', [{ error: providerError }]);
    const events = await collect(new ModelGateway([adapter]).openStream(request).events);

    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      type: 'failed',
      error: { code: 'provider-unavailable', retryable: true, providerId: 'memory', status: 503 },
    });
  });

  it('cancels an active request and reports cancellation consistently', async () => {
    let release: (() => void) | undefined;
    const adapter: ModelAdapter = {
      providerId: 'memory',
      async *stream(_request, { signal }) {
        yield { type: 'text-delta', text: 'partial' };
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        signal.throwIfAborted();
      },
    };
    const stream = new ModelGateway([adapter]).openStream(request);
    const iterator = stream.events[Symbol.asyncIterator]();

    expect((await iterator.next()).value).toMatchObject({ type: 'started' });
    expect((await iterator.next()).value).toMatchObject({ type: 'text-delta', text: 'partial' });

    const pending = iterator.next();
    stream.cancel('user stopped');
    release?.();

    expect((await pending).value).toMatchObject({ type: 'failed', error: { code: 'cancelled', retryable: false } });
    expect(stream.signal.aborted).toBe(true);
  });

  it('honors an already-aborted external signal without invoking the adapter', async () => {
    const adapter = new InMemoryModelAdapter('memory');
    const controller = new AbortController();
    controller.abort();

    const events = await collect(new ModelGateway([adapter]).openStream(request, { signal: controller.signal }).events);

    expect(events.map((event) => event.type)).toEqual(['started', 'failed']);
    expect(events[1]).toMatchObject({ type: 'failed', error: { code: 'cancelled' } });
    expect(adapter.requests).toEqual([]);
  });

  it('rejects invalid requests and duplicate or missing providers', () => {
    const gateway = new ModelGateway([new InMemoryModelAdapter('memory')]);

    expect(() => gateway.register(new InMemoryModelAdapter('memory'))).toThrow(/already registered/i);
    expect(() => gateway.openStream({ ...request, messages: [] })).toThrow(/non-empty message/i);
    expect(() => gateway.openStream({ ...request, target: { providerId: 'missing', modelId: 'x' } })).toThrow(
      /not registered/i,
    );
  });

  it('rejects malformed adapter events as normalized failures', async () => {
    const adapter = new InMemoryModelAdapter('memory', [
      { events: [{ type: 'usage', usage: { inputTokens: -1, outputTokens: 2 } }] },
    ]);
    const events = await collect(new ModelGateway([adapter]).openStream(request).events);

    expect(events.at(-1)).toMatchObject({ type: 'failed', error: { code: 'invalid-request' } });
  });

  it('never exposes more than one terminal event', async () => {
    const adapter = new InMemoryModelAdapter('memory', [
      {
        events: [
          { type: 'completed', finishReason: 'stop' },
          { type: 'text-delta', text: 'too late' },
        ],
      },
    ]);
    const events = await collect(new ModelGateway([adapter]).openStream(request).events);

    expect(events.map((event) => event.type)).toEqual(['started', 'failed']);
    expect(events.at(-1)).toMatchObject({ type: 'failed', error: { code: 'invalid-request' } });
  });
});

describe('model error normalization', () => {
  it.each([
    [401, 'authentication', false],
    [402, 'quota', false],
    [403, 'permission', false],
    [404, 'model-unavailable', false],
    [408, 'timeout', true],
    [429, 'rate-limit', true],
    [500, 'provider-unavailable', true],
  ] as const)('maps HTTP %i to %s', (status, code, retryable) => {
    const normalized = normalizeModelError(Object.assign(new Error('provider error'), { status }));
    expect(normalized).toMatchObject({ code, retryable, status });
  });

  it('preserves explicit gateway errors and safely handles unknown values', () => {
    expect(
      normalizeModelError(new ModelGatewayError('quota', 'Credits exhausted', { retryable: false })),
    ).toMatchObject({
      code: 'quota',
      message: 'Credits exhausted',
      retryable: false,
    });
    expect(normalizeModelError(null)).toMatchObject({ code: 'unknown', retryable: false });
    expect(normalizeModelError(new TypeError('fetch failed'))).toMatchObject({ code: 'network', retryable: true });
  });
});
