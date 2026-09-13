import { describe, expect, it } from 'vitest';
import { canRunInWorkspace, capabilityFor } from './capabilityMatrix';

describe('target capability matrix', () => {
  it('does not present a hardware packet as an in-browser device build', () => {
    const hardware = capabilityFor('hardware');

    expect(hardware.tier).toBe('device-required');
    expect(hardware.canGenerate).toBe(true);
    expect(hardware.canValidateHere).toBe(false);
    expect(hardware.nextRequirement).toContain('PlatformIO');
  });

  it('keeps web projects runnable in the workspace', () => {
    expect(canRunInWorkspace('web')).toBe(true);
    expect(canRunInWorkspace('ios')).toBe(false);
  });

  it('does not claim generation for a planning-only unsupported IDE target', () => {
    const ideExtension = capabilityFor('ide-extension');

    expect(ideExtension.tier).toBe('planning-only');
    expect(ideExtension.canGenerate).toBe(false);
  });
});
