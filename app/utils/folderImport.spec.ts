import { describe, it, expect } from 'vitest';
import { buildFolderMessages } from './folderImport';

describe('building import messages from explicit paths', () => {
  it('writes file actions with the given relative paths', async () => {
    const messages = await buildFolderMessages(
      [{ path: 'src/App.tsx', content: 'export default function App() {}' }],
      [],
      'shop',
    );

    expect(messages).toHaveLength(2);
    expect(messages[1].content as string).toContain('filePath="src/App.tsx"');
    expect(messages[1].content as string).toContain('export default function App() {}');
  });

  it('lists skipped binaries', async () => {
    const messages = await buildFolderMessages([{ path: 'a.ts', content: 'x' }], ['logo.png'], 'shop');

    expect(messages[1].content as string).toContain('logo.png');
  });
});
