/**
 * Cude.new - diagnostic report behaviour.
 *
 * A diagnostic report is the file people attach to public bug reports, so the
 * tests that matter are the ones about what must not be in it.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildReport, serializeReport, reportFilename, describeEnvironment } from './diagnostics';
import { cudeEventLog } from './eventLog';

beforeEach(() => {
  cudeEventLog.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the report', () => {
  it('names its format and version so a reader knows what it has', () => {
    expect(buildReport()).toMatchObject({ format: 'cude.diagnostics', version: 1 });
  });

  it('carries the journal', () => {
    cudeEventLog.append({ level: 'error', source: 'build', message: 'compilation failed' });

    expect(buildReport().events.map((event) => event.message)).toContain('compilation failed');
  });

  it('stamps when it was made', () => {
    const at = new Date('2026-05-06T07:08:09.010Z');

    expect(buildReport('0.1.0', at).generatedAt).toBe(at.toISOString());
  });

  it('names the file after the moment it was made', () => {
    expect(reportFilename(new Date('2026-05-06T07:08:09.010Z'))).toBe('cude-diagnostics-2026-05-06T07-08-09-010Z.json');
  });
});

describe('what it must not contain', () => {
  it('drops a token that reached the journal detail', () => {
    cudeEventLog.append({
      level: 'error',
      source: 'settings',
      message: 'connection failed',
      detail: { apiKey: 'sk-ant-000000000000000000' },
    });

    const text = serializeReport(buildReport());

    expect(text).not.toContain('sk-ant-000000000000000000');
    expect(text).not.toContain('apiKey');
  });

  it('drops a secret-shaped string even under an innocent key', () => {
    cudeEventLog.append({
      level: 'info',
      source: 'system',
      message: 'started',
      detail: { note: 'ghp_abcdefghijklmnopqrstuvwxyz0123456789' },
    });

    expect(serializeReport(buildReport())).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz0123456789');
  });
});

describe('the environment section', () => {
  it('describes the browser when there is one', () => {
    vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 2 });
    vi.stubGlobal('navigator', { userAgent: 'test-agent', language: 'tr-TR', platform: 'Win32', onLine: true });
    vi.stubGlobal('document', { documentElement: { getAttribute: () => 'dark' } });
    vi.stubGlobal('localStorage', {
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });

    expect(describeEnvironment()).toMatchObject({
      userAgent: 'test-agent',
      language: 'tr-TR',
      viewport: { width: 1280, height: 800 },
      theme: 'dark',
      storageAvailable: true,
    });
  });

  it('reports storage as unavailable rather than throwing when it is blocked', () => {
    vi.stubGlobal('window', { innerWidth: 1, innerHeight: 1, devicePixelRatio: 1 });
    vi.stubGlobal('navigator', { userAgent: 'x', language: 'x', platform: 'x', onLine: false });
    vi.stubGlobal('document', { documentElement: { getAttribute: () => null } });
    vi.stubGlobal('localStorage', {
      setItem: vi.fn(() => {
        throw new Error('blocked');
      }),
      removeItem: vi.fn(),
    });

    expect(describeEnvironment()).toMatchObject({ storageAvailable: false, theme: 'system' });
  });

  it('says so plainly when there is no browser at all', () => {
    expect(describeEnvironment().platform).toBe('server');
  });
});

describe('serialization', () => {
  it('is indented, because a person reads this file', () => {
    expect(serializeReport(buildReport())).toContain('\n  ');
  });

  it('ends with a newline', () => {
    expect(serializeReport(buildReport()).endsWith('\n')).toBe(true);
  });

  it('round-trips as JSON', () => {
    cudeEventLog.append({ level: 'info', source: 'system', message: 'hello' });

    expect(() => JSON.parse(serializeReport(buildReport()))).not.toThrow();
  });
});
