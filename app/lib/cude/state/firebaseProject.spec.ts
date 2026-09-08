/**
 * Cude.new — reading a pasted Firebase config.
 *
 * The console prints a JavaScript object, people paste it with the assignment
 * still attached, and tools hand it over as JSON. All three are the same thing,
 * and this is the one step of the feature, so it has to take all three.
 */

import { describe, expect, it } from 'vitest';
import { parseFirebaseConfig } from './firebaseProject';

const CONSOLE_SNIPPET = `const firebaseConfig = {
  apiKey: "AIzaSyExample",
  authDomain: "demo-app.firebaseapp.com",
  projectId: "demo-app",
  storageBucket: "demo-app.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123:web:abc"
};`;

describe('the shapes people paste', () => {
  it('reads the console snippet, assignment and all', () => {
    const result = parseFirebaseConfig(CONSOLE_SNIPPET);

    expect(result.ok).toBe(true);
    expect(result.config).toMatchObject({
      apiKey: 'AIzaSyExample',
      authDomain: 'demo-app.firebaseapp.com',
      projectId: 'demo-app',
      storageBucket: 'demo-app.appspot.com',
      appId: '1:123:web:abc',
    });
  });

  it('reads plain JSON', () => {
    const json = '{"apiKey":"k","authDomain":"a.firebaseapp.com","projectId":"p"}';

    expect(parseFirebaseConfig(json).config).toMatchObject({ apiKey: 'k', projectId: 'p' });
  });

  it('reads single quotes and a trailing comma', () => {
    const messy = "{ apiKey: 'k', authDomain: 'a.firebaseapp.com', projectId: 'p', }";

    expect(parseFirebaseConfig(messy).ok).toBe(true);
  });

  it('ignores a line comment the console sometimes includes', () => {
    const withComment = `{
      // Your web app's Firebase configuration
      apiKey: "k",
      authDomain: "a.firebaseapp.com",
      projectId: "p"
    }`;

    expect(parseFirebaseConfig(withComment).ok).toBe(true);
  });

  it('reads it out of a larger paste, initialisation included', () => {
    const whole = `import { initializeApp } from "firebase/app";
const firebaseConfig = { apiKey: "k", authDomain: "a.firebaseapp.com", projectId: "p" };
const app = initializeApp(firebaseConfig);`;

    expect(parseFirebaseConfig(whole).config?.projectId).toBe('p');
  });
});

describe('what it refuses', () => {
  it('refuses an empty paste, and says what to do', () => {
    const result = parseFirebaseConfig('   ');

    expect(result.ok).toBe(false);
    expect(result.problem).toMatch(/paste/i);
  });

  it('refuses text with no object in it', () => {
    expect(parseFirebaseConfig('my firebase project is called demo').ok).toBe(false);
  });

  it('names the fields that are missing', () => {
    const result = parseFirebaseConfig('{ "apiKey": "k" }');

    expect(result.ok).toBe(false);
    expect(result.problem).toContain('authDomain');
    expect(result.problem).toContain('projectId');
  });

  it('treats an empty required value as missing', () => {
    const result = parseFirebaseConfig('{ "apiKey": "", "authDomain": "a", "projectId": "p" }');

    expect(result.ok).toBe(false);
    expect(result.problem).toContain('apiKey');
  });

  it('refuses something that is not an object', () => {
    expect(parseFirebaseConfig('[1, 2, 3]').ok).toBe(false);
  });
});

describe('what it keeps', () => {
  it('leaves out optional fields that were not given', () => {
    const config = parseFirebaseConfig('{ "apiKey": "k", "authDomain": "a", "projectId": "p" }').config!;

    expect(config.storageBucket).toBeUndefined();
    expect(config.appId).toBeUndefined();
  });

  it('keeps the realtime database URL when there is one', () => {
    const config = parseFirebaseConfig(
      '{ "apiKey": "k", "authDomain": "a", "projectId": "p", "databaseURL": "https://p.firebaseio.com" }',
    ).config!;

    expect(config.databaseURL).toBe('https://p.firebaseio.com');
  });

  it('does not invent fields that were not in the paste', () => {
    const config = parseFirebaseConfig(CONSOLE_SNIPPET).config!;

    expect(config.measurementId).toBeUndefined();
  });
});
