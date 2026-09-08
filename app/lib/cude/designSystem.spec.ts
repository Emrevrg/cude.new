import { describe, it, expect } from 'vitest';
import {
  createDesignSystem,
  validateDesignSystem,
  designSystemToCssVars,
  applyGlobalCompactSharp,
  updateDesignSystem,
} from './designSystem';

describe('Design Director', () => {
  it('derives finance personality for finance prompt', () => {
    const ds = createDesignSystem(
      'Build a premium personal finance application with Dashboard, Transactions, Analytics and Settings.',
    );
    expect(ds.identity.personality).toContain('financial');
    expect(ds.identity.density).toBe('compact');
    expect(ds.typography.tabularNumerals).toBe(true);
  });

  it('derives luxury for commerce prompt', () => {
    const ds = createDesignSystem('Build a luxury commerce application');
    expect(ds.meta.preset).toBe('luxury');
    expect(ds.identity.personality).toContain('luxury');
  });

  it('produces valid design system structure', () => {
    const ds = createDesignSystem('Build a developer tool');
    const v = validateDesignSystem(ds);
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
  });

  it('generates executable CSS vars', () => {
    const ds = createDesignSystem('Build a finance dashboard');
    const css = designSystemToCssVars(ds);
    expect(css).toContain('--color-background:');
    expect(css).toContain('--radius-md:');
    expect(css).toContain('--space-4:');
    expect(css).toContain('--component-button-height:');
  });

  it('global compact sharp modifies tokens systemically', () => {
    const ds = createDesignSystem('Build a finance app');
    const prevRadius = ds.radius.md;
    const next = applyGlobalCompactSharp(ds);
    expect(next.meta.version).toBe(ds.meta.version + 1);
    expect(next.identity.density).toBe('compact');
    expect(next.radius.md).not.toBe(prevRadius);
    expect(next.radius.md).toBe('6px');
    expect(next.components.button.height).toBe('30px');
  });

  it('updateDesignSystem bumps version and merges', () => {
    const ds = createDesignSystem('Build a finance app');
    const next = updateDesignSystem(ds, { colors: { accent: '#FF0000' } as any });
    expect(next.colors.accent).toBe('#FF0000');
    expect(next.meta.version).toBe(ds.meta.version + 1);
  });

  it('playful preset differs from technical', () => {
    const a = createDesignSystem('Build a playful children education app');
    const b = createDesignSystem('Build a technical developer tool');
    expect(a.radius.lg).not.toBe(b.radius.lg);
    expect(a.colors.accent).not.toBe(b.colors.accent);
  });
});
