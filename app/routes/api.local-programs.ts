/*
 * Cude.new - api.local-programs.ts (Cude product surface, 2026)
 *
 * Answers what is installed on this machine, for the clone picker. Guarded to
 * localhost: see the note in ~/lib/cude/localPrograms.
 */
import type { LoaderFunctionArgs } from '@remix-run/cloudflare';
import { discoverLocalPrograms } from '~/lib/cude/localPrograms';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.local-programs');

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    /* Describes this machine, and changes when someone installs something. */
    return Response.json(await discoverLocalPrograms(request), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    logger.error('Could not read local programs:', error);

    return Response.json({
      available: false,
      programs: [],
      extensions: [],
      reason: 'Could not read the installed programs on this machine.',
    });
  }
}
