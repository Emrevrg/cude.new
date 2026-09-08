/**
 * Cude.new - model servers running on your own machine.
 *
 * A local provider differs from a hosted one in exactly two ways: there is no
 * key, and it can simply not be running. Both of those are questions about a
 * URL, so this asks them — is anything there, and what models does it offer —
 * and says what to do when the answer is no.
 *
 * The subsystem it replaces was ten files: a polling service built on its own
 * event emitter, a hook wrapping the service, a dashboard, a badge, a skeleton,
 * an error boundary and a six-hundred-line setup guide.
 */

import { map } from 'nanostores';

export type LocalProviderId = 'Ollama' | 'LMStudio' | 'OpenAILike' | 'vLLM' | 'llama.cpp' | 'Jan' | 'LiteLLM';

export interface LocalModel {
  name: string;

  /** Size on disk, when the server reports one. */
  size?: number;
}

export type Reachability = 'unknown' | 'checking' | 'running' | 'unreachable';

export interface LocalProviderState {
  reachability: Reachability;
  models: LocalModel[];

  /** Server version, when it says. */
  version?: string;
  error?: string;
  checkedAt?: string;
}

export interface LocalProviderDescriptor {
  id: LocalProviderId;
  label: string;
  defaultBaseUrl: string;

  /** What it is, in one line. */
  summary: string;

  /** What to do when nothing answers at the URL. */
  setup: string[];

  /** Where to get it. */
  homepage?: string;

  /** Asks the server what it is and what it holds. */
  probe(baseUrl: string, signal: AbortSignal): Promise<{ models: LocalModel[]; version?: string }>;
}

const EMPTY: LocalProviderState = { reachability: 'unknown', models: [] };

/** Trims a trailing slash so a URL and the same URL with one behave alike. */
export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

async function readJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });

  if (!response.ok) {
    throw new Error(`Responded ${response.status}`);
  }

  return (await response.json()) as T;
}

const OLLAMA: LocalProviderDescriptor = {
  id: 'Ollama',
  label: 'Ollama',
  defaultBaseUrl: 'http://127.0.0.1:11434',
  summary: 'Runs open models locally, with a one-command install.',
  homepage: 'https://ollama.com',
  setup: [
    'Install Ollama from ollama.com.',
    'Pull a model, for example: ollama pull qwen2.5-coder',
    'Ollama serves on port 11434 once it is running.',
  ],
  async probe(baseUrl, signal) {
    const tags = await readJson<{ models?: Array<{ name: string; size?: number }> }>(`${baseUrl}/api/tags`, signal);

    let version: string | undefined;

    try {
      version = (await readJson<{ version?: string }>(`${baseUrl}/api/version`, signal)).version;
    } catch {
      // Older builds have no version endpoint; the model list already proved it is up.
    }

    return { models: (tags.models ?? []).map((model) => ({ name: model.name, size: model.size })), version };
  },
};

const LM_STUDIO: LocalProviderDescriptor = {
  id: 'LMStudio',
  label: 'LM Studio',
  defaultBaseUrl: 'http://127.0.0.1:1234',
  summary: 'A desktop app for running models, with an OpenAI-compatible server.',
  homepage: 'https://lmstudio.ai',
  setup: [
    'Install LM Studio and download a model in it.',
    'Open the Developer tab and start the local server.',
    'It serves on port 1234 by default.',
  ],
  async probe(baseUrl, signal) {
    const data = await readJson<{ data?: Array<{ id: string }> }>(`${baseUrl}/v1/models`, signal);

    return { models: (data.data ?? []).map((model) => ({ name: model.id })) };
  },
};

/*
 * Anything speaking the OpenAI API: vLLM, llama.cpp's server, a gateway, or a
 * hosted endpoint the user would rather configure by URL.
 */
const OPENAI_LIKE: LocalProviderDescriptor = {
  id: 'OpenAILike',
  label: 'OpenAI-compatible',

  /* Not 8000: that is vLLM's port, and vLLM has its own entry now. */
  defaultBaseUrl: 'http://127.0.0.1:11435/v1',
  summary: 'Any server that speaks the OpenAI API — vLLM, llama.cpp, or a gateway.',
  setup: [
    'Start your server and note the base URL.',
    'Include the version path if it has one, for example http://localhost:8000/v1',
    'Cude asks it for /models to see what it offers.',
  ],
  async probe(baseUrl, signal) {
    const data = await readJson<{ data?: Array<{ id: string }> }>(`${baseUrl}/models`, signal);

    return { models: (data.data ?? []).map((model) => ({ name: model.id })) };
  },
};

/** Reads an OpenAI-shaped /models response. Four of these answer identically. */
async function probeOpenAiModels(baseUrl: string, signal: AbortSignal) {
  const data = await readJson<{ data?: Array<{ id: string }> }>(`${baseUrl}/models`, signal);

  return { models: (data.data ?? []).map((model) => ({ name: model.id })) };
}

const VLLM: LocalProviderDescriptor = {
  id: 'vLLM',
  label: 'vLLM',
  defaultBaseUrl: 'http://127.0.0.1:8000/v1',
  summary: 'A server for your own GPUs, built for throughput rather than convenience.',
  homepage: 'https://docs.vllm.ai',
  setup: [
    'Start it with: vllm serve <model>',
    'It listens on port 8000 and speaks the OpenAI API.',
    'Include the /v1 path in the URL.',
  ],
  probe: probeOpenAiModels,
};

