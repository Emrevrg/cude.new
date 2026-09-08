/**
 * Cude.new - artifact parser behaviour.
 *
 * Everything here is driven the way responses actually arrive: as a growing
 * string. The split-tag and streaming cases are the ones that matter, because
 * a parser that only works on complete input corrupts files mid-response.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ArtifactParser, type ActionEvent, type ArtifactEvent } from './artifactParser';
import {
  parseAttributes,
  stripWrappingCodeFence,
  unescapeTags,
  normalizeFileContent,
  isKnownActionType,
  getActionFilePath,
} from './artifactProtocol';

const A = 'cudeArtifact';
const X = 'cudeAction';

function collector() {
  const artifactsOpened: ArtifactEvent[] = [];
  const artifactsClosed: ArtifactEvent[] = [];
  const opened: ActionEvent[] = [];
  const streamed: ActionEvent[] = [];
  const closed: Array<{ type: string; filePath?: string; content: string }> = [];

  const callbacks = {
    onArtifactOpen: (e: ArtifactEvent) => artifactsOpened.push(e),
    onArtifactClose: (e: ArtifactEvent) => artifactsClosed.push(e),
    onActionOpen: (e: ActionEvent) => opened.push({ ...e, action: { ...e.action } }),
    onActionStream: (e: ActionEvent) => streamed.push({ ...e, action: { ...e.action } }),
    onActionClose: (e: ActionEvent) =>
      closed.push({ type: e.action.type, filePath: e.action.filePath, content: e.action.content }),
  };

  return { callbacks, artifactsOpened, artifactsClosed, opened, streamed, closed };
}

describe('protocol helpers', () => {
  it('reads tag attributes', () => {
    expect(parseAttributes(' id="x" title="Build a thing"')).toEqual({ id: 'x', title: 'Build a thing' });
  });

  it('ignores malformed attributes rather than throwing', () => {
    expect(parseAttributes(' id= title="ok"')).toEqual({ title: 'ok' });
  });

  it('accepts single-quoted and unquoted attributes from smaller models', () => {
    expect(parseAttributes(" type='file' path=src/App.tsx")).toEqual({ type: 'file', path: 'src/App.tsx' });
  });

  it('normalizes common file path attribute spellings', () => {
    expect(getActionFilePath({ path: 'src/App.tsx' })).toBe('src/App.tsx');
    expect(getActionFilePath({ filepath: 'index.html' })).toBe('index.html');
    expect(getActionFilePath({ file_path: 'package.json' })).toBe('package.json');
  });

  it('strips a fence that wraps the whole content', () => {
    expect(stripWrappingCodeFence('```ts\nconst a = 1;\n```')).toBe('const a = 1;');
  });

  it('keeps a fence that is part of a markdown document', () => {
    const doc = '# Title\n\n```ts\ncode\n```\n\nMore prose.';
    expect(stripWrappingCodeFence(doc)).toBe(doc);
  });

  it('unescapes angle brackets some models emit', () => {
    expect(unescapeTags('&lt;div&gt;')).toBe('<div>');
  });

  it('normalizes file content through both steps', () => {
    expect(normalizeFileContent('```tsx\n&lt;App /&gt;\n```')).toBe('<App />');
  });

  it('knows the action types the runtime supports', () => {
    expect(isKnownActionType('file')).toBe(true);
    expect(isKnownActionType('shell')).toBe(true);
    expect(isKnownActionType('start')).toBe(true);
    expect(isKnownActionType('build')).toBe(true);
    expect(isKnownActionType('sudo')).toBe(false);
  });
});

describe('parsing a complete response', () => {
  let c: ReturnType<typeof collector>;
  let parser: ArtifactParser;

  beforeEach(() => {
    c = collector();
    parser = new ArtifactParser({ callbacks: c.callbacks, renderArtifact: () => '[artifact]' });
  });

  it('returns prose and replaces the artifact', () => {
    const out = parser.parse('m1', `Here you go.\n<${A} id="a1" title="Thing"></${A}>\nDone.`);

    expect(out).toBe('Here you go.\n[artifact]\nDone.');
  });

  it('reports the artifact that opened and closed', () => {
    parser.parse('m1', `<${A} id="a1" title="Thing"></${A}>`);

    expect(c.artifactsOpened[0].artifact).toEqual({ id: 'a1', title: 'Thing' });
    expect(c.artifactsClosed).toHaveLength(1);
  });

  it('reports a file action with its path and content', () => {
    parser.parse('m1', `<${A} id="a1" title="T"><${X} type="file" filePath="src/App.tsx">hello</${X}></${A}>`);

    expect(c.closed).toEqual([{ type: 'file', filePath: 'src/App.tsx', content: 'hello' }]);
  });

  it('reports a file action when a model uses path instead of filePath', () => {
    parser.parse('m1', `<${A} id="a1" title="T"><${X} type='file' path=src/App.tsx>hello</${X}></${A}>`);

    expect(c.closed).toEqual([{ type: 'file', filePath: 'src/App.tsx', content: 'hello' }]);
  });

  it('reports shell and start actions', () => {
    parser.parse(
      'm1',
      `<${A} id="a1" title="T"><${X} type="shell">pnpm i</${X}><${X} type="start">pnpm dev</${X}></${A}>`,
    );

    expect(c.closed.map((a) => [a.type, a.content])).toEqual([
      ['shell', 'pnpm i'],
      ['start', 'pnpm dev'],
    ]);
  });

  it('gives each action a distinct id', () => {
    parser.parse('m1', `<${A} id="a1" title="T"><${X} type="shell">a</${X}><${X} type="shell">b</${X}></${A}>`);

    expect(c.opened.map((e) => e.actionId)).toEqual(['0', '1']);
  });

  it('treats an unknown action type as a shell command rather than dropping it', () => {
    parser.parse('m1', `<${A} id="a1" title="T"><${X} type="wat">echo hi</${X}></${A}>`);

    expect(c.closed[0].type).toBe('shell');
  });

  it('strips a markdown fence from file content', () => {
    parser.parse(
      'm1',
      `<${A} id="a1" title="T"><${X} type="file" filePath="a.ts">\`\`\`ts\nconst a = 1;\n\`\`\`</${X}></${A}>`,
    );

    expect(c.closed[0].content).toBe('const a = 1;');
  });

  it('leaves prose with angle brackets alone', () => {
    expect(parser.parse('m1', 'Use <div> for layout.')).toBe('Use <div> for layout.');
  });
});

describe('streaming', () => {
  let c: ReturnType<typeof collector>;
  let parser: ArtifactParser;

  beforeEach(() => {
    c = collector();
    parser = new ArtifactParser({ callbacks: c.callbacks, renderArtifact: () => '[artifact]' });
  });

  /** Feed a response in fragments, the way a stream arrives. */
  function stream(messageId: string, full: string, chunkSize: number) {
    let out = '';

    for (let i = chunkSize; i <= full.length + chunkSize; i += chunkSize) {
      out += parser.parse(messageId, full.slice(0, Math.min(i, full.length)));
    }

    return out;
  }

  it('produces the same prose whatever the chunk size', () => {
    const full = `Intro.\n<${A} id="a1" title="T"><${X} type="shell">pnpm i</${X}></${A}>\nOutro.`;

    for (const size of [1, 3, 7, 50]) {
      const fresh = new ArtifactParser({ renderArtifact: () => '[artifact]' });
      let out = '';

      for (let i = size; i <= full.length + size; i += size) {
        out += fresh.parse('m', full.slice(0, Math.min(i, full.length)));
      }

      expect(out, `chunk size ${size}`).toBe('Intro.\n[artifact]\nOutro.');
    }
  });

  it('does not mistake a tag split across fragments for prose', () => {
    // A one-character stream splits every tag.
    const out = stream('m1', `<${A} id="a1" title="T"></${A}>`, 1);

    expect(out).toBe('[artifact]');
    expect(c.artifactsOpened).toHaveLength(1);
  });

  it('emits file content as it grows', () => {
    const full = `<${A} id="a1" title="T"><${X} type="file" filePath="a.ts">abcdef</${X}></${A}>`;
    stream('m1', full, 4);

    expect(c.streamed.length).toBeGreaterThan(1);
    expect(c.streamed.at(-1)?.action.content).toContain('abc');
  });

  it('delivers the complete content when the action closes', () => {
    const full = `<${A} id="a1" title="T"><${X} type="file" filePath="a.ts">abcdef</${X}></${A}>`;
    stream('m1', full, 3);

    expect(c.closed).toEqual([{ type: 'file', filePath: 'a.ts', content: 'abcdef' }]);
  });

  it('opens each action exactly once across a stream', () => {
    const full = `<${A} id="a1" title="T"><${X} type="shell">pnpm i</${X}></${A}>`;
    stream('m1', full, 2);

    expect(c.opened).toHaveLength(1);
  });

  it('keeps two messages independent', () => {
    parser.parse('m1', `<${A} id="a1" title="One">`);
    parser.parse('m2', `<${A} id="a2" title="Two">`);

    expect(c.artifactsOpened.map((e) => e.artifact.id)).toEqual(['a1', 'a2']);
  });

  it('starts clean after a reset, so a restored conversation re-parses', () => {
    parser.parse('m1', `<${A} id="a1" title="T"></${A}>`);
    parser.reset('m1');
    parser.parse('m1', `<${A} id="a1" title="T"></${A}>`);

    expect(c.artifactsOpened).toHaveLength(2);
  });
});

