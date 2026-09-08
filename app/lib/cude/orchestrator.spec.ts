import { describe, expect, it } from 'vitest';
import { isDesignReviewSkipped } from './orchestrator';

describe('isDesignReviewSkipped', () => {
  it.each([
    'skip the design review and build it now',
    'bypass design review',
    'build without a design review',
    'Design review: skip it',
  ])('recognises explicit opt-out: %s', (prompt) => {
    expect(isDesignReviewSkipped(prompt)).toBe(true);
  });

  it.each(['create a polished dashboard', 'review the design before building'])('keeps the gate for: %s', (prompt) => {
    expect(isDesignReviewSkipped(prompt)).toBe(false);
  });
});
