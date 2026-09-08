// Cude.new - diff.spec.ts (Cude product surface, 2026)
/**
 * Cude.new - the file-modifications tag.
 *
 * The tag was renamed from the upstream name. Conversations saved before the
 * rename still carry the old one, so the stripper has to read both; the writer
 * only ever emits the current one. Without the first half, an old conversation
 * would render its raw tags back at the user.
 */

import { describe, it, expect } from 'vitest';
import { modificationsRegex, extractRelativePath } from './diff';
import { MODIFICATIONS_TAG_NAME, WORK_DIR } from '~/lib/cude/constants';

function strip(text: string): string {
  return text.replace(modificationsRegex, '');
}

describe('the tag names', () => {
  it('writes under Cude’s own name', () => {
    expect(MODIFICATIONS_TAG_NAME).toBe('cude_file_modifications');
  });
});

describe('stripping', () => {
  it('removes a current-format block', () => {
    const text = `<${MODIFICATIONS_TAG_NAME}>\n<file path="a.ts">x</file>\n</${MODIFICATIONS_TAG_NAME}>\n\nHello`;

    expect(strip(text)).toBe('Hello');
  });

  it('only strips a block at the start of the message', () => {
    const text = `Hello\n<${MODIFICATIONS_TAG_NAME}>x</${MODIFICATIONS_TAG_NAME}>\n\n`;

    expect(strip(text)).toBe(text);
  });

  it('leaves an ordinary message alone', () => {
    expect(strip('Just a message about <files> and things.')).toBe('Just a message about <files> and things.');
  });

  it('handles a multi-line block', () => {
    const text = [
      `<${MODIFICATIONS_TAG_NAME}>`,
      '<diff path="/home/project/a.ts">',
      '@@ -1 +1 @@',
      '-one',
      '+two',
      '</diff>',
      `</${MODIFICATIONS_TAG_NAME}>`,
      '',
      'Now the message.',
    ].join('\n');

    expect(strip(text)).toBe('Now the message.');
  });
});

describe('paths', () => {
  it('reports a workspace file by its path within the project', () => {
    expect(extractRelativePath(`${WORK_DIR}/index.js`)).toBe('index.js');
  });

  it('leaves a path that is already relative alone', () => {
    expect(extractRelativePath('src/App.tsx')).toBe('src/App.tsx');
  });

  it('handles a nested workspace path', () => {
    expect(extractRelativePath(`${WORK_DIR}/src/components/Nav.tsx`)).toBe('src/components/Nav.tsx');
  });
});
