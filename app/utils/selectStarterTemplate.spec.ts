/**
 * Cude.new — choosing a starter template.
 *
 * The parser reads a field of a JSON response that is only a string when the
 * request worked. On a machine with no key configured it is an error object,
 * and the parser used to call `.match` on it and throw on the first message
 * anyone ever sent.
 */

import { describe, expect, it } from 'vitest';
import { parseSelectedTemplate } from './selectStarterTemplate';

describe('reading the choice', () => {
  it('reads the template and the title', () => {
    const reply = '<selection><templateName>react-basic-starter</templateName><title>A todo app</title></selection>';

    expect(parseSelectedTemplate(reply)).toEqual({ template: 'react-basic-starter', title: 'A todo app' });
  });

  it('trims what the model padded', () => {
    const reply = '<templateName>  blank  </templateName><title>  Script  </title>';

    expect(parseSelectedTemplate(reply)).toEqual({ template: 'blank', title: 'Script' });
  });

  it('names an untitled project rather than leaving it empty', () => {
    expect(parseSelectedTemplate('<templateName>blank</templateName>')?.title).toBe('Untitled Project');
  });

  it('reads a reply that came wrapped in prose', () => {
    const reply = 'Sure!\n<selection>\n<templateName>vite-react</templateName>\n</selection>\nHope that helps.';

    expect(parseSelectedTemplate(reply)?.template).toBe('vite-react');
  });
});

describe('replies that are not a choice', () => {
  it('declines a reply with no selection in it', () => {
    expect(parseSelectedTemplate('I am not sure what you mean.')).toBeNull();
  });

  it('declines an empty reply', () => {
    expect(parseSelectedTemplate('')).toBeNull();
  });

  it('declines the error object an unconfigured provider returns', () => {
    expect(parseSelectedTemplate({ error: 'Missing API key' })).toBeNull();
  });

  it('declines a missing field rather than throwing', () => {
    expect(parseSelectedTemplate(undefined)).toBeNull();
    expect(parseSelectedTemplate(null)).toBeNull();
  });

  it('declines a number, an array and a boolean', () => {
    expect(parseSelectedTemplate(42)).toBeNull();
    expect(parseSelectedTemplate([])).toBeNull();
    expect(parseSelectedTemplate(false)).toBeNull();
  });
});
