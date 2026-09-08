// Cude.new - fileUtils.ts (Cude product surface, 2026)
import ignore from 'ignore';

// Common patterns to ignore, similar to .gitignore
export const IGNORE_PATTERNS = [
  'node_modules/**',
  '.git/**',
  'dist/**',
  'build/**',
  '.next/**',
  'coverage/**',
  '.cache/**',
  '.vscode/**',
  '.idea/**',
  '**/*.log',
  '**/.DS_Store',
  '**/npm-debug.log*',
  '**/yarn-debug.log*',
  '**/yarn-error.log*',
];

export const MAX_FILES = 1000;
export const ig = ignore().add(IGNORE_PATTERNS);

/** Where the WebContainer mounts the user's project. */
const PROJECT_ROOT = '/home/project/';

/**
 * The project-relative form of a workspace path, or `null` when the path is
 * not inside the project at all.
 *
 * `ignore` refuses an absolute path — it throws
 * ``path should be a `path.relative()`d string`` — and the WebContainer file
 * map legitimately contains entries outside the project root, `/dev` among
 * them. Stripping the prefix with `String.replace` left those untouched and
 * still absolute, so the first `/dev` entry threw and took the whole chat
 * request down; the user saw only "The request could not be completed."
 *
 * Returning `null` rather than throwing lets every caller treat "outside the
 * project" as "not a file to send", which is what it means.
 */
export function toProjectRelativePath(path: string): string | null {
  if (path.startsWith(PROJECT_ROOT)) {
    const relative = path.slice(PROJECT_ROOT.length);
    return relative.length > 0 ? relative : null;
  }

  // Already relative: usable as-is, as long as it does not climb out.
  if (!path.startsWith('/') && !path.startsWith('../')) {
    return path.length > 0 ? path : null;
  }

  return null;
}

/**
 * Whether a workspace path should be sent to the model.
 *
 * Anything outside the project root is excluded, so no absolute path ever
 * reaches `ignore`.
 */
export function isSendableProjectPath(path: string): boolean {
  const relative = toProjectRelativePath(path);
  return relative !== null && !ig.ignores(relative);
}

export const generateId = () => Math.random().toString(36).substring(2, 15);

export const isBinaryFile = async (file: File): Promise<boolean> => {
  const chunkSize = 1024;
  const buffer = new Uint8Array(await file.slice(0, chunkSize).arrayBuffer());

  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i];

    if (byte === 0 || (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13)) {
      return true;
    }
  }

  return false;
};

export const shouldIncludeFile = (path: string): boolean => {
  return isSendableProjectPath(path);
};

const readPackageJson = async (files: File[]): Promise<{ scripts?: Record<string, string> } | null> => {
  const packageJsonFile = files.find((f) => f.webkitRelativePath.endsWith('package.json'));

  if (!packageJsonFile) {
    return null;
  }

  try {
    const content = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(packageJsonFile);
    });

    return JSON.parse(content);
  } catch (error) {
    console.error('Error reading package.json:', error);
    return null;
  }
};

export const detectProjectType = async (
  files: File[],
): Promise<{ type: string; setupCommand: string; followupMessage: string }> => {
  const hasFile = (name: string) => files.some((f) => f.webkitRelativePath.endsWith(name));

  if (hasFile('package.json')) {
    const packageJson = await readPackageJson(files);
    const scripts = packageJson?.scripts || {};

    // Check for preferred commands in priority order
    const preferredCommands = ['dev', 'start', 'preview'];
    const availableCommand = preferredCommands.find((cmd) => scripts[cmd]);

    if (availableCommand) {
      return {
        type: 'Node.js',
        setupCommand: `npm install && npm run ${availableCommand}`,
        followupMessage: `Found "${availableCommand}" script in package.json. Running "npm run ${availableCommand}" after installation.`,
      };
    }

    return {
      type: 'Node.js',
      setupCommand: 'npm install',
      followupMessage:
        'Would you like me to inspect package.json to determine the available scripts for running this project?',
    };
  }

  if (hasFile('index.html')) {
    return {
      type: 'Static',
      setupCommand: 'npx --yes serve',
      followupMessage: '',
    };
  }

  return { type: '', setupCommand: '', followupMessage: '' };
};

export const filesToArtifacts = (files: { [path: string]: { content: string } }, id: string): string => {
  return `
<cudeArtifact id="${id}" title="User Updated Files">
${Object.keys(files)
  .map(
    (filePath) => `
<cudeAction type="file" filePath="${filePath}">
${files[filePath].content}
</cudeAction>
`,
  )
  .join('\n')}
</cudeArtifact>
  `;
};