const LLAMA_CPP: LocalProviderDescriptor = {
  id: 'llama.cpp',
  label: 'llama.cpp',
  defaultBaseUrl: 'http://127.0.0.1:8080/v1',
  summary: 'Runs a model on a laptop, CPU included. No key, no account.',
  homepage: 'https://github.com/ggml-org/llama.cpp',
  setup: [
    'Start it with: llama-server -m <model.gguf>',
    'It listens on port 8080 by default.',
    'Include the /v1 path in the URL.',
  ],
  probe: probeOpenAiModels,
};

const JAN: LocalProviderDescriptor = {
  id: 'Jan',
  label: 'Jan',
  defaultBaseUrl: 'http://127.0.0.1:1337/v1',
  summary: 'A desktop app for running models offline, with a local server.',
  homepage: 'https://jan.ai',
  setup: ['Install Jan and download a model.', 'Turn on the local API server in settings.', 'It serves on port 1337.'],
  probe: probeOpenAiModels,
};

const LITELLM: LocalProviderDescriptor = {
  id: 'LiteLLM',
  label: 'LiteLLM',
  defaultBaseUrl: 'http://127.0.0.1:4000',
  summary: 'One address in front of every provider you already pay for.',
  homepage: 'https://docs.litellm.ai/docs/simple_proxy',
  setup: ['Start it with: litellm --config config.yaml', 'It listens on port 4000.', 'Cude asks it for /v1/models.'],
  async probe(baseUrl, signal) {
    const data = await readJson<{ data?: Array<{ id: string }> }>(`${baseUrl}/v1/models`, signal);

    return { models: (data.data ?? []).map((model) => ({ name: model.id })) };
  },
};

export const LOCAL_PROVIDER_DESCRIPTORS: LocalProviderDescriptor[] = [
  OLLAMA,
  LM_STUDIO,
  VLLM,
  LLAMA_CPP,
  JAN,
  LITELLM,
  OPENAI_LIKE,
];

export function describeLocalProvider(id: string): LocalProviderDescriptor | undefined {
  return LOCAL_PROVIDER_DESCRIPTORS.find((descriptor) => descriptor.id === id);
}

/** How long to wait before deciding nothing is there. */
export const PROBE_TIMEOUT_MS = 3000;

export class LocalProviders {
  readonly states = map<Partial<Record<LocalProviderId, LocalProviderState>>>({});

  private _timers = new Map<LocalProviderId, ReturnType<typeof setInterval>>();
  private _inFlight = new Map<LocalProviderId, AbortController>();

  get(id: LocalProviderId): LocalProviderState {
    return this.states.get()[id] ?? EMPTY;
  }

  /**
   * Ask a provider whether it is running.
   *
   * Any previous check for the same provider is aborted first, so changing the
   * URL twice quickly cannot leave the older answer to land last.
   */
  async check(id: LocalProviderId, baseUrl: string): Promise<Reachability> {
    const descriptor = describeLocalProvider(id);

    if (!descriptor) {
      return 'unknown';
    }

    const url = normalizeBaseUrl(baseUrl);

    if (!url) {
      this.states.setKey(id, { ...this.get(id), reachability: 'unknown', error: 'No address set.' });
      return 'unknown';
    }

    this._inFlight.get(id)?.abort();

    const controller = new AbortController();
    this._inFlight.set(id, controller);

    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    this.states.setKey(id, { ...this.get(id), reachability: 'checking', error: undefined });

    try {
      const { models, version } = await descriptor.probe(url, controller.signal);

      this.states.setKey(id, {
        reachability: 'running',
        models,
        version,
        checkedAt: new Date().toISOString(),
      });

      return 'running';
    } catch (error) {
      // An aborted probe was superseded; leave the state for the newer one.
      if (controller.signal.aborted && this._inFlight.get(id) !== controller) {
        return this.get(id).reachability;
      }

      this.states.setKey(id, {
        reachability: 'unreachable',
        models: [],
        error: error instanceof Error ? error.message : String(error),
        checkedAt: new Date().toISOString(),
      });

      return 'unreachable';
    } finally {
      clearTimeout(timeout);

      if (this._inFlight.get(id) === controller) {
        this._inFlight.delete(id);
      }
    }
  }

  /** Check now, then keep checking. Replaces any existing watch. */
  watch(id: LocalProviderId, baseUrl: string, intervalMs = 30000): void {
    this.unwatch(id);
    this.check(id, baseUrl);
    this._timers.set(
      id,
      setInterval(() => this.check(id, baseUrl), intervalMs),
    );
  }

  unwatch(id: LocalProviderId): void {
    const timer = this._timers.get(id);

    if (timer) {
      clearInterval(timer);
      this._timers.delete(id);
    }

    this._inFlight.get(id)?.abort();
    this._inFlight.delete(id);
  }

  /** Stop everything. Called when the surface goes away. */
  dispose(): void {
    for (const id of [...this._timers.keys()]) {
      this.unwatch(id);
    }
  }
}

export const localProviders = new LocalProviders();

/** Human-readable size, for a model list. */
export function formatSize(bytes?: number): string | undefined {
  if (bytes === undefined) {
    return undefined;
  }

  const gigabytes = bytes / 1024 ** 3;

  return gigabytes >= 1 ? `${gigabytes.toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`;
}
