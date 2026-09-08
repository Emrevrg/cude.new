/**
 * Cude.new - following the newest message.
 *
 * The decision is arithmetic on three numbers, and getting it slightly wrong
 * shows up as a conversation that stops following for no visible reason. Real
 * scroll positions are fractional, which is exactly why the threshold exists.
 */

import { describe, it, expect } from 'vitest';
import { isNearBottom, distanceFromBottom, BOTTOM_THRESHOLD } from './StickToBottom';

describe('distance from the end', () => {
  it('is zero when scrolled fully down', () => {
    expect(distanceFromBottom({ scrollTop: 800, scrollHeight: 1000, clientHeight: 200 })).toBe(0);
  });

  it('measures how much is left below', () => {
    expect(distanceFromBottom({ scrollTop: 300, scrollHeight: 1000, clientHeight: 200 })).toBe(500);
  });

  it('is zero, not negative, when the browser over-scrolls', () => {
    expect(distanceFromBottom({ scrollTop: 810, scrollHeight: 1000, clientHeight: 200 })).toBe(0);
  });

  it('is zero when the content is shorter than the viewport', () => {
    expect(distanceFromBottom({ scrollTop: 0, scrollHeight: 100, clientHeight: 400 })).toBe(0);
  });
});

describe('deciding whether to keep following', () => {
  it('follows when pinned to the end', () => {
    expect(isNearBottom({ scrollTop: 800, scrollHeight: 1000, clientHeight: 200 })).toBe(true);
  });

  it('follows through a fractional scroll position', () => {
    expect(isNearBottom({ scrollTop: 799.6, scrollHeight: 1000, clientHeight: 200 })).toBe(true);
  });

  it('stops following once the reader scrolls up', () => {
    expect(isNearBottom({ scrollTop: 400, scrollHeight: 1000, clientHeight: 200 })).toBe(false);
  });

  it('treats the threshold as inclusive', () => {
    expect(isNearBottom({ scrollTop: 800 - BOTTOM_THRESHOLD, scrollHeight: 1000, clientHeight: 200 })).toBe(true);
  });

  it('stops one pixel past the threshold', () => {
    expect(isNearBottom({ scrollTop: 800 - BOTTOM_THRESHOLD - 1, scrollHeight: 1000, clientHeight: 200 })).toBe(false);
  });

  it('follows an empty conversation, which has nowhere to scroll', () => {
    expect(isNearBottom({ scrollTop: 0, scrollHeight: 0, clientHeight: 0 })).toBe(true);
  });

  it('accepts a caller-supplied threshold', () => {
    const metrics = { scrollTop: 700, scrollHeight: 1000, clientHeight: 200 };

    expect(isNearBottom(metrics, 50)).toBe(false);
    expect(isNearBottom(metrics, 150)).toBe(true);
  });
});