describe('compatibility and robustness', () => {
  it('still parses artifacts written with the previous tag names', () => {
    const c = collector();
    const parser = new ArtifactParser({ callbacks: c.callbacks, renderArtifact: () => '[artifact]' });

    parser.parse(
      'm1',
      '<cudeArtifact id="a1" title="T"><cudeAction type="file" filePath="a.ts">x</cudeAction></cudeArtifact>',
    );

    expect(c.closed).toEqual([{ type: 'file', filePath: 'a.ts', content: 'x' }]);
  });

  it('does not emit a close for an artifact that never finished', () => {
    const c = collector();
    const parser = new ArtifactParser({ callbacks: c.callbacks });

    parser.parse('m1', `<${A} id="a1" title="T"><${X} type="shell">pnpm i`);

    expect(c.artifactsClosed).toHaveLength(0);
    expect(c.closed).toHaveLength(0);
  });

  it('survives a response with no artifact at all', () => {
    const parser = new ArtifactParser({ callbacks: collector().callbacks });

    expect(parser.parse('m1', 'Just an explanation, no code.')).toBe('Just an explanation, no code.');
  });

  it('works with no callbacks supplied', () => {
    const parser = new ArtifactParser();

    expect(() => parser.parse('m1', `<${A} id="a" title="T"><${X} type="shell">x</${X}></${A}>`)).not.toThrow();
  });

  it('clears every message on a full reset', () => {
    const c = collector();
    const parser = new ArtifactParser({ callbacks: c.callbacks });
    parser.parse('m1', `<${A} id="a1" title="T"></${A}>`);
    parser.reset();
    parser.parse('m1', `<${A} id="a1" title="T"></${A}>`);

    expect(c.artifactsOpened).toHaveLength(2);
  });

  it('does not call a stream callback for a shell action that arrived whole', () => {
    const onActionStream = vi.fn();
    const parser = new ArtifactParser({ callbacks: { onActionStream } });

    parser.parse('m1', `<${A} id="a1" title="T"><${X} type="shell">pnpm i</${X}></${A}>`);

    expect(onActionStream).not.toHaveBeenCalled();
  });
});
