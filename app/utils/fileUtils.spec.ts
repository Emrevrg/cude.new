import { describe, expect, it } from 'vitest';
import { isSendableProjectPath, shouldIncludeFile, toProjectRelativePath } from './fileUtils';

/*
 * Regression cover for the chat request dying on a WebContainer path.
 *
 * The file map handed to the server legitimately contains entries outside the
 * project root — `/dev` among them. The old filter stripped the project prefix
 * with `String.replace`, which left those paths absolute, and `ignore` throws
 * on an absolute path. One `/dev` entry therefore aborted the whole request and
 * the user was told only "The request could not be completed."
 */
describe('workspace path filtering', () => {
  describe('toProjectRelativePath', () => {
    it('strips the project root', () => {
      expect(toProjectRelativePath('/home/project/src/index.ts')).toBe('src/index.ts');
    });

    it('rejects a path outside the project rather than returning it unchanged', () => {
      // The exact input that used to reach `ignore` and throw.
      expect(toProjectRelativePath('/dev')).toBeNull();
      expect(toProjectRelativePath('/dev/null')).toBeNull();
      expect(toProjectRelativePath('/etc/passwd')).toBeNull();
      expect(toProjectRelativePath('/home/other/file.ts')).toBeNull();
    });

    it('rejects the project root itself, which names no file', () => {
      expect(toProjectRelativePath('/home/project/')).toBeNull();
    });

    it('passes an already-relative path through', () => {
      expect(toProjectRelativePath('src/app.tsx')).toBe('src/app.tsx');
    });

    it('rejects a relative path that climbs out of the project', () => {
      expect(toProjectRelativePath('../secrets.env')).toBeNull();
    });

    it('rejects an empty path', () => {
      expect(toProjectRelativePath('')).toBeNull();
    });
  });

  describe('isSendableProjectPath', () => {
    it('never throws on a path outside the project', () => {
      // Throwing here is the actual defect; the assertion is that it does not.
      expect(() => isSendableProjectPath('/dev')).not.toThrow();
      expect(isSendableProjectPath('/dev')).toBe(false);
    });

    it('keeps ordinary project files', () => {
      expect(isSendableProjectPath('/home/project/src/index.ts')).toBe(true);
      expect(isSendableProjectPath('/home/project/package.json')).toBe(true);
    });

    it('still applies the ignore patterns', () => {
      expect(isSendableProjectPath('/home/project/node_modules/react/index.js')).toBe(false);
      expect(isSendableProjectPath('/home/project/dist/bundle.js')).toBe(false);
      expect(isSendableProjectPath('/home/project/.git/HEAD')).toBe(false);
      expect(isSendableProjectPath('/home/project/debug.log')).toBe(false);
    });

    it('survives a whole file map containing device entries', () => {
      const paths = [
        '/home/project/src/main.tsx',
        '/dev',
        '/dev/stdout',
        '/home/project/node_modules/lodash/index.js',
        '/home/project/README.md',
        '/proc/self',
      ];

      expect(() => paths.filter(isSendableProjectPath)).not.toThrow();
      expect(paths.filter(isSendableProjectPath)).toEqual(['/home/project/src/main.tsx', '/home/project/README.md']);
    });
  });

  describe('shouldIncludeFile', () => {
    it('shares the same guard, so an absolute path cannot reach ignore', () => {
      expect(() => shouldIncludeFile('/dev')).not.toThrow();
      expect(shouldIncludeFile('/dev')).toBe(false);
      expect(shouldIncludeFile('src/index.ts')).toBe(true);
      expect(shouldIncludeFile('node_modules/react/index.js')).toBe(false);
    });
  });
});
