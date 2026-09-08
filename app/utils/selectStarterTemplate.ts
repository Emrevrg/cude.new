// Cude.new - selectStarterTemplate.ts (Cude product surface, 2026)
import ignore from 'ignore';
import type { ProviderInfo } from '~/types/model';
import type { Template } from '~/types/template';
import { STARTER_TEMPLATES } from './constants';

const starterTemplateSelectionPrompt = (templates: Template[]) => `
You are an experienced developer who helps people choose the best starter template for their projects.
IMPORTANT: Vite is preferred
IMPORTANT: Only choose shadcn templates if the user explicitly asks for shadcn.

Available templates:
<template>
  <name>blank</name>
  <description>Empty starter for simple scripts and trivial tasks that don't require a full template setup</description>
  <tags>basic, script</tags>
</template>
${templates
  .map(
    (template) => `
<template>
  <name>${template.name}</name>
  <description>${template.description}</description>
  ${template.tags ? `<tags>${template.tags.join(', ')}</tags>` : ''}
</template>
`,
  )
  .join('\n')}

Response Format:
<selection>
  <templateName>{selected template name}</templateName>
  <title>{a proper title for the project}</title>
</selection>

Examples:

<example>
User: I need to build a todo app
Response:
<selection>
  <templateName>react-basic-starter</templateName>
  <title>Simple React todo application</title>
</selection>
</example>

<example>
User: Write a script to generate numbers from 1 to 100
Response:
<selection>
  <templateName>blank</templateName>
  <title>script to generate numbers from 1 to 100</title>
</selection>
</example>

Instructions:
1. For trivial tasks and simple scripts, always recommend the blank template
2. For more complex projects, recommend templates from the provided list
3. Follow the exact XML format
4. Consider both technical requirements and tags
5. If no perfect match exists, recommend the closest option

Important: Provide only the selection tags in your response, no additional text.
MOST IMPORTANT: YOU DONT HAVE TIME TO THINK JUST START RESPONDING BASED ON HUNCH 
`;

const templates: Template[] = STARTER_TEMPLATES.filter((t) => !t.name.includes('shadcn'));

/** How long the send will wait for a template to be chosen before giving up. */
const TEMPLATE_CHOICE_BUDGET_MS = 6000;

/**
 * Reads the model's choice out of its reply.
 *
 * Takes `unknown` because the caller's input is a field of a JSON response
 * that is only a string when the request succeeded — an unconfigured provider
 * answers with an error object instead, and this used to crash on it.
 */
export const parseSelectedTemplate = (llmOutput: unknown): { template: string; title: string } | null => {
  if (typeof llmOutput !== 'string') {
    return null;
  }

  const templateNameMatch = llmOutput.match(/<templateName>(.*?)<\/templateName>/);

  if (!templateNameMatch) {
    return null;
  }

  const titleMatch = llmOutput.match(/<title>(.*?)<\/title>/);

  return { template: templateNameMatch[1].trim(), title: titleMatch?.[1].trim() || 'Untitled Project' };
};

export const selectStarterTemplate = async (options: { message: string; model: string; provider: ProviderInfo }) => {
  const { message, model, provider } = options;
  const requestBody = {
    message,
    model,
    provider,
    system: starterTemplateSelectionPrompt(templates),
  };

  /*
   * Bounded, because this sits in front of the person's message.
   *
   * Choosing a starter template is a model call, and the send waits for it: on
   * a slow provider — or one that simply never answers — the message was never
   * dispatched at all. A prompt would sit on screen with the pipeline badge
   * turning and nothing behind it. A template is a convenience; getting the
   * message to the model is the product. So it gets a few seconds, and if it
   * has not decided by then the build starts blank.
   */
  let response: Response;

  try {
    response = await fetch('/api/llmcall', {
      method: 'POST',
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(TEMPLATE_CHOICE_BUDGET_MS),
    });
  } catch {
    return { template: 'blank', title: '' };
  }

  /*
   * A provider that is not set up answers with an error, not a selection.
   * That is an ordinary state on a fresh install, so it falls through to the
   * blank template rather than being reported as a failure.
   */
  const selection = response.ok ? parseSelectedTemplate(((await response.json()) as { text?: unknown }).text) : null;

  return selection ?? { template: 'blank', title: '' };
};

