import { describe, expect, it } from 'vitest';
import { getTemplateForType } from './templates';

describe('hardware template', () => {
  it('provides a complete PlatformIO handoff packet', () => {
    const files = getTemplateForType('hardware', 'Build a room monitor');

    expect(files['platformio.ini']).toContain('framework = arduino');
    expect(files['src/main.cpp']).toContain('Serial.begin(115200)');
    expect(files['hardware/BOM.md']).toContain('# Bill of materials');
    expect(files['hardware/WIRING.md']).toContain('# Wiring plan');
  });

  it('does not drive an assumed GPIO before the board pin map is confirmed', () => {
    const files = getTemplateForType('hardware', 'Build a prototype');

    expect(files['src/main.cpp']).not.toContain('pinMode(');
    expect(files['src/main.cpp']).not.toContain('digitalWrite(');
    expect(files['hardware/WIRING.md']).toContain('No GPIO connections are enabled');
  });
});
