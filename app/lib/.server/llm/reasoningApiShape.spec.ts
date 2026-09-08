/**
 * Cude.new — which API shape a request goes out in.
 *
 * "Does this model reason" and "does this endpoint want OpenAI's reasoning
 * parameters" are different questions, and answering the second with the first
 * broke every reasoning model outside OpenAI.
 *
 * NVIDIA's Kimi K3 is the case. The registry correctly reports that it
 * reasons; that turned on a branch which sent `maxCompletionTokens` — not an
 * option the AI SDK has, so it was dropped — stripped `temperature` and the
 * sampling parameters, and forced `temperature: 1`. The request went out with
 * no token limit and came back with sixty-four tokens and no answer, while the
 * conversation reported "Response Generated".
 */

import { describe, it, expect } from 'vitest';
import { isReasoningModel } from './constants';

/** The rule as stream-text and api.llmcall both apply it. */
function usesOpenAiReasoningApi(providerName: string, modelName: string): boolean {
  return (providerName === 'OpenAI' || providerName === 'Azure OpenAI') && isReasoningModel(modelName);
}

describe('shaping a request for OpenAI reasoning endpoints', () => {
  it('applies to OpenAI reasoning models', () => {
    expect(usesOpenAiReasoningApi('OpenAI', 'o1')).toBe(true);
    expect(usesOpenAiReasoningApi('OpenAI', 'o3-mini')).toBe(true);
    expect(usesOpenAiReasoningApi('Azure OpenAI', 'gpt-5')).toBe(true);
  });

  it('does not apply to a reasoning model served by somebody else', () => {
    // The one that broke: correctly known to reason, wrong API shape.
    expect(usesOpenAiReasoningApi('NVIDIA', 'moonshotai/kimi-k3')).toBe(false);
    expect(usesOpenAiReasoningApi('OpenRouter', 'openai/o1')).toBe(false);
    expect(usesOpenAiReasoningApi('Groq', 'deepseek-r1-distill-llama-70b')).toBe(false);
  });

  it('does not apply to an ordinary OpenAI model', () => {
    expect(usesOpenAiReasoningApi('OpenAI', 'gpt-4o')).toBe(false);
  });

  it('guesses from the name only as a fallback, and says nothing about Kimi', () => {
    /*
     * Kept honest on purpose: the name carries no signal that this model
     * reasons. What it is comes from the registry, on ModelInfo.reasoning;
     * this regex only covers OpenAI's own naming.
     */
    expect(isReasoningModel('moonshotai/kimi-k3')).toBe(false);
    expect(isReasoningModel('o1-preview')).toBe(true);
  });
});
