import { describe, expect, it } from 'vitest';
import { commonArchiveRoot, looksBinary, parseGitHubRepository } from '~/routes/api.native-git-import';

describe('native Git import guardrails', () => {
  it('accepts normalized HTTPS GitHub repository URLs and optional revisions', () => {
    expect(parseGitHubRepository('https://github.com/cude/new.git')).toEqual({
      owner: 'cude',
      name: 'new',
      ref: 'HEAD',
    });
    expect(parseGitHubRepository('https://github.com/cude/new#release/v2')).toEqual({
      owner: 'cude',
      name: 'new',
      ref: 'release/v2',
    });
  });

  it('rejects non-GitHub, insecure and malformed repository locations', () => {
    expect(() => parseGitHubRepository('http://github.com/cude/new')).toThrow(/HTTPS GitHub/i);
    expect(() => parseGitHubRepository('https://example.com/cude/new')).toThrow(/HTTPS GitHub/i);
    expect(() => parseGitHubRepository('https://github.com/only-owner')).toThrow(/invalid/i);
  });

  it('removes only a root shared by every archive entry', () => {
    expect(commonArchiveRoot(['archive-a/src/a.ts', 'archive-a/README.md'])).toBe('archive-a/');
    expect(commonArchiveRoot(['first/a.ts', 'second/b.ts'])).toBe('');
  });

  it('detects null-byte binary samples', () => {
    expect(looksBinary(new Uint8Array([65, 66, 67]))).toBe(false);
    expect(looksBinary(new Uint8Array([65, 0, 67]))).toBe(true);
  });
});
