/**
 * Cude.new - a diagnostic report.
 *
 * What a person attaches to a bug report: what Cude recorded, and enough about
 * the machine to reproduce it. Built from the event journal rather than a
 * second capture layer, so there is one record of what happened and one place
 * where redaction is applied.
 *
 * The journal it draws on redacts on write. The inherited debug logger had its
 * own capture of console output and every network URL with no redaction at all,
 * which is a file that can carry a token in a query string straight into an
 * issue tracker.
 */

import { cudeEventLog, type CudeEvent } from './eventLog';
import { toJson } from './eventLogExport';
import { stripSecrets } from '~/lib/cude/projectManifest';

export interface EnvironmentInfo {
  userAgent: string;
  language: string;
  platform: string;
  viewport: { width: number; height: number };
  devicePixelRatio: number;
  online: boolean;
  storageAvailable: boolean;
  theme: string;
}

export interface DiagnosticReport {
  format: 'cude.diagnostics';
  version: 1;
  generatedAt: string;
  app: { name: string; version: string };
  environment: EnvironmentInfo;
  events: CudeEvent[];
}

function storageAvailable(): boolean {
  try {
    const probe = '__cude_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);

    return true;
  } catch {
    return false;
  }
}

/** What can be read about the browser without asking for a permission. */
export function describeEnvironment(): EnvironmentInfo {
  if (typeof window === 'undefined') {
    return {
      userAgent: 'server',
      language: 'unknown',
      platform: 'server',
      viewport: { width: 0, height: 0 },
      devicePixelRatio: 1,
      online: false,
      storageAvailable: false,
      theme: 'unknown',
    };
  }

  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    devicePixelRatio: window.devicePixelRatio,
    online: navigator.onLine,
    storageAvailable: storageAvailable(),
    theme: document.documentElement.getAttribute('data-theme') ?? 'system',
  };
}

export function buildReport(version = '0.1.0', at: Date = new Date()): DiagnosticReport {
  const report: DiagnosticReport = {
    format: 'cude.diagnostics',
    version: 1,
    generatedAt: at.toISOString(),
    app: { name: 'Cude.new', version },
    environment: describeEnvironment(),
    events: cudeEventLog.events,
  };

  // The journal redacts on write; this is the second gate before a file leaves.
  return stripSecrets(report);
}

export function reportFilename(at: Date = new Date()): string {
  return `cude-diagnostics-${at.toISOString().replace(/[:.]/g, '-')}.json`;
}

export function serializeReport(report: DiagnosticReport): string {
  /*
   * The events are serialized by the journal's own writer so the two exports
   * cannot drift into different shapes for the same data.
   */
  const { events, ...rest } = report;

  return `${JSON.stringify({ ...rest, events: JSON.parse(toJson(events)) }, null, 2)}\n`;
}

/** Hands the report to the browser as a download. */
export function downloadReport(version?: string): string {
  const report = buildReport(version);
  const filename = reportFilename(new Date(report.generatedAt));
  const url = URL.createObjectURL(new Blob([serializeReport(report)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);

  return filename;
}
