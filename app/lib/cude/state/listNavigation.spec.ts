/**
 * Cude.new - list filtering and keyboard navigation.
 *
 * Small arithmetic, easy to get subtly wrong, and wrong in a way nobody notices
 * until they try to pick a model without touching the mouse.
 */

import { describe, it, expect } from 'vitest';
import { filterOptions, nextIndex, preserveFocus, type Option } from './listNavigation';

const MODELS: Option[] = [
  { value: 'claude-opus-5', label: 'Claude Opus 5', detail: 'Anthropic' },
  { value: 'claude-sonnet-5', label: 'Claude Sonnet 5', detail: 'Anthropic' },
  { value: 'gpt-5.6', label: 'GPT-5.6', detail: 'OpenAI' },
  { value: 'llama-3', label: 'Llama 3', detail: 'Ollama · local' },
];

describe('filtering', () => {
  it('returns everything for an empty query', () => {
    expect(filterOptions(MODELS, '')).toHaveLength(4);
  });

  it('ignores a query of only spaces', () => {
    expect(filterOptions(MODELS, '   ')).toHaveLength(4);
  });

  it('matches on the label', () => {
    expect(filterOptions(MODELS, 'sonnet').map((option) => option.value)).toEqual(['claude-sonnet-5']);
  });

  it('matches on the detail, so a provider name finds its models', () => {
    expect(filterOptions(MODELS, 'anthropic')).toHaveLength(2);
  });

  it('matches every term, in any order', () => {
    expect(filterOptions(MODELS, 'opus claude').map((option) => option.value)).toEqual(['claude-opus-5']);
  });

  it('is case-insensitive', () => {
    expect(filterOptions(MODELS, 'GPT')).toHaveLength(1);
  });

  it('matches on the value for people who know the model id', () => {
    expect(filterOptions(MODELS, 'gpt-5.6')).toHaveLength(1);
  });

  it('returns nothing when no option matches every term', () => {
    expect(filterOptions(MODELS, 'claude openai')).toHaveLength(0);
  });
});

describe('moving the focus', () => {
  it('steps forward', () => {
    expect(nextIndex(0, 4, 'ArrowDown')).toBe(1);
  });

  it('wraps to the top from the last option', () => {
    expect(nextIndex(3, 4, 'ArrowDown')).toBe(0);
  });

  it('wraps to the bottom from the first option', () => {
    expect(nextIndex(0, 4, 'ArrowUp')).toBe(3);
  });

  it('enters the list from nothing focused', () => {
    expect(nextIndex(-1, 4, 'ArrowDown')).toBe(0);
    expect(nextIndex(-1, 4, 'ArrowUp')).toBe(3);
  });

  it('jumps to either end', () => {
    expect(nextIndex(2, 4, 'Home')).toBe(0);
    expect(nextIndex(1, 4, 'End')).toBe(3);
  });

  it('focuses nothing in an empty list', () => {
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End'] as const) {
      expect(nextIndex(0, 0, key)).toBe(-1);
    }
  });
});

describe('keeping the focus on the same option', () => {
  it('follows an option that moved position', () => {
    const filtered = filterOptions(MODELS, 'claude');

    expect(preserveFocus(filtered, 'claude-sonnet-5')).toBe(1);
  });

  it('falls back to the first option when the focused one filtered out', () => {
    const filtered = filterOptions(MODELS, 'claude');

    expect(preserveFocus(filtered, 'gpt-5.6')).toBe(0);
  });

  it('focuses nothing when nothing matched', () => {
    expect(preserveFocus([], 'anything')).toBe(-1);
  });

  it('starts at the first option when nothing was focused', () => {
    expect(preserveFocus(MODELS, undefined)).toBe(0);
  });
});
