/**
 * Cude.new — the names a person reads in the model picker.
 *
 * A provider's /models endpoint returns an id and nothing else, so the label
 * has to be derived from it. Splitting on dashes alone left the slash inside a
 * token and fused the vendor into the model: "Deepseek Ai/deepseek Coder 6.7b
 * Instruct". Fifty-two of NVIDIA's hundred and twenty models read like that,
 * which is the first thing anybody sees when they open the picker.
 */

import { describe, it, expect } from 'vitest';
import { humanizeModelId } from './openai-compatible-models';

describe('a model id turned into a label', () => {
  it('separates the vendor from the model', () => {
    expect(humanizeModelId('google/gemma-2b')).toBe('Google Gemma 2B');
    expect(humanizeModelId('ibm/granite-34b-code-instruct')).toBe('IBM Granite 34B Code Instruct');
  });

  it('does not name the maker twice', () => {
    // `deepseek-ai/deepseek-coder` would otherwise read "DeepSeek AI DeepSeek Coder".
    expect(humanizeModelId('deepseek-ai/deepseek-coder-6.7b-instruct')).toBe('DeepSeek Coder 6.7B Instruct');
    expect(humanizeModelId('mistralai/mistral-large-2-instruct')).toBe('Mistral Large 2 Instruct');
  });

  it('keeps the capitals a name is published with', () => {
    expect(humanizeModelId('meta/codellama-70b')).toBe('Meta CodeLlama 70B');
    expect(humanizeModelId('bigcode/starcoder2-15b')).toBe('BigCode StarCoder2 15B');
    expect(humanizeModelId('microsoft/phi-3.5-moe-instruct')).toBe('Microsoft Phi 3.5 MoE Instruct');
  });

  it('uppercases initialisms rather than title-casing them', () => {
    expect(humanizeModelId('databricks/dbrx-instruct')).toBe('Databricks DBRX Instruct');
    expect(humanizeModelId('nvidia/llama-3.1-nemotron-70b-instruct')).toBe('NVIDIA Llama 3.1 Nemotron 70B Instruct');
  });

  it('reads sizes and context windows the way they are written', () => {
    // "70b" and "128k" are never lowercase in a published model name.
    expect(humanizeModelId('adept/fuyu-8b')).toBe('Adept Fuyu 8B');
    expect(humanizeModelId('microsoft/phi-3-vision-128k-instruct')).toBe('Microsoft Phi 3 Vision 128K Instruct');
    expect(humanizeModelId('ibm/granite-3.0-3b-a800m-instruct')).toBe('IBM Granite 3.0 3B A800M Instruct');
  });

  it('leaves a version suffix lowercase', () => {
    expect(humanizeModelId('mistralai/codestral-22b-instruct-v0.1')).toBe('Mistral AI Codestral 22B Instruct v0.1');
  });

  it('handles a name whose dashes are part of it', () => {
    // Split naively, `01-ai` becomes "01.AI AI".
    expect(humanizeModelId('01-ai/yi-large')).toBe('01.AI Yi Large');
  });

  it('works without a vendor prefix', () => {
    expect(humanizeModelId('gpt-4o-mini')).toBe('GPT 4o Mini');
    expect(humanizeModelId('kimi-k3')).toBe('Kimi K3');
  });

  it('never leaves a slash or a dash in what a person reads', () => {
    const ids = [
      '01-ai/yi-large',
      'deepseek-ai/deepseek-coder-6.7b-instruct',
      'google/diffusiongemma-26b-a4b-it',
      'moonshotai/kimi-k3',
      'meta/llama2-70b',
    ];

    for (const id of ids) {
      expect(humanizeModelId(id), id).not.toMatch(/[/_]/);
    }
  });
});
