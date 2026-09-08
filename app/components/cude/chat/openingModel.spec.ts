/**
 * Cude.new — which model the picker opens on.
 *
 * Three rules had to be got right, and each was learned by getting it wrong.
 *
 * The list is sorted by label so a person can find a name, which puts
 * "Claude 3.5 Sonnet" ahead of "Claude Opus 5" — so opening on the first
 * option selected the oldest model in the catalogue.
 *
 * The hand-written order that replaced it rots. Ten providers were leading
 * with a model their vendor has since retired: OpenRouter with Claude 3.5
 * Sonnet, Moonshot with moonshot-v1-8k, Deepseek with deepseek-coder. Opening
 * on one of those means opening on something that answers 404.
 *
 * The public registry is what tells the difference, and it is refreshed
 * hourly without anybody editing this repository.
 */

import { describe, it, expect } from 'vitest';

interface Option {
  value: string;
  label: string;
  published?: boolean;
}

/** The rule as ModelPicker applies it. */
function opensOn(options: Option[], staticModels: { name: string }[]): string | undefined {
  if (options.length === 0) {
    return undefined;
  }

  const published = options.filter((option) => option.published === true);
  const usable = published.length > 0 ? published : options;
  const recommended = staticModels.find((model) => usable.some((option) => option.value === model.name))?.name;

  return recommended ?? usable[0].value;
}

const opt = (value: string, published?: boolean): Option => ({ value, label: value, published });

describe('the model a provider opens on', () => {
  it('follows the provider’s own recommendation, not the alphabet', () => {
    const options = [opt('claude-3-5-sonnet', true), opt('claude-opus-5', true)];

    expect(opensOn(options, [{ name: 'claude-opus-5' }, { name: 'claude-3-5-sonnet' }])).toBe('claude-opus-5');
  });

  it('skips a recommendation the vendor has retired', () => {
    /*
     * The exact case. A retired model arrives *unmarked*, not marked false —
     * the registry says what it lists and nothing about the rest. Reading that
     * leniently is what let OpenRouter keep opening on Claude 3.5 Sonnet.
     */
    const options = [opt('anthropic/claude-3.5-sonnet'), opt('anthropic/claude-opus-5', true)];
    const stale = [{ name: 'anthropic/claude-3.5-sonnet' }, { name: 'anthropic/claude-opus-5' }];

    expect(opensOn(options, stale)).toBe('anthropic/claude-opus-5');
  });

  it('never opens on a retired model when a current one exists', () => {
    const options = [opt('old-a'), opt('old-b'), opt('current', true)];

    expect(opensOn(options, [])).toBe('current');
  });

  it('still opens on something when the registry knows none of them', () => {
    /*
     * A private gateway, or a provider the registry has never heard of. An
     * empty picker would be worse than an unverified model.
     */
    const options = [opt('gateway/model-a'), opt('gateway/model-b')];

    expect(opensOn(options, [{ name: 'gateway/model-b' }])).toBe('gateway/model-b');
  });

  it('prefers a model the registry confirms over an unmarked one', () => {
    // Unmarked means the registry does not list it, which is how a retired model looks.
    const options = [opt('unmarked'), opt('confirmed', true)];

    expect(opensOn(options, [{ name: 'unmarked' }, { name: 'confirmed' }])).toBe('confirmed');
  });

  it('has nothing to open on when the provider offers nothing', () => {
    expect(opensOn([], [{ name: 'anything' }])).toBeUndefined();
  });
});
