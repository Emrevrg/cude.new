import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
import { ModelGateway, OpenAICompatibleAdapter, type ModelStreamEvent } from '~/lib/cude/native/model';
import { workspacePath } from '~/lib/cude/native/workspace';

type NativeFile = { path: string; content: string };

const MAX_FILES = 80;
const MAX_FILE_BYTES = 750_000;
const MAX_CONTEXT_BYTES = 160_000;

export async function action({ request }: ActionFunctionArgs) {
  try {
    const body: unknown = await request.json();
    const input = parseRequest(body);
    const endpoint = completionEndpoint(input.baseUrl);
    const context = input.files
      .map((file) => `--- ${file.path} ---\n${file.content}`)
      .join('\n\n')
      .slice(0, MAX_CONTEXT_BYTES);

    const gateway = new ModelGateway([
      new OpenAICompatibleAdapter({ endpoint, ...(input.apiKey ? { apiKey: input.apiKey } : {}) }),
    ]);
    const stream = gateway.openStream(
      {
        requestId: crypto.randomUUID(),
        target: { providerId: 'openai-compatible', modelId: input.model },
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: [
              {
                type: 'text',
                text: 'You are the Cude build engine. Return JSON only: {"summary":"...","files":[{"path":"relative/path","content":"complete file"}]}. Paths must be relative and safe. Return only files that should be created or replaced. Do not use markdown fences.',
              },
            ],
          },
          {
            role: 'user',
            content: [{ type: 'text', text: `${input.prompt}\n\nCURRENT PROJECT\n${context || '(empty project)'}` }],
          },
        ],
      },
      { signal: AbortSignal.timeout(180_000) },
    );
    const content = await collectText(stream.events);
    const result = parseBuildResult(content);

    return json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Native build request failed.';
    return json({ error: message }, { status: 400 });
  }
}

function parseRequest(value: unknown): {
  baseUrl: string;
  apiKey?: string;
  model: string;
  prompt: string;
  files: NativeFile[];
} {
  if (!isRecord(value)) {
    throw new Error('Request body must be an object.');
  }

  const baseUrl = requiredString(value.baseUrl, 'Model endpoint');
  const model = requiredString(value.model, 'Model');
  const prompt = requiredString(value.prompt, 'Build instruction');
  const apiKey = typeof value.apiKey === 'string' ? value.apiKey.trim() : undefined;
  const files = Array.isArray(value.files) ? value.files.map(parseFile) : [];

  if (files.length > MAX_FILES) {
    throw new Error(`A native run accepts at most ${MAX_FILES} files.`);
  }

  return { baseUrl, model, prompt, files, ...(apiKey ? { apiKey } : {}) };
}

function completionEndpoint(baseUrl: string): string {
  const url = new URL(baseUrl);
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';

  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new Error('Use HTTPS, or HTTP only for a local model endpoint.');
  }

  url.pathname = `${url.pathname.replace(/\/$/, '')}/chat/completions`;
  url.search = '';
  url.hash = '';

  return url.toString();
}

function parseFile(value: unknown): NativeFile {
  if (!isRecord(value)) {
    throw new Error('Every file must be an object.');
  }

  const path = workspacePath(requiredString(value.path, 'File path'));
  const content = typeof value.content === 'string' ? value.content : '';

  if (new TextEncoder().encode(content).byteLength > MAX_FILE_BYTES) {
    throw new Error(`File is too large: ${path}`);
  }

  return { path, content };
}

function parseBuildResult(content: string): { summary: string; files: NativeFile[] } {
  const firstBrace = content.indexOf('{');
  const lastBrace = content.lastIndexOf('}');

  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new Error('The model did not return a Cude build result.');
  }

  const value: unknown = JSON.parse(content.slice(firstBrace, lastBrace + 1));

  if (!isRecord(value) || !Array.isArray(value.files)) {
    throw new Error('The model returned an invalid Cude build result.');
  }

  const files = value.files.map(parseFile);

  if (files.length > MAX_FILES) {
    throw new Error(`The model returned more than ${MAX_FILES} files.`);
  }

  return {
    summary: typeof value.summary === 'string' ? value.summary.slice(0, 2_000) : 'Build completed.',
    files,
  };
}

async function collectText(events: AsyncIterable<ModelStreamEvent>): Promise<string> {
  let content = '';

  for await (const event of events) {
    if (event.type === 'text-delta') {
      content += event.text;
    } else if (event.type === 'failed') {
      throw new Error(event.error.message);
    }
  }

  return requiredString(content, 'Model response');
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required.`);
  }

  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
