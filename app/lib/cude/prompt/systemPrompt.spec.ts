/**
 * Cude.new - system prompt contract.
 *
 * The prompt is product behaviour, so it is tested like product behaviour. What
 * matters is not wording but that the instructions the pipeline depends on are
 * actually present, and that credentials never reach the model.
 */

import { describe, it, expect } from 'vitest';
import { getCudeSystemPrompt, PROTOCOL } from './systemPrompt';
import type { DesignScheme } from '~/types/design-scheme';

const cwd = '/home/project';

describe('Cude system prompt', () => {
  it('describes the Cude pipeline, not a generic file generator', () => {
    const prompt = getCudeSystemPrompt({ cwd });

    for (const stage of [
      'REQUIREMENTS',
      'TARGETS',
      'STACK',
      'PRODUCT GRAPH',
      'ARCHITECTURE',
      'DESIGN CONTRACT',
      'DESIGN REVIEW',
      'BUILD',
      'TEST',
      'VISUAL QA',
      'REVIEW',
      'REPAIR',
    ]) {
      expect(prompt, `missing pipeline stage ${stage}`).toContain(stage);
    }
  });

  it('states the approval gate, which is the product defining behaviour', () => {
    const prompt = getCudeSystemPrompt({ cwd });

    expect(prompt).toMatch(/do\s+not\s+write\s+application\s+code\s+before\s+the\s+user\s+has\s+approved/i);
    expect(prompt).toMatch(/headless/i);
  });

  it('treats a product as potentially more than one target', () => {
    const prompt = getCudeSystemPrompt({ cwd });

    expect(prompt).toMatch(/desktop/i);
    expect(prompt).toMatch(/mobile/i);
    expect(prompt).toMatch(/more\s+than\s+one\s+target/i);
  });

  it('carries the workspace path and the wire protocol the parser expects', () => {
    const prompt = getCudeSystemPrompt({ cwd });

    expect(prompt).toContain(cwd);
    expect(prompt).toContain(`<${PROTOCOL.artifactOpen}`);
    expect(prompt).toContain(`<${PROTOCOL.actionOpen}`);
  });

  it('forbids eliding file contents, which would corrupt written files', () => {
    const prompt = getCudeSystemPrompt({ cwd });

    expect(prompt).toMatch(/COMPLETE contents/);
    expect(prompt).toMatch(/rest of the file unchanged/);
  });

  it('separates a dev server from a command that must exit', () => {
    const prompt = getCudeSystemPrompt({ cwd });

    // A dev server issued as `shell` blocks the pipeline forever.
    expect(prompt).toMatch(/start.*dev server|dev server.*start/is);
    expect(prompt).toMatch(/never\s+exits/i);
  });

  it('forbids claiming success for a run that failed', () => {
    const prompt = getCudeSystemPrompt({ cwd });

    expect(prompt).toMatch(/never\s+describe\s+a\s+build,\s+a\s+test\s+run\s+or\s+a\s+deployment\s+as\s+successful/i);
  });

  describe('design contract', () => {
    const scheme: DesignScheme = {
      palette: { primary: '#101010', surface: '#FFFFFF' },
      features: ['rounded'],
      font: ['Inter'],
    };

    it('says no contract is approved when none exists', () => {
      const prompt = getCudeSystemPrompt({ cwd });

      expect(prompt).toMatch(/no\s+design\s+contract\s+has\s+been\s+approved/i);
    });

    it('keeps explicit light visual requirements binding when review is skipped', () => {
      const prompt = getCudeSystemPrompt({ cwd });

      expect(prompt).toMatch(/default Cude surface is a comfortable light\s+theme/i);
      expect(prompt).toMatch(/all-dark interface/i);
      expect(prompt).toMatch(/dark mode/i);
    });

    it('inlines an approved contract and forbids improvising outside it', () => {
      const prompt = getCudeSystemPrompt({ cwd, designScheme: scheme });

      expect(prompt).toContain('#101010');
      expect(prompt).toContain('Inter');
      expect(prompt).toMatch(/do\s+not\s+introduce\s+colours,\s+fonts/i);
      expect(prompt).not.toMatch(/no\s+design\s+contract\s+has\s+been\s+approved/i);
    });
  });

  describe('database', () => {
    it('tells the model not to scaffold persistence when nothing is connected', () => {
      const prompt = getCudeSystemPrompt({ cwd });

      expect(prompt).toMatch(/no\s+database\s+is\s+connected/i);
    });

    it('asks for a project when the provider is connected but none is selected', () => {
      const prompt = getCudeSystemPrompt({ cwd, database: { isConnected: true, hasSelectedProject: false } });

      expect(prompt).toMatch(/no\s+project\s+is\s+selected/i);
    });

    it('requires safe migrations and row-level security once connected', () => {
      const prompt = getCudeSystemPrompt({ cwd, database: { isConnected: true, hasSelectedProject: true } });

      expect(prompt).toMatch(/never\s+alter\s+an\s+existing\s+migration/i);
      expect(prompt).toMatch(/row-level\s+security/i);
      expect(prompt).toMatch(/never\s+write\s+a\s+destructive\s+statement/i);
    });
  });

  it('never carries credentials into the prompt', () => {
    /*
     * The inherited prompt interpolated live database credentials into the
     * system message, which put them in every request and in any transcript the
     * user exported. The Cude prompt takes only connection booleans.
     */
    const prompt = getCudeSystemPrompt({
      cwd,
      database: { isConnected: true, hasSelectedProject: true },
    });

    expect(prompt).not.toMatch(/anonKey|service_role|eyJ[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9]{10,}/);
  });

  it('restricts HTML to the elements the renderer allows', () => {
    const prompt = getCudeSystemPrompt({ cwd, allowedHtmlElements: ['b', 'code'] });

    expect(prompt).toContain('b, code');
  });
});
