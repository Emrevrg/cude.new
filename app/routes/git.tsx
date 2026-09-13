// Cude.new - git.tsx (Cude product surface, 2026)
import type { LoaderFunctionArgs } from '@remix-run/cloudflare';
import { json, type MetaFunction } from '@remix-run/cloudflare';
import { ClientOnly } from 'remix-utils/client-only';
import { CudeLogo } from '~/components/cude/CudeLogo';
import { GitUrlImport } from '~/components/git/GitUrlImport.client';
import BackgroundRays from '~/components/ui/BackgroundRays';

export const meta: MetaFunction = () => {
  return [
    { title: 'Cude.new - Import from Git' },
    { name: 'description', content: 'Import a Git repository and build on it with an AI engineering team.' },
  ];
};

export async function loader(args: LoaderFunctionArgs) {
  return json({ url: args.params.url });
}

export default function Index() {
  return (
    <div className="flex flex-col h-full w-full bg-cude-background-depth-1">
      <BackgroundRays />
      <header className="relative z-10 flex h-16 items-center border-b border-cude-borderColor px-6">
        <a href="/" aria-label="Cude home">
          <CudeLogo height={25} />
        </a>
      </header>
      <ClientOnly fallback={<div className="min-h-96" />}>{() => <GitUrlImport />}</ClientOnly>
    </div>
  );
}
