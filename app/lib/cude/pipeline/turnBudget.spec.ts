/**
 * Cude.new — what one turn is allowed to write, and what it leaves behind.
 *
 * Two failures that looked like one. Reading a model's real completion limit
 * from the registry was right; asking for all of it was not. Kimi K3 accepts
 * 131072, and requesting that meant NVIDIA took so long to begin streaming
 * that the request hit the stream timeout — so the turn ended with every file
 * of the project created and empty, opened by the artifact and never filled.
 *
 * A project of empty files reads as a finished build that produced nothing,
 * which is worse than no files at all.
 */

import { describe, it, expect } from 'vitest';
import { TURN_COMPLETION_CEILING } from '~/lib/.server/llm/stream-text';

describe('the completion budget for one turn', () => {
  it('is smaller than what a long-context model would allow', () => {
    // Kimi K3's own limit, which is what stalled the stream.
    expect(TURN_COMPLETION_CEILING).toBeLessThan(131072);
  });

  it('is large enough for a whole small project', () => {
    /*
     * The complete responses measured here — four files plus the explanation —
     * came in under 5000 completion tokens. This leaves several times that.
     */
    expect(TURN_COMPLETION_CEILING).toBeGreaterThanOrEqual(16384);
  });
});
