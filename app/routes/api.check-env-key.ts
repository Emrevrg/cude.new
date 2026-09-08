// Cude.new - api.check-env-key.ts (Cude product surface, 2026)
import type { LoaderFunction } from '@remix-run/cloudflare';
import { LLMManager } from '~/lib/modules/llm/manager';
import { isUsableKey } from '~/lib/modules/llm/base-provider';
import { getApiKeysFromCookie } from '~/lib/api/cookies';

export const loader: LoaderFunction = async ({ context, request }) => {
  const url = new URL(request.url);
  const provider = url.searchParams.get('provider');

  if (!provider) {
    return Response.json({ isSet: false });
  }

  const llmManager = LLMManager.getInstance(context?.cloudflare?.env as any);
  const providerInstance = llmManager.getProvider(provider);

  if (!providerInstance || !providerInstance.config.apiTokenKey) {
    return Response.json({ isSet: false });
  }

  const envVarName = providerInstance.config.apiTokenKey;

  // Get API keys from cookie
  const cookieHeader = request.headers.get('Cookie');
  const apiKeys = getApiKeysFromCookie(cookieHeader);

  /*
   * Check API key in order of precedence:
   * 1. Client-side API keys (from cookies)
   * 2. Server environment variables (from Cloudflare env)
   * 3. Process environment variables (from .env.local)
   * 4. LLMManager environment variables
   */
  /*
   * `isUsableKey`, not a truthiness check.
   *
   * A .env.local copied from the example carries
   * `ANTHROPIC_API_KEY=your_anthropic_api_key_here`, which is a non-empty
   * string — so the composer showed a green "Set via environment variable"
   * against a key that cannot authenticate anything, and the first send failed
   * with an auth error the user had just been told could not happen. The
   * provider layer already discounts these placeholders; this route has to
   * agree with it or the badge is a lie.
   */
  const isSet = [
    apiKeys?.[provider],
    (context?.cloudflare?.env as Record<string, any>)?.[envVarName],
    process.env[envVarName],
    llmManager.env[envVarName],
  ].some((candidate) => isUsableKey(typeof candidate === 'string' ? candidate : undefined));

  return Response.json({ isSet });
};
