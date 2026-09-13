// Cude.new - _index.tsx (Cude product surface, 2026)
import { json, type MetaFunction } from '@remix-run/cloudflare';
import { CudeHome } from '~/components/cude/home/CudeHome';

export const meta: MetaFunction = () => {
  return [
    { title: 'Cude.new - Build software with an AI engineering team' },
    {
      name: 'description',
      content:
        'Cude.new - open-source AI software factory for web, mobile, desktop and extensions. Describe software. Cude plans, builds, tests and repairs.',
    },
  ];
};

export const loader = () => json({});

export default function Index() {
  return <CudeHome />;
}
