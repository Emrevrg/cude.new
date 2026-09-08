/**
 * Cude.new — what a conversation is called.
 *
 * Every user message opens with [Model:] and [Provider:] protocol lines, and
 * the title used to be the first non-empty line — the header. So the page
 * title, the sidebar entry and the URL all read "[Model: gpt-5.6]" instead of
 * what was actually asked for.
 */

import { describe, expect, it } from 'vitest';
import { deriveDescription } from './useConversationHistory';

const user = (content: string) => ({ role: 'user', content }) as never;

describe('deriveDescription', () => {
  it('names what was asked for, not which model was asked', () => {
    expect(deriveDescription([user('[Model: gpt-5.6]\n\n[Provider: OpenAI]\n\nbuild a todo app')])).toBe(
      'build a todo app',
    );
  });

  it('skips blank lines before the real text', () => {
    expect(deriveDescription([user('\n\n  \nbuild a todo app')])).toBe('build a todo app');
  });

  it('caps a long ask', () => {
    expect(deriveDescription([user(`[Model: x]\n${'a'.repeat(200)}`)])?.length).toBeLessThanOrEqual(80);
  });

  it('returns nothing when there is nothing to name', () => {
    expect(deriveDescription([])).toBeUndefined();
    expect(deriveDescription([user('[Model: x]\n[Provider: y]')])).toBeUndefined();
  });
});
