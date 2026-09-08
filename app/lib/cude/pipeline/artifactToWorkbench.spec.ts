/**
 * Cude.new — what happens when the model writes something.
 *
 * This is the chain the whole product rests on: the reply contains an
 * artifact, the parser sees it open, the workbench appears, and the files land
 * where the editor can show them. It has never been possible to watch it end
 * to end against a live provider — NVIDIA accepts a request for Kimi K3 and
 * then sends nothing, for as long as you wait — so it is proved here instead,
 * from the same text a model would produce.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { ArtifactParser } from './artifactParser';

const ARTIFACT = [
  'Here is the page you asked for.',
  '',
  '<cudeArtifact id="hello-page" title="Hello page">',
  '<cudeAction type="file" filePath="index.html">',
  '<!doctype html><title>Hello</title><button>Hello</button>',
  '</cudeAction>',
  '<cudeAction type="shell">',
  'npx serve .',
  '</cudeAction>',
  '</cudeArtifact>',
  '',
  'That is everything.',
].join('\n');

/** Stands in for the workbench, recording what the parser asks of it. */
function recorder() {
  return {
    opened: [] as { id: string; title: string }[],
    closed: [] as string[],
    actions: [] as { type: string; filePath?: string; content: string }[],

    /* Filled on close: an action opens before its content has streamed in. */
    finished: [] as { type: string; filePath?: string; content: string }[],
    ran: [] as string[],
  };
}

describe('a reply that writes a file', () => {
  let seen: ReturnType<typeof recorder>;
  let parser: ArtifactParser;

  beforeEach(() => {
    seen = recorder();
    parser = new ArtifactParser({
      callbacks: {
        onArtifactOpen: ({ artifact }) => seen.opened.push({ id: artifact.id, title: artifact.title }),
        onArtifactClose: ({ artifact }) => seen.closed.push(artifact.id),
        onActionOpen: ({ action }) => seen.actions.push({ ...action } as never),
        onActionClose: ({ action }) => {
          seen.ran.push(action.type);
          seen.finished.push({ ...action } as never);
        },
      },
    });
  });

  it('opens the artifact, which is what opens the workbench', () => {
    parser.parse('m1', ARTIFACT);

    expect(seen.opened).toHaveLength(1);
    expect(seen.opened[0]).toEqual({ id: 'hello-page', title: 'Hello page' });
  });

  it('closes it once the model is finished with it', () => {
    parser.parse('m1', ARTIFACT);

    expect(seen.closed).toEqual(['hello-page']);
  });

  it('names the file as soon as it opens, so the editor can show it filling', () => {
    parser.parse('m1', ARTIFACT);

    expect(seen.actions.find((action) => action.type === 'file')?.filePath).toBe('index.html');
  });

  it('has the file written by the time it closes', () => {
    parser.parse('m1', ARTIFACT);

    const file = seen.finished.find((action) => action.type === 'file');

    expect(file?.filePath).toBe('index.html');
    expect(file?.content).toContain('<button>Hello</button>');
  });

  it('registers the command as a command, not as a file', () => {
    parser.parse('m1', ARTIFACT);

    expect(seen.ran).toEqual(['file', 'shell']);
  });

  it('leaves the prose either side of the artifact for the reader', () => {
    const rendered = parser.parse('m1', ARTIFACT);

    expect(rendered).toContain('Here is the page you asked for.');
    expect(rendered).toContain('That is everything.');
    expect(rendered).not.toContain('<!doctype html>');
  });
});

describe('a reply that arrives a piece at a time', () => {
  /*
   * A model streams. The workbench has to open on the opening tag, not once
   * the whole reply has landed — otherwise a person watches nothing happen
   * while their file is being written.
   */
  it('opens the workbench before the file is finished', () => {
    const seen = recorder();
    const parser = new ArtifactParser({
      callbacks: {
        onArtifactOpen: ({ artifact }) => seen.opened.push({ id: artifact.id, title: artifact.title }),
        onArtifactClose: ({ artifact }) => seen.closed.push(artifact.id),
        onActionOpen: ({ action }) => seen.actions.push({ ...action } as never),
        onActionClose: ({ action }) => seen.ran.push(action.type),
      },
    });

    const half = ARTIFACT.indexOf('<!doctype');

    parser.parse('m1', ARTIFACT.slice(0, half));

    expect(seen.opened, 'the artifact opens on its opening tag').toHaveLength(1);
    expect(seen.closed, 'and has not closed yet').toHaveLength(0);

    parser.parse('m1', ARTIFACT);

    expect(seen.closed).toEqual(['hello-page']);
    expect(seen.actions.find((action) => action.type === 'file')?.filePath).toBe('index.html');
  });

  it('does not lose a tag split down the middle', () => {
    const seen = recorder();
    const parser = new ArtifactParser({
      callbacks: {
        onArtifactOpen: ({ artifact }) => seen.opened.push({ id: artifact.id, title: artifact.title }),
        onArtifactClose: () => undefined,
        onActionOpen: () => undefined,
        onActionClose: ({ action }) => seen.ran.push(action.type),
      },
    });

    // A chunk boundary inside `<cudeArtifact`.
    const cut = ARTIFACT.indexOf('<cudeArtifact') + 6;

    parser.parse('m1', ARTIFACT.slice(0, cut));
    parser.parse('m1', ARTIFACT);

    expect(seen.opened).toHaveLength(1);
    expect(seen.ran).toEqual(['file', 'shell']);
  });
});

describe('a reply with nothing to write', () => {
  it('opens no workbench and writes no files', () => {
    const seen = recorder();
    const parser = new ArtifactParser({
      callbacks: {
        onArtifactOpen: ({ artifact }) => seen.opened.push({ id: artifact.id, title: artifact.title }),
        onArtifactClose: () => undefined,
        onActionOpen: () => undefined,
        onActionClose: () => undefined,
      },
    });

    const rendered = parser.parse('m1', 'Just a sentence, no code at all.');

    expect(seen.opened).toEqual([]);
    expect(rendered).toBe('Just a sentence, no code at all.');
  });
});
