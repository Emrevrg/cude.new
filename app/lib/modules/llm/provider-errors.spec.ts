/**
 * Cude.new — what a provider failure tells the person.
 *
 * Found live: sending to NVIDIA with no key showed "NVIDIA is unavailable —
 * returned a server error, wait and retry", when the truth was that no key
 * was configured. Two faults stacked: the chat handler stamped every
 * unclassified failure with a 500 (which preempts the message heuristics),
 * and "No models found for provider X" matched no heuristic at all.
 */

import { describe, expect, it } from 'vitest';
import { normalizeProviderError } from './provider-errors';

describe('telling a missing setup from an outage', () => {
  it('reads a missing key as missing, not as an outage', () => {
    const normalized = normalizeProviderError(
      { message: 'Missing API key for NVIDIA. Add one in Settings.' },
      'NVIDIA',
    );

    expect(normalized.kind).toBe('missing_api_key');
    expect(normalized.retryable).toBe(false);
    expect(normalized.title).toContain('NVIDIA');
  });

  it('reads the chat route’s key wrapper the same way', () => {
    const normalized = normalizeProviderError(
      { message: 'Custom error: Invalid or missing API key. Please check your API key configuration.' },
      'NVIDIA',
    );

    expect(normalized.kind).toBe('missing_api_key');
  });

  it('reads a rejected key as rejected, not as missing', () => {
    const normalized = normalizeProviderError(
      { message: 'Custom error: Unauthorized. NVIDIA rejected the API key. Check the key and try again.' },
      'NVIDIA',
    );

    expect(normalized.kind).toBe('authentication');
  });

  it('reads an empty catalogue as unavailable rather than unknown', () => {
    const normalized = normalizeProviderError(
      { message: 'Custom error: No models found for provider NVIDIA' },
      'NVIDIA',
    );

    expect(normalized.kind).toBe('model_unavailable');
    expect(normalized.retryable).toBe(false);
  });

  it('still calls a real 500 a server error', () => {
    const normalized = normalizeProviderError({ message: 'boom', statusCode: 500 }, 'NVIDIA');

    expect(normalized.kind).toBe('server_error');
    expect(normalized.retryable).toBe(true);
  });

  it('reads a 402 as an empty wallet, not a rejected request', () => {
    /* Seen live: OpenRouter answers 402 when the key has no funds for the model. */
    const normalized = normalizeProviderError(
      { message: 'AI_APICallError: Payment Required', statusCode: 402 },
      'OpenRouter',
    );

    expect(normalized.kind).toBe('quota');
    expect(normalized.retryable).toBe(false);
  });

  it('does not invent a status where none was given', () => {
    const normalized = normalizeProviderError({ message: 'something strange happened' }, 'NVIDIA');

    expect(normalized.kind).toBe('unknown');
  });
});
