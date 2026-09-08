/**
 * Cude.new — the composer draft.
 *
 * One store, several writers: typing, dictation, the enhancer, a web-search
 * result, and the clear after a send. The thing worth holding is that they all
 * agree on what is in the box.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { clearComposer, composerText, prependToComposer, readComposerText, setComposerText } from './composer';

beforeEach(() => {
  clearComposer();
});

describe('holding the draft', () => {
  it('starts empty', () => {
    expect(readComposerText()).toBe('');
  });

  it('keeps what was typed', () => {
    setComposerText('build me a todo app');

    expect(readComposerText()).toBe('build me a todo app');
  });

  it('replaces rather than appends, so the enhancer can rewrite a draft', () => {
    setComposerText('first');
    setComposerText('second');

    expect(readComposerText()).toBe('second');
  });

  it('empties on clear', () => {
    setComposerText('something');
    clearComposer();

    expect(readComposerText()).toBe('');
  });

  it('reads the same value it publishes to subscribers', () => {
    const seen: string[] = [];
    const stop = composerText.subscribe((value) => seen.push(value));

    setComposerText('a');
    setComposerText('ab');
    stop();

    expect(seen.at(-1)).toBe('ab');
    expect(readComposerText()).toBe('ab');
  });

  it('tells a subscriber about every change', () => {
    const seen: string[] = [];
    const stop = composerText.subscribe((value) => seen.push(value));

    setComposerText('a');
    setComposerText('ab');
    clearComposer();
    stop();

    // The subscription fires once on subscribe, then once per change.
    expect(seen).toEqual(['', 'a', 'ab', '']);
  });
});

describe('a search result arriving mid-sentence', () => {
  it('goes in front, so the thing just asked for is visible', () => {
    setComposerText('and make it dark');
    prependToComposer('Result: React 19 ships use()');

    expect(readComposerText()).toBe('Result: React 19 ships use()\n\nand make it dark');
  });

  it('does not leave blank lines when the box was empty', () => {
    prependToComposer('Result');

    expect(readComposerText()).toBe('Result');
  });

  it('keeps every word the person had typed', () => {
    setComposerText('my careful sentence');
    prependToComposer('search');

    expect(readComposerText()).toContain('my careful sentence');
  });
});
