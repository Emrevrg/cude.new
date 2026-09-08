// Cude.new - Markdown.spec.ts (Cude product surface, 2026)
/**
 * Cude.new - stripping the code fence a model wraps an artifact in.
 *
 * Models routinely put the artifact inside a fenced block, which would render
 * as a wall of markup instead of the artifact. The marker was renamed from the
 * upstream name; both are accepted on input, so a conversation saved before the
 * rename still renders.
 */

import { describe, expect, it } from 'vitest';
import { stripCodeFenceFromArtifact } from './Markdown';
import { ARTIFACT_MARKER } from '~/lib/cude/pipeline/messageMarkers';

const FENCE = '```';

function artifact(marker: string): string {
  return `<div class='${marker}'></div>`;
}

describe('stripping the fence', () => {
  it('removes a plain fence around an artifact', () => {
    const input = `${FENCE}xml\n${artifact(ARTIFACT_MARKER)}\n${FENCE}`;

    expect(stripCodeFenceFromArtifact(input)).toBe(`\n${artifact(ARTIFACT_MARKER)}\n`);
  });

  it('removes a fence whatever language it claims', () => {
    const input = `${FENCE}typescript\n${artifact(ARTIFACT_MARKER)}\n${FENCE}`;

    expect(stripCodeFenceFromArtifact(input)).toBe(`\n${artifact(ARTIFACT_MARKER)}\n`);
  });
});

describe('what it leaves alone', () => {
  it('does not touch an ordinary code block', () => {
    const input = `${FENCE}\nregular code block\n${FENCE}`;

    expect(stripCodeFenceFromArtifact(input)).toBe(input);
  });

  it('handles empty input', () => {
    expect(stripCodeFenceFromArtifact('')).toBe('');
  });

  it('leaves an artifact that was never fenced', () => {
    const input = artifact(ARTIFACT_MARKER);

    expect(stripCodeFenceFromArtifact(input)).toBe(input);
  });

  it('keeps surrounding prose and unrelated code blocks', () => {
    const input = ['Some text', FENCE, artifact(ARTIFACT_MARKER), FENCE, '', FENCE, 'regular code', FENCE].join('\n');

    const expected = ['Some text', '', artifact(ARTIFACT_MARKER), '', '', FENCE, 'regular code', FENCE].join('\n');

    expect(stripCodeFenceFromArtifact(input)).toBe(expected);
  });
});
