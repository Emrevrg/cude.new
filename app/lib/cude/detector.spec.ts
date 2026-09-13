import { describe, expect, it } from 'vitest';
import { detectProjectType } from './detector';

describe('detectProjectType', () => {
  it('keeps explicit web products on the web when they mention sensor data', () => {
    expect(detectProjectType('Build a web app that displays sensor readings')).toBe('web');
  });

  it('recognises explicit firmware and board requests as hardware', () => {
    expect(detectProjectType('Build ESP32 firmware for a room sensor')).toBe('hardware');
  });

  it('recognises physical component projects without a named board', () => {
    expect(detectProjectType('Create a relay controller with a wiring guide')).toBe('hardware');
  });
});
