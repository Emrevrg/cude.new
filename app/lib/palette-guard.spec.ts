/**
 * Cude.new - palette guard.
 *
 * The product palette is monochrome plus a small set of semantic status
 * colours. Purple/violet/magenta accents kept reappearing from upstream code —
 * as Tailwind class names, as hardcoded hex values, and as gradient stops in
 * the hover glow — and each time they were only noticed by eye, in dark mode.
 *
 * This test fails the build instead.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
const SCAN_DIRS = ['app', 'uno.config.ts'];

/** Docs, CI and packaging carry branding too, and regressed there first. */
const BRAND_SCAN_DIRS = ['app', 'docs', '.github', 'scripts'];
const EXTENSIONS = new Set(['.ts', '.tsx', '.scss', '.css', '.md', '.yml', '.yaml', '.sh']);

/**
 * ANSI terminal colours are exempt: magenta is colour 5 of the standard
 * palette, so a program that prints magenta must render magenta. Changing it
 * would be a rendering bug, not de-branding.
 */
const EXEMPT_LINE_PATTERNS = [/--cude-terminal-(bright)?[Mm]agenta/];

/**
 * WebContainer is a runtime this product actually depends on, so pointing users
 * at its own repository for runtime bugs is correct — it is a dependency
 * reference, not leftover product branding.
 */
const EXEMPT_BRAND_PATTERNS = [/webcontainer-core/i, /WebContainer runtime/i];

/** This spec necessarily names the colours it forbids. */
const EXEMPT_FILES = new Set([
  path.join('app', 'lib', 'palette-guard.spec.ts'),

  /*
   * Provenance and notice documents exist precisely to name the upstream
   * project. Failing them for doing their job would be backwards.
   */
  path.join('scripts', 'cude-provenance-verify.mjs'),
]);

function walk(dir: string, out: string[] = []): string[] {
  const full = path.join(ROOT, dir);

  if (!fs.existsSync(full)) {
    return out;
  }

  if (fs.statSync(full).isFile()) {
    out.push(dir);
    return out;
  }

  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(rel, out);
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      out.push(rel);
    }
  }

  return out;
}

function hexToHueSat(hex: string): { hue: number; sat: number; light: number } {
  const h = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) {
    return { hue: 0, sat: 0, light };
  }

  const sat = delta / (1 - Math.abs(2 * light - 1));
  let hue: number;

  if (max === r) {
    hue = ((g - b) / delta) % 6;
  } else if (max === g) {
    hue = (b - r) / delta + 2;
  } else {
    hue = (r - g) / delta + 4;
  }

  return { hue: (((hue * 60) % 360) + 360) % 360, sat, light };
}

const files = SCAN_DIRS.flatMap((d) => walk(d)).filter((f) => !EXEMPT_FILES.has(f));

describe('palette guard', () => {
  it('scans a non-trivial number of files', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('has no purple, violet, indigo or fuchsia utility classes', () => {
    const offenders: string[] = [];
    const named = /\b(purple|violet|indigo|fuchsia)-\d{2,3}\b/;

    for (const file of files) {
      const lines = fs.readFileSync(path.join(ROOT, file), 'utf-8').split('\n');
      lines.forEach((line, i) => {
        if (named.test(line)) {
          offenders.push(`${file}:${i + 1} ${line.trim().slice(0, 80)}`);
        }
      });
    }

    expect(offenders, `purple-family classes:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('has no purple-band hex colours outside the terminal palette', () => {
    const offenders: string[] = [];
    const hexRe = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;

    for (const file of files) {
      const lines = fs.readFileSync(path.join(ROOT, file), 'utf-8').split('\n');

      lines.forEach((line, i) => {
        if (EXEMPT_LINE_PATTERNS.some((p) => p.test(line))) {
          return;
        }

        for (const match of line.matchAll(hexRe)) {
          const { hue, sat, light } = hexToHueSat(match[1]);

          // Saturated colours between blue-violet and magenta.
          if (hue >= 250 && hue <= 330 && sat > 0.15 && light > 0.12 && light < 0.92) {
            offenders.push(`${file}:${i + 1} ${match[0]} (hue ${Math.round(hue)}) ${line.trim().slice(0, 60)}`);
          }
        }
      });
    }

    expect(offenders, `purple-band hex colours:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('carries no upstream product branding', () => {
    const brandFiles = BRAND_SCAN_DIRS.flatMap((d) => walk(d)).filter((f) => !EXEMPT_FILES.has(f));
    const offenders: string[] = [];
    const brand = /stackblitz/i;

    for (const file of brandFiles) {
      const lines = fs.readFileSync(path.join(ROOT, file), 'utf-8').split('\n');
      lines.forEach((line, i) => {
        if (EXEMPT_BRAND_PATTERNS.some((p) => p.test(line))) {
          return;
        }

        if (brand.test(line)) {
          offenders.push(`${file}:${i + 1} ${line.trim().slice(0, 80)}`);
        }
      });
    }

    expect(offenders, `upstream branding:\n${offenders.join('\n')}`).toEqual([]);
  });
});
