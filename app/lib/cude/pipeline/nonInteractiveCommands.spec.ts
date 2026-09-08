/**
 * Cude.new — commands that nobody can answer.
 *
 * The workspace shell has no person at the keyboard. A live run generated a
 * complete, correct countdown-timer app and then sat forever on
 * "Need to install the following packages… Ok to proceed? (y)" — every file
 * written, and no preview, because npx was waiting for a keystroke that could
 * never come.
 */

import { describe, it, expect } from 'vitest';
import { withoutPrompts } from './actionExecutor';

describe('a command bound for a shell with nobody at it', () => {
  it('does not let npx stop to ask', () => {
    expect(withoutPrompts('npx serve .')).toBe('npx --yes serve .');
  });

  it('leaves a command that already says so alone', () => {
    expect(withoutPrompts('npx --yes serve .')).toBe('npx --yes serve .');
    expect(withoutPrompts('npx -y vite build')).toBe('npx -y vite build');
  });

  it('reaches npx after another command', () => {
    expect(withoutPrompts('npm install && npx serve .')).toBe('npm install && npx --yes serve .');
    expect(withoutPrompts('cd app; npx serve .')).toBe('cd app; npx --yes serve .');
  });

  it('handles the scaffolding commands that also prompt', () => {
    expect(withoutPrompts('npm create vite@latest my-app')).toBe('npm create --yes vite@latest my-app');
    expect(withoutPrompts('npm init')).toBe('npm init');
    expect(withoutPrompts('npm init -y')).toBe('npm init -y');
  });

  it('changes nothing else', () => {
    /*
     * Rewriting a command the model asked for is not something to do
     * speculatively — only where its absence is a guaranteed hang.
     */
    const untouched = ['npm install', 'pnpm dev', 'node server.js', 'npm run build', 'echo "npx is mentioned here"'];

    for (const command of untouched) {
      expect(withoutPrompts(command), command).toBe(command);
    }
  });

  it('does not corrupt a multi-line command', () => {
    expect(withoutPrompts('npm install\nnpx serve .')).toBe('npm install\nnpx --yes serve .');
  });
});
