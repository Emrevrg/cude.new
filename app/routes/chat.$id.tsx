// Cude.new - chat.$id.tsx (Cude product surface, 2026)
import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { useLoaderData } from '@remix-run/react';
import { ClientOnly } from 'remix-utils/client-only';
import { BaseChat } from '~/components/chat/BaseChat';
import { CudeStudio } from '~/components/cude/native-workspace/CudeStudio.client';

export async function loader(args: LoaderFunctionArgs) {
  return json({ id: args.params.id });
}

/**
 * Transitional workspace route. The Cude-native landing surface lives at `/`;
 * the legacy workspace remains isolated here while its chat and workbench
 * subsystems are replaced behind Cude's own runtime contract.
 */
export default function WorkspaceRoute() {
  const { id } = useLoaderData<typeof loader>();

  return <ClientOnly fallback={<BaseChat />}>{() => <CudeStudio runId={id ?? 'new'} />}</ClientOnly>;
}
