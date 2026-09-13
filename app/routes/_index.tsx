// Cude.new - _index.tsx (Cude product surface, 2026)
import { json, type MetaFunction } from '@remix-run/cloudflare';
import { CudeHome } from '~/components/cude/home/CudeHome';

export const meta: MetaFunction = () => {
  return [
    { title: 'Cude.new — Make software you can explain' },
    {
      name: 'description',
      content:
        'Cude.new is an open engineering environment for visible, reviewable AI software runs. Keep your code, choose your model, and verify the work.',
    },
  ];
};

export const loader = () => json({});

export default function Index() {
  return <CudeHome />;
}
