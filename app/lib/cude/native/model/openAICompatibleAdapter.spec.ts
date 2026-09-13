import { describe, expect, it, vi } from 'vitest';
import type { ModelRequest, ModelStreamEvent } from './contracts';
import { ModelGateway } from './gateway';
import { OpenAICompatibleAdapter } from './openAICompatibleAdapter';

const request: ModelRequest = {
  requestId: 'native-build-1',
  target: { providerId: 'openai-compatible', modelId: 'local-coder' },
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Create the app.' }] }],
  temperature: 0.2,
};

async function collect(events: AsyncIterable<ModelStreamEvent>) {
  const collected: ModelStreamEvent[] = [];

  for await (const event of events) {
    collected.push(event);
  }

  return collected;
}

describe('OpenAI-compatible native adapter', () => {
  it('maps a provider response into the Cude event contract without exposing the API key', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"files":[]}' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 12, completion_tokens: 4 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const gateway = new ModelGateway([
      new OpenAICompatibleAdapter({
        endpoint: 'http://localhost:11434/v1/chat/completions',
        apiKey: 'secret',
        fetcher,
      }),
    ]);
    const events = await collect(gateway.openStream(request).events);

    expect(events.map((event) => event.type)).toEqual(['started', 'text-delta', 'usage', 'completed']);
    expect(events[1]).toMatchObject({ type: 'text-delta', text: '{"files":[]}' });
    expect(events[2]).toMatchObject({ type: 'usage', usage: { inputTokens: 12, outputTokens: 4 } });

    const [, init] = fetcher.mock.calls[0];
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer secret');
    expect(JSON.stringify(events)).not.toContain('secret');
  });

  it('normalizes endpoint errors through the gateway', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('busy', { status: 503 }));
    const gateway = new ModelGateway([
      new OpenAICompatibleAdapter({ endpoint: 'https://models.example/v1/chat/completions', fetcher }),
    ]);
    const events = await collect(gateway.openStream(request).events);

    expect(events.at(-1)).toMatchObject({
      type: 'failed',
      error: { code: 'provider-unavailable', status: 503, retryable: true },
    });
  });
});
