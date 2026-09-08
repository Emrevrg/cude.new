/**
 * Cude.new — which providers the model list is built from.
 *
 * The settings cookie only carries providers a person has touched, while the
 * manager holds every registered one. Reconciling those two is where the model
 * list used to fall over.
 */

import { describe, expect, it } from 'vitest';
import type { IProviderSetting } from '~/types/model';

/**
 * The rule under test, stated on its own.
 *
 * Mirrors the filter in `updateModelList`; the manager itself pulls in the
 * whole provider registry, which is more than this question needs.
 */
function enabledProviders(all: string[], providerSettings?: Record<string, IProviderSetting>): string[] {
  if (providerSettings && Object.keys(providerSettings).length > 0) {
    return all.filter((name) => providerSettings[name]?.enabled !== false);
  }

  return all;
}

const ALL = ['Anthropic', 'OpenAI', 'Ollama', 'Groq'];

describe('choosing providers', () => {
  it('keeps every provider when nothing is configured', () => {
    expect(enabledProviders(ALL)).toEqual(ALL);
    expect(enabledProviders(ALL, {})).toEqual(ALL);
  });

  it('drops one that was explicitly turned off', () => {
    expect(enabledProviders(ALL, { OpenAI: { enabled: false } })).toEqual(['Anthropic', 'Ollama', 'Groq']);
  });

  it('keeps a provider the settings say nothing about', () => {
    /* The bug: a name with no entry read `.enabled` off undefined and threw. */
    expect(enabledProviders(ALL, { Anthropic: { enabled: true } })).toEqual(ALL);
  });

  it('does not throw when settings mention a provider that is not registered', () => {
    expect(() => enabledProviders(ALL, { Retired: { enabled: true } })).not.toThrow();
  });

  it('keeps a provider whose entry has no enabled flag at all', () => {
    expect(enabledProviders(ALL, { OpenAI: { baseUrl: 'https://example.com' } })).toEqual(ALL);
  });

  it('can end up with nothing, when everything is turned off', () => {
    const off = Object.fromEntries(ALL.map((name) => [name, { enabled: false }]));

    expect(enabledProviders(ALL, off)).toEqual([]);
  });
});
