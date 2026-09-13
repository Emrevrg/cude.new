import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { analyzeNativeBoundary, extractLocalSpecifiers, formatBoundaryReport } from './cude-native-boundary.mjs';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'cude-native-boundary');

test('extracts local static, re-exported, side-effect, and dynamic imports', () => {
  const source = `
    import { one } from '~/native/one';
    import type { Two } from './two';
    import './side-effect';
    export { three } from '../three';
    const four = import('./four');
    const five = require('./five');
    import external from 'external-package';
  `;

  assert.deepEqual(extractLocalSpecifiers(source).sort(), [
    '../three',
    './five',
    './four',
    './side-effect',
    './two',
    '~/native/one',
  ]);
});

test('passes a production graph that stays inside native modules', () => {
  const result = analyzeNativeBoundary({ projectRoot: path.join(FIXTURES, 'clean') });

  assert.equal(result.passed, true);
  assert.equal(result.findings.length, 0);
  assert.ok(result.visitedFiles >= 2);
});

test('fails on a transitive dependency into a forbidden legacy root and prints its chain', () => {
  const result = analyzeNativeBoundary({ projectRoot: path.join(FIXTURES, 'violating') });

  assert.equal(result.passed, false);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].forbiddenRoot, 'app/components/editor');
  assert.deepEqual(result.findings[0].chain, [
    'app/routes/_index.tsx',
    'app/features/studio.ts',
    'app/components/editor/LegacyEditor.tsx',
  ]);
  assert.match(formatBoundaryReport(result), /CUDE NATIVE BOUNDARY FAILED/);
});
