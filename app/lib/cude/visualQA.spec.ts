/**
 * Cude.new - visual QA.
 *
 * This pass decides whether a generated product holds together visually, and
 * its findings drive repair. A false positive is therefore expensive twice: it
 * costs a repair cycle, and it teaches everyone to ignore the report.
 *
 * Two of these tests pin corrections to exactly that. The radius check counted
 * the token definitions as drift, so every correct project was flagged. The
 * reuse check matched `<button>` case-insensitively, so a screen using the
 * shared `<Button>` was reported for not using it.
 */

import { describe, it, expect } from 'vitest';
import { runVisualQA } from './visualQA';
import { createDesignSystem } from './designSystem';

const ds = createDesignSystem('Build a precise, premium finance dashboard.');

const TOKENS_CSS = ':root{--radius-xs:4px;--radius-sm:6px;--radius-md:8px;--radius-lg:12px;--color-background:#fff;}';

function screen(body: string, imports = "import { Button, Card } from '../components/ui';") {
  return `${imports}\nexport function Screen(){ return ${body} }\n`;
}

function project(overrides: Record<string, string> = {}) {
  return {
    'src/tokens.css': TOKENS_CSS,
    'src/components/ui.tsx':
      "export function Button(p:any){return <button style={{borderRadius:'var(--radius-md)'}} {...p}/>}",
    'src/screens/Dashboard.tsx': screen(
      `<div style={{padding:'var(--space-4)', borderRadius:'var(--radius-lg)'}}><Button>Go</Button></div>`,
    ),
    ...overrides,
  };
}

describe('radius drift', () => {
  it('does not flag a project that only uses tokens', () => {
    const report = runVisualQA(project(), ds, ['Dashboard']);

    expect(report.issues.filter((issue) => issue.id === 'radius-drift')).toHaveLength(0);
  });

  it('does not treat the token definitions themselves as drift', () => {
    // The token file defines five radii; that is the system, not drift.
    const report = runVisualQA({ 'src/tokens.css': TOKENS_CSS }, ds, []);

    expect(report.issues.filter((issue) => issue.id === 'radius-drift')).toHaveLength(0);
  });

  it('flags a hardcoded radius at a usage site', () => {
    const report = runVisualQA(
      project({
        'src/screens/Dashboard.tsx': screen(`<div style={{borderRadius:'17px'}}><Button>Go</Button></div>`),
      }),
      ds,
      ['Dashboard'],
    );

    const drift = report.issues.find((issue) => issue.id === 'radius-drift');

    expect(drift?.message).toContain('17px');
  });

  it('flags a hardcoded radius written in CSS too', () => {
    const report = runVisualQA({ ...project(), 'src/app.css': '.card{border-radius: 13px;}' }, ds, ['Dashboard']);

    expect(report.issues.find((issue) => issue.id === 'radius-drift')?.message).toContain('13px');
  });

  it('reports a radius scale with too many steps', () => {
    const sprawling =
      ':root{--radius-a:1px;--radius-b:2px;--radius-c:3px;--radius-d:4px;--radius-e:5px;--radius-f:6px;--radius-g:7px;}';
    const report = runVisualQA({ 'src/tokens.css': sprawling }, ds, []);

    expect(report.issues.find((issue) => issue.id === 'radius-scale')).toBeDefined();
  });
});

describe('reusing the shared primitives', () => {
  it('does not flag a screen that uses the shared Button', () => {
    const report = runVisualQA(project(), ds, ['Dashboard']);

    expect(report.issues.filter((issue) => issue.category === 'reuse')).toHaveLength(0);
  });

  it('flags a screen that writes its own raw button', () => {
    const report = runVisualQA(
      project({
        'src/screens/Dashboard.tsx': screen(
          `<div style={{borderRadius:'var(--radius-lg)'}}><button>Go</button></div>`,
          "import { Card } from '../components/ui';",
        ),
      }),
      ds,
      ['Dashboard'],
    );

    expect(report.issues.find((issue) => issue.category === 'reuse')?.message).toContain('Dashboard');
  });

  it('accepts a Button imported from any local module', () => {
    const report = runVisualQA(
      project({
        'src/screens/Dashboard.tsx': screen(
          `<div style={{borderRadius:'var(--radius-lg)'}}><button>Go</button></div>`,
          "import { Button } from '../design/primitives';",
        ),
      }),
      ds,
      ['Dashboard'],
    );

    expect(report.issues.filter((issue) => issue.category === 'reuse')).toHaveLength(0);
  });
});

describe('the report', () => {
  it('passes when nothing is an error', () => {
    expect(runVisualQA(project(), ds, ['Dashboard']).passed).toBe(true);
  });

  it('names the screens it looked at', () => {
    expect(runVisualQA(project(), ds, ['Dashboard']).screens).toEqual(['Dashboard']);
  });

  it('copes with a screen that does not exist', () => {
    expect(() => runVisualQA(project(), ds, ['Missing'])).not.toThrow();
  });

  it('copes with no design system at all', () => {
    expect(() => runVisualQA(project(), null, ['Dashboard'])).not.toThrow();
  });
});
