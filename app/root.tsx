// Cude.new - root.tsx (Cude product surface, 2026)
import type { LinksFunction } from '@remix-run/cloudflare';
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from '@remix-run/react';
import tailwindReset from '@unocss/reset/tailwind-compat.css?url';
import { stripIndents } from './utils/stripIndent';
import { createHead } from 'remix-island';
import globalStyles from './styles/index.scss?url';

import 'virtual:uno.css';

export const links: LinksFunction = () => [
  /*
   * Tab icon. The .ico carries 16-256px variants for Windows/legacy, the PNGs
   * are what modern browsers actually pick up, and apple-touch-icon covers
   * iOS home-screen installs.
   */
  { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
  { rel: 'icon', href: '/favicon-32.png', type: 'image/png', sizes: '32x32' },
  { rel: 'icon', href: '/favicon-16.png', type: 'image/png', sizes: '16x16' },
  { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' },
  { rel: 'mask-icon', href: '/cude-mark.png', color: '#0a0a0a' },

  /*
   * The lockup ships as one asset per theme and only one of them is ever
   * displayed, so preloading is skipped: preloading both wastes a request on
   * every load, and preloading one produces an "preloaded but not used"
   * warning for everyone on the other theme. Both are small and referenced
   * directly in the initial markup, so the preload scanner finds them anyway.
   */
  { rel: 'stylesheet', href: tailwindReset },
  { rel: 'stylesheet', href: globalStyles },
  {
    rel: 'preconnect',
    href: 'https://fonts.googleapis.com',
  },
  {
    rel: 'preconnect',
    href: 'https://fonts.gstatic.com',
    crossOrigin: 'anonymous',
  },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  },
];

const inlineThemeCode = stripIndents`
  setTutorialKitTheme();

  function setTutorialKitTheme() {
    let theme = localStorage.getItem('cude.theme');

    if (!theme) {
      theme = 'light';
    }

    document.querySelector('html')?.setAttribute('data-theme', theme);
  }
`;

export const Head = createHead(() => (
  <>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <Meta />
    <Links />
    <script dangerouslySetInnerHTML={{ __html: inlineThemeCode }} />
  </>
));

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ScrollRestoration />
      <Scripts />
    </>
  );
}

export default function App() {
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}
