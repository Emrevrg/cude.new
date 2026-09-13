// Cude.new - chat.$id.tsx (Cude product surface, 2026)
import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { useLoaderData } from '@remix-run/react';
import { ClientOnly } from 'remix-utils/client-only';
import { CudeStudio } from '~/components/cude/native-workspace/CudeStudio.client';

export async function loader(args: LoaderFunctionArgs) {
  return json({ id: args.params.id });
}

/** Cude's native product-run and build workspace. */
export default function WorkspaceRoute() {
  const { id } = useLoaderData<typeof loader>();

  return (
    <ClientOnly fallback={<div className="min-h-screen bg-cude-background-depth-1" />}>
      {() => <CudeStudio runId={id ?? 'new'} />}
    </ClientOnly>
  );
}
