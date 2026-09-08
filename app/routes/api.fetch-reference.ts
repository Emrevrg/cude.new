/*
 * Cude.new - api.fetch-reference.ts (Cude product surface, 2026)
 *
 * Thin wrapper: the reading, and the rules about what may be read, live in
 * ~/lib/cude/fetchReference.
 */
import type { LoaderFunctionArgs } from '@remix-run/cloudflare';
import { readReference } from '~/lib/cude/fetchReference';

export async function loader({ request }: LoaderFunctionArgs) {
  return readReference(request);
}
