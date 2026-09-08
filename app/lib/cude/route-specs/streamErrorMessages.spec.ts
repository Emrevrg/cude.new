/**
 * Cude.new — what a person is told when a provider refuses.
 *
 * The string these produce is the whole of what reaches the conversation, so
 * advice that cannot work is worse than none. "Request failed — try again" was
 * shown for a key with no credit: the request would have failed identically
 * every time, and nothing on screen said why.
 *
 * Each of these was seen live against a real provider.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../../routes/api.chat.ts', import.meta.url), 'utf8');

/** The text of the branch handling one provider status. */
function branchFor(status: number): string {
  const start = source.indexOf(`if (status === ${status})`);

  return start === -1 ? '' : source.slice(start, start + 400);
}

describe('a provider status, said plainly', () => {
  it('names the model when the account cannot reach it', () => {
    // NVIDIA answers 404 for a model the account is not entitled to.
    const branch = branchFor(404);

    expect(branch).toContain('chosenModel');
    expect(branch).toMatch(/pick another model/i);
  });

  it('says a model has been retired rather than merely missing', () => {
    // NVIDIA answers 410 for a model it has withdrawn.
    expect(branchFor(410)).toMatch(/retired/i);
  });

  it('does not tell somebody with no credit to try again', () => {
    /*
     * OpenRouter answers 402 when the key has no funds for the chosen model.
     * Trying again is the one thing that cannot work, and it was the advice
     * given.
     */
    const branch = branchFor(402);

    expect(branch, '402 has no branch and falls through to the generic message').not.toBe('');
    expect(branch).toMatch(/credit/i);
    expect(branch).toMatch(/free model/i);
    expect(branch).toMatch(/will not help/i);
  });

  it('covers every status a provider was actually seen to return', () => {
    for (const status of [402, 404, 410]) {
      expect(branchFor(status), `${status} has no branch`).not.toBe('');
    }
  });
});
