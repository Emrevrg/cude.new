/**
 * Cude.new — a pipeline stage reports, or it says nothing.
 *
 * The orchestrator once ran a set of timers that announced work nobody had
 * done: four screens rechecked, no console errors, no secrets found, patch
 * prepared. Those went. The planner was the last of it — a pause, then
 * "scaffold -> implement -> configure -> build -> test", identical for every
 * request, whatever was asked for.
 *
 * A stage whose output does not depend on its input is decoration, and this
 * is the check that keeps one from creeping back: the source is read for the
 * shapes that gave the old ones away.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./orchestrator.ts', import.meta.url), 'utf8');

/*
 * The code, without the prose.
 *
 * The comments here deliberately quote the fabricated lines that were removed,
 * so somebody reading the file knows what went and why. Scanning the raw text
 * flags that history as the thing it warns about.
 */
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('what the pipeline claims to have done', () => {
  it('never announces a fixed task list', () => {
    // The exact string, and the shape of it.
    expect(code).not.toContain('scaffold → implement → configure → build → test');
    expect(code).not.toMatch(/updateAgentStatus\(\s*'planner',\s*'complete',\s*'[^']*'\s*\)/);
  });

  it('does not schedule progress that nothing produced', () => {
    /*
     * `setTimeout` used to be how a stage "finished": wait 400ms, declare a
     * result. Real waits here are on a build or a file write, which are
     * awaited, not timed.
     *
     * One timer is allowed and lives in `microDelay`, which only spaces the
     * status lines far enough apart to be readable — it never decides an
     * outcome. Any other is a stage advancing itself again.
     */
    const timers = [...code.matchAll(/setTimeout\s*\(/g)];
    expect(timers.length, 'a stage is being advanced by a timer again').toBe(1);
    expect(code).toMatch(/function microDelay\(ms: number\)[\s\S]{0,80}setTimeout/);
  });

  it('reports a verification stage only from a real outcome', () => {
    /*
     * These were the four worst: printed on a timer, describing checks that
     * had no implementation behind them.
     */
    const fabricated = [
      'screens rechecked',
      'no critical console errors',
      'Requirements and design consistency passed',
      'No secrets found',
      'Patch prepared',
    ];

    for (const claim of fabricated) {
      expect(code, `"${claim}" is back`).not.toContain(claim);
    }
  });
});
