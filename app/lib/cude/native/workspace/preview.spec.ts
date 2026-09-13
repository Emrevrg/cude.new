import { describe, expect, it } from 'vitest';
import { createPreviewState, previewReducer, type PreviewEvent } from './preview';

describe('preview lifecycle', () => {
  it('moves from idle to ready and then stopped', () => {
    const events: PreviewEvent[] = [
      { type: 'START', requestId: 'preview-1' },
      { type: 'READY', requestId: 'preview-1', url: 'http://127.0.0.1:5173' },
      { type: 'STOP', reason: 'user' },
    ];
    expect(events.reduce(previewReducer, createPreviewState())).toEqual({
      phase: 'stopped',
      generation: 1,
      reason: 'user',
    });
  });

  it('ignores stale completion after a newer start', () => {
    const first = previewReducer(createPreviewState(), { type: 'START', requestId: 'first' });
    const second = previewReducer(first, { type: 'START', requestId: 'second' });
    const stale = previewReducer(second, { type: 'READY', requestId: 'first', url: 'https://stale.test' });
    expect(stale).toBe(second);
    expect(second.generation).toBe(2);
  });

  it('turns malformed and non-http preview URLs into failures', () => {
    const starting = previewReducer(createPreviewState(), { type: 'START', requestId: 'preview' });
    expect(previewReducer(starting, { type: 'READY', requestId: 'preview', url: 'javascript:alert(1)' })).toMatchObject(
      {
        phase: 'failed',
        message: expect.stringMatching(/unsupported url/i),
      },
    );
  });

  it('captures failures and resets without rewinding its generation', () => {
    const starting = previewReducer(createPreviewState(), { type: 'START', requestId: 'preview' });
    const failed = previewReducer(starting, { type: 'FAIL', requestId: 'preview', message: '' });
    const reset = previewReducer(failed, { type: 'RESET' });
    expect(failed).toMatchObject({ phase: 'failed', message: 'Preview failed.' });
    expect(reset).toEqual({ phase: 'idle', generation: 1 });
  });
});
