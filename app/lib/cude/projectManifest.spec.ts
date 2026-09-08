/**
 * Cude.new - manifest secret stripping.
 *
 * `stripSecrets` runs on every save and every export, so its key pattern
 * decides what survives persistence. It has to remove credentials without
 * removing product data — and it previously failed the second half: the key
 * pattern matched a trailing plural, so `tokens` looked like a credential and
 * the design system was silently deleted from every project that was saved.
 */

import { describe, it, expect } from 'vitest';
import { stripSecrets } from './projectManifest';

describe('stripSecrets', () => {
  it('removes credential-shaped keys', () => {
    const cleaned = stripSecrets({
      apiKey: 'x',
      api_key: 'x',
      secret: 'x',
      secrets: 'x',
      token: 'x',
      access_token: 'x',
      'refresh-token': 'x',
      password: 'x',
      credentials: 'x',
      privateKey: 'x',
      sessionId: 'x',
      bearer: 'x',
      keep: 'kept',
    }) as Record<string, unknown>;

    expect(Object.keys(cleaned)).toEqual(['keep']);
  });

  it('keeps design tokens, which are product data and not credentials', () => {
    /*
     * Regression: a plural `tokens` key was treated as a credential, so every
     * saved project lost its design system.
     */
    const design = {
      name: 'Cude Mono',
      tokens: {
        color: { primary: '#101010', surface: '#FFFFFF' },
        spacing: { md: '12px' },
      },
    };

    const cleaned = stripSecrets(design) as typeof design;

    expect(cleaned.tokens).toBeDefined();
    expect(cleaned.tokens.color.primary).toBe('#101010');
    expect(cleaned.tokens.spacing.md).toBe('12px');
  });

  it('keeps other product keys that merely contain a credential word', () => {
    const cleaned = stripSecrets({
      designTokens: { a: 1 },
      tokenizer: 'gpt',
      passwordPolicy: { minLength: 12 },
    }) as Record<string, unknown>;

    expect(Object.keys(cleaned).sort()).toEqual(['designTokens', 'passwordPolicy', 'tokenizer']);
  });

  it('removes credential-shaped values whatever the key is called', () => {
    const cleaned = stripSecrets({
      note: 'my key is sk-abcdefghijklmnopqrstuvwxyz123456',
      harmless: 'just text',
    }) as Record<string, unknown>;

    expect(cleaned.note).toBeUndefined();
    expect(cleaned.harmless).toBe('just text');
  });

  it('recurses through arrays and nested objects', () => {
    const cleaned = stripSecrets({
      targets: [{ platform: 'web', apiKey: 'x' }, { platform: 'android' }],
      nested: { deep: { token: 'x', kept: 1 } },
    }) as { targets: Array<Record<string, unknown>>; nested: { deep: Record<string, unknown> } };

    expect(cleaned.targets[0]).toEqual({ platform: 'web' });
    expect(cleaned.targets[1]).toEqual({ platform: 'android' });
    expect(cleaned.nested.deep).toEqual({ kept: 1 });
  });

  it('leaves primitives and null alone', () => {
    expect(stripSecrets('text')).toBe('text');
    expect(stripSecrets(42)).toBe(42);
    expect(stripSecrets(null)).toBeNull();
  });
});
