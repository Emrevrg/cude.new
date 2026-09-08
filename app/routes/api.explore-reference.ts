// Cude.new - api.explore-reference.ts (Cude product surface, 2026)
import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { generateText } from 'ai';
import { SERVER_PROVIDER_LIST } from '~/lib/.server/llm/providerRegistry';
import { LLMManager } from '~/lib/modules/llm/manager';
import { fetchModelRegistry, mergeRegistryModels } from '~/lib/cude/providers/modelRegistry';
import { getApiKeysFromCookie, getProviderSettingsFromCookie } from '~/lib/api/cookies';
import { createScopedLogger } from '~/utils/logger';
import {
  buildExplorerSystem,
  buildExplorerUser,
  parseUiMap,
  validateExploreRequest,
  validateUiMap,
  type ExploreMode,
  type ReferenceScreenshot,
} from '~/lib/cude/explore';
import type { CloneReference, CloneTarget } from '~/lib/cude/clone';
import type { IProviderSetting } from '~/types/model';

export async function action(args: ActionFunctionArgs) {
  return exploreAction(args);
}

const logger = createScopedLogger('api.explore-reference');

/** A thorough map, not an unbounded one. */
const MAP_TOKEN_CEILING = 6000;

async function exploreAction({ context, request }: ActionFunctionArgs) {
  const body = (await request.json()) as {
    reference?: CloneReference;
    target?: CloneTarget;
    mode?: ExploreMode;
    detail?: string;
    excerpt?: string;
    explorer?: { provider?: string; model?: string };
    screenshots?: ReferenceScreenshot[];
  };

  const invalid = validateExploreRequest(body);

  if (invalid.error) {
    throw new Response(invalid.error, { status: invalid.status ?? 400, statusText: 'Bad Request' });
  }

  const { reference, target, mode, detail, excerpt } = body as {
    reference: CloneReference;
    target: CloneTarget;
    mode: ExploreMode;
    detail?: string;
    excerpt?: string;
  };
  const explorer = (body as { explorer: { provider: string; model: string } }).explorer;
  const screenshots = body.screenshots ?? [];

  const cookieHeader = request.headers.get('Cookie');
  const apiKeys = getApiKeysFromCookie(cookieHeader);
  const providerSettings = getProviderSettingsFromCookie(cookieHeader);

  const provider = SERVER_PROVIDER_LIST.find((p) => p.name === explorer.provider);

  if (!provider) {
    throw new Response(`No provider named "${explorer.provider}" is registered.`, {
      status: 400,
      statusText: 'Provider Not Available',
    });
  }

  try {
    const llmManager = LLMManager.getInstance(import.meta.env);
    let models = await llmManager.getModelListFromProvider(provider, {
      apiKeys,
      providerSettings,
      serverEnv: context.cloudflare?.env as any,
    });

    try {
      models = mergeRegistryModels(models, await fetchModelRegistry());
    } catch {
      // Static plus discovery still answer.
    }

    const modelDetails =
      models.find((m) => m.name === explorer.model && m.provider === provider.name) ??
      models.find((m) => m.name === explorer.model);

    if (!modelDetails) {
      throw new Response(
        `No model named "${explorer.model}" is available from ${provider.name}. Check the provider is configured in Settings.`,
        { status: 400, statusText: 'Model Not Available' },
      );
    }

    const tokenParams = {
      maxTokens: Math.min(modelDetails.maxCompletionTokens ?? MAP_TOKEN_CEILING, MAP_TOKEN_CEILING),
    };

    const content: Array<{ type: 'text'; text: string } | { type: 'image'; image: string }> = [
      {
        type: 'text',
        text: buildExplorerUser({ mode, target, reference, detail, excerpt, explorer }, screenshots.length),
      },
      ...screenshots.map((shot) => ({
        type: 'image' as const,
        image: `data:${shot.mediaType};base64,${shot.data}`,
      })),
    ];

    logger.info(
      `Exploring ${target} reference "${reference.name}" with ${provider.name} / ${modelDetails.name} and ${screenshots.length} screenshot(s)`,
    );

    const result = await generateText({
      system: buildExplorerSystem(mode),
      messages: [{ role: 'user' as const, content }],
      model: provider.getModelInstance({
        model: modelDetails.name,
        serverEnv: context.cloudflare?.env as any,
        apiKeys,
        providerSettings: providerSettings as Record<string, IProviderSetting>,
      }),
      ...tokenParams,
      temperature: 0,
    });

    const { map, fenced } = parseUiMap(result.text);
    const problems = validateUiMap(map, target);

    return new Response(JSON.stringify({ map, fenced, problems, explorer }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    /*
     * The checks above throw a Response when they already know what to say.
     * Anything else is answered the way api.llmcall answers it: a JSON body
     * naming the failure instead of an opaque 500.
     */
    if (error instanceof Response) {
      return error;
    }

    logger.error('Explorer call failed:', error);

    if (error instanceof Error && error.message?.includes('API key')) {
      return new Response(
        JSON.stringify({
          error: true,
          message: `The ${provider.name} key is missing or invalid. Add it in Settings, then map again.`,
          statusCode: 401,
          isRetryable: false,
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' }, statusText: 'Unauthorized' },
      );
    }

    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'The explorer call failed.',
        statusCode: (error as { statusCode?: number }).statusCode || 500,
        isRetryable: (error as { isRetryable?: boolean }).isRetryable !== false,
        provider: provider.name,
      }),
      {
        status: (error as { statusCode?: number }).statusCode || 500,
        headers: { 'Content-Type': 'application/json' },
        statusText: 'Error',
      },
    );
  }
}