const getGitHubRepoContent = async (repoName: string): Promise<{ name: string; path: string; content: string }[]> => {
  /*
   * Cude templates live under cude-new/*. Upstream slugs no longer exist in
   * this codebase; any repo that cannot be fetched simply yields no files
   * rather than breaking the import. The caller treats that as an empty
   * template and the build starts from a minimal Vite scaffold instead.
   */
  try {
    const response = await fetch(`/api/github-template?repo=${encodeURIComponent(repoName)}`, {
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      return [];
    }

    const files = (await response.json()) as any;

    return Array.isArray(files) ? files : [];
  } catch {
    return [];
  }
};

export async function getTemplates(templateName: string, title?: string) {
  const template = STARTER_TEMPLATES.find((t) => t.name == templateName);

  if (!template) {
    return null;
  }

  const githubRepo = template.githubRepo;
  const files = await getGitHubRepoContent(githubRepo);

  let filteredFiles = files;

  /*
   * ignoring common unwanted files
   * exclude    .git
   */
  filteredFiles = filteredFiles.filter((x) => x.path.startsWith('.git') == false);

  /*
   * exclude    lock files
   * WE NOW INCLUDE LOCK FILES FOR IMPROVED INSTALL TIMES
   */
  {
    /*
     *const comminLockFiles = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];
     *filteredFiles = filteredFiles.filter((x) => comminLockFiles.includes(x.name) == false);
     */
  }

  /*
   * Cude templates keep import instructions in `.cude`. No predecessor name
   * is supported — this is an original product, not a fork.
   */
  const isTemplateConfig = (path: string) => /^\.cude(?:\/|$)/.test(path);
  const toCudePath = (path: string) => path;

  /*
   * Preserve the template metadata folder for reproducibility, but give it a
   * CUDE path before it becomes part of the workspace.
   */
  filteredFiles = filteredFiles.map((file) => ({ ...file, path: toCudePath(file.path) }));

  const templateIgnoreFile = files.find((file) => isTemplateConfig(file.path) && file.name === 'ignore');

  const filesToImport = {
    files: filteredFiles,
    ignoreFile: [] as typeof filteredFiles,
  };

  if (templateIgnoreFile) {
    // redacting files specified in ignore file
    const ignorepatterns = templateIgnoreFile.content.split('\n').map((x) => x.trim());
    const ig = ignore().add(ignorepatterns);

    // filteredFiles = filteredFiles.filter(x => !ig.ignores(x.path))
    const ignoredFiles = filteredFiles.filter((x) => ig.ignores(x.path));

    filesToImport.files = filteredFiles;
    filesToImport.ignoreFile = ignoredFiles;
  }

  const assistantMessage = `
Cude is initializing your project with the required files using the ${template.name} template.
<cudeArtifact id="imported-files" title="${title || 'Create initial files'}" type="bundled">
${filesToImport.files
  .map(
    (file) =>
      `<cudeAction type="file" filePath="${file.path}">
${file.content}
</cudeAction>`,
  )
  .join('\n')}
</cudeArtifact>
`;
  let userMessage = ``;
  const templatePromptFile = files.filter((file) => isTemplateConfig(file.path)).find((file) => file.name === 'prompt');

  if (templatePromptFile) {
    userMessage = `
TEMPLATE INSTRUCTIONS:
${templatePromptFile.content}

---
`;
  }

  if (filesToImport.ignoreFile.length > 0) {
    userMessage =
      userMessage +
      `
STRICT FILE ACCESS RULES - READ CAREFULLY:

The following files are READ-ONLY and must never be modified:
${filesToImport.ignoreFile.map((file) => `- ${file.path}`).join('\n')}

Permitted actions:
✓ Import these files as dependencies
✓ Read from these files
✓ Reference these files

Strictly forbidden actions:
❌ Modify any content within these files
❌ Delete these files
❌ Rename these files
❌ Move these files
❌ Create new versions of these files
❌ Suggest changes to these files

Any attempt to modify these protected files will result in immediate termination of the operation.

If you need to make changes to functionality, create new files instead of modifying the protected ones listed above.
---
`;
  }

  userMessage += `
---
template import is done, and you can now use the imported files,
edit only the files that need to be changed, and you can create new files as needed.
NO NOT EDIT/WRITE ANY FILES THAT ALREADY EXIST IN THE PROJECT AND DOES NOT NEED TO BE MODIFIED
---
Now that the Template is imported please continue with my original request

IMPORTANT: Dont Forget to install the dependencies before running the app by using \`npm install && npm run dev\`
`;

  return {
    assistantMessage,
    userMessage,
  };
}
