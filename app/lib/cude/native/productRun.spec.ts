import { describe, expect, it } from 'vitest';
import { createProductRun, productRunReducer, type ProductRunAction } from './productRun';

const brief: ProductRunAction = {
  type: 'SUBMIT_BRIEF',
  brief: { outcome: 'A collaborative field-reporting app', audience: 'inspectors', constraints: ['offline first'] },
};

const architecture: ProductRunAction = {
  type: 'ACCEPT_ARCHITECTURE',
  architecture: { summary: 'Local-first web app', targets: ['web'], tradeoffs: ['larger initial bundle'] },
};

const design: ProductRunAction = {
  type: 'APPROVE_DESIGN',
  design: { summary: 'High-contrast mobile workflow', acceptanceCriteria: ['usable with gloves'] },
};

describe('Cude native product-run protocol', () => {
  it('moves deterministically from brief through release', () => {
    const actions: ProductRunAction[] = [
      brief,
      architecture,
      design,
      { type: 'RECORD_BUILD', build: { buildId: 'build-1', succeeded: false, summary: 'type error' } },
      { type: 'RECORD_BUILD', build: { buildId: 'build-2', succeeded: true, summary: 'verified' } },
      {
        type: 'CAPTURE_EVIDENCE',
        evidence: { evidenceId: 'e-1', kind: 'test', passed: true, summary: '42 tests pass' },
      },
      { type: 'RELEASE', release: { releaseId: 'r-1', destination: 'staging', summary: 'staging delivery' } },
    ];

    const result = actions.reduce(productRunReducer, createProductRun('run-1'));

    expect(result.stage).toBe('released');
    expect(result.builds.map((build) => build.succeeded)).toEqual([false, true]);
    expect(result.events.map((event) => event.to)).toEqual([
      'architecture',
      'design-review',
      'building',
      'building',
      'evidence',
      'evidence',
      'released',
    ]);
    expect(result.events.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('rejects invalid transitions without changing the current stage', () => {
    const state = createProductRun('run-2');
    const next = productRunReducer(state, architecture);

    expect(next.stage).toBe('brief');
    expect(next.events).toEqual([expect.objectContaining({ accepted: false, from: 'brief', to: 'brief' })]);
    expect(next.events[0].reason).toMatch(/after a brief/i);
    expect(state.events).toEqual([]);
  });

  it('records revisions without skipping their review stage', () => {
    const inArchitecture = productRunReducer(createProductRun('run-3'), brief);
    const revisedArchitecture = productRunReducer(inArchitecture, {
      type: 'REQUEST_ARCHITECTURE_REVISION',
      reason: 'Need native sync',
    });
    const inDesign = productRunReducer(revisedArchitecture, architecture);
    const revisedDesign = productRunReducer(inDesign, {
      type: 'REQUEST_DESIGN_REVISION',
      reason: 'Contrast needs work',
    });

    expect(revisedArchitecture).toMatchObject({ stage: 'architecture', architectureRevisions: 1 });
    expect(revisedDesign).toMatchObject({ stage: 'design-review', designRevisions: 1 });
  });

  it('will not release without passing evidence', () => {
    const inEvidence = [
      brief,
      architecture,
      design,
      { type: 'RECORD_BUILD', build: { buildId: 'build-1', succeeded: true, summary: 'ok' } } as ProductRunAction,
      {
        type: 'CAPTURE_EVIDENCE',
        evidence: { evidenceId: 'e-1', kind: 'test', passed: false, summary: 'test failed' },
      } as ProductRunAction,
    ].reduce(productRunReducer, createProductRun('run-4'));

    const next = productRunReducer(inEvidence, {
      type: 'RELEASE',
      release: { releaseId: 'r-1', destination: 'production', summary: 'go' },
    });

    expect(next.stage).toBe('evidence');
    expect(next.release).toBeUndefined();
    expect(next.events.at(-1)).toMatchObject({ accepted: false, reason: expect.stringMatching(/passing evidence/i) });
  });

  it('is deterministic and does not mutate prior states', () => {
    const first = createProductRun('run-5');
    const left = productRunReducer(first, brief);
    const right = productRunReducer(first, brief);

    expect(left).toEqual(right);
    expect(first).toMatchObject({ stage: 'brief', events: [] });
  });
});
