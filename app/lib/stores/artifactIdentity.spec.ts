/**
 * Cude.new — two responses are two artifacts, whatever they call themselves.
 *
 * An artifact's id is chosen by the model, and the model reuses it. Asked to
 * change the timer it had just built, it opened a second artifact called
 * `pomodoro-timer` — the same name as the first.
 *
 * Keyed on that name alone, `addArtifact` found one already there and returned
 * without creating anything, so the new turn's actions were queued onto the
 * finished runner from the previous turn. Action "0" was already complete, and
 * a completed action is skipped as a re-run: every file write in the follow-up
 * was silently dropped.
 *
 * What the person saw was a detailed description of the change, a green tick,
 * and a file nobody had touched.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/** The rule the workbench applies. */
const artifactKey = (messageId: string, id: string) => `${messageId.length}:${messageId}::${id}`;

describe('identifying an artifact', () => {
  it('separates two turns that chose the same name', () => {
    expect(artifactKey('msg-1', 'pomodoro-timer')).not.toBe(artifactKey('msg-2', 'pomodoro-timer'));
  });

  it('keeps one turn talking about its own artifact', () => {
    expect(artifactKey('msg-1', 'pomodoro-timer')).toBe(artifactKey('msg-1', 'pomodoro-timer'));
  });

  it('separates two artifacts within one turn', () => {
    expect(artifactKey('msg-1', 'app')).not.toBe(artifactKey('msg-1', 'server'));
  });

  it('cannot be collided by an id that contains the separator', () => {
    /*
     * Ids come from the model, so they are input. Without this, a model could
     * name an artifact `b::c` and land on another message's key.
     */
    expect(artifactKey('a::b', 'c')).not.toBe(artifactKey('a', 'b::c'));
  });
});

describe('every place that looks an artifact up', () => {
  /*
   * A source check: the failure was silence. The lookup missed, the action was
   * skipped as already-complete, and nothing anywhere reported a problem.
   */
  const source = readFileSync(new URL('./workbench.ts', import.meta.url), 'utf8');

  it('goes through the one helper', () => {
    // A raw `#getArtifact(artifactId)` is the bug.
    expect(source).not.toMatch(/#getArtifact\(\s*artifactId\s*\)/);
    expect(source).not.toMatch(/#getArtifact\(\s*id\s*\)/);
  });

  it('is given the message as well as the id', () => {
    expect(source).toMatch(/artifactKey\(messageId, artifactId\)/);
    expect(source).toMatch(/artifactKey\(messageId, id\)/);
  });
});
