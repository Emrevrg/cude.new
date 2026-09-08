// Cude.new - root.tsx (Cude product surface, 2026)
import { useStore } from '@nanostores/react';
import type { LinksFunction } from '@remix-run/cloudflare';
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from '@remix-run/react';
import tailwindReset from '@unocss/reset/tailwind-compat.css?url';
import { themeStore } from './lib/stores/theme';
import { stripIndents } from './utils/stripIndent';
import { createHead } from 'remix-island';
import { useEffect } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { ClientOnly } from 'remix-utils/client-only';
import { cssTransition, ToastContainer } from 'react-toastify';

import reactToastifyStyles from 'react-toastify/dist/ReactToastify.css?url';
import globalStyles from './styles/index.scss?url';
import xtermStyles from '@xterm/xterm/css/xterm.css?url';

import 'virtual:uno.css';

const toastAnimation = cssTransition({
  enter: 'animated fadeInRight',
  exit: 'animated fadeOutRight',
});

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
  { rel: 'stylesheet', href: reactToastifyStyles },
  { rel: 'stylesheet', href: tailwindReset },
  { rel: 'stylesheet', href: globalStyles },
  { rel: 'stylesheet', href: xtermStyles },
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
  const theme = useStore(themeStore);

  useEffect(() => {
    document.querySelector('html')?.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <>
      <ClientOnly
        fallback={
          <div className="flex h-full min-h-screen w-full flex-col bg-cude-background-depth-1 text-cude-textPrimary">
            <div className="flex h-[var(--header-height)] items-center border-b border-cude-borderColor px-4">
              <img src="/cude-mark.png" alt="" className="h-6 w-6" />
              <span className="ml-2 text-sm font-semibold tracking-tight">Cude.new</span>
            </div>
            <main className="flex flex-1 items-center justify-center px-6">
              <div className="text-center">
                <div className="mx-auto mb-4 h-1 w-16 overflow-hidden rounded-full bg-cude-background-depth-3">
                  <div className="h-full w-1/2 rounded-full bg-cude-textPrimary" />
                </div>
                <p className="text-sm text-cude-textSecondary">Preparing your workspace…</p>
              </div>
            </main>
          </div>
        }
      >
        {() => <DndProvider backend={HTML5Backend}>{children}</DndProvider>}
      </ClientOnly>
      <ToastContainer
        closeButton={({ closeToast }) => {
          return (
            <button className="Toastify__close-button" onClick={closeToast}>
              <div className="i-ph:x text-lg" />
            </button>
          );
        }}
        icon={({ type }) => {
          switch (type) {
            case 'success': {
              return <div className="i-ph:check-bold text-cude-icon-success text-2xl" />;
            }
            case 'error': {
              return <div className="i-ph:warning-circle-bold text-cude-icon-error text-2xl" />;
            }
          }

          return undefined;
        }}
        position="bottom-right"
        pauseOnFocusLoss
        transition={toastAnimation}
        autoClose={3000}
      />
      <ScrollRestoration />
      <Scripts />
    </>
  );
}

import { logStore } from './lib/cude/state/logStoreAdapter';
import { installCudeDevBridge } from './lib/cude/devBridge';
import { registerServices } from './lib/cude/state/serviceDescriptors';
import { publishCustomProviders } from './lib/cude/providers/customProviders';

export default function App() {
  const theme = useStore(themeStore);

  // Development-only QA bridge. Compiled out of production builds.
  useEffect(() => {
    installCudeDevBridge();
  }, []);

  /*
   * Restores connections stored in this browser. Registration only reads local
   * storage — nothing is sent anywhere until a surface asks for it.
   */
  useEffect(() => {
    registerServices();

    /* A provider added in an earlier session still has to reach the server. */
    publishCustomProviders();
  }, []);

  useEffect(() => {
    logStore.logSystem('Application initialized', {
      theme,
      platform: navigator.platform,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    });
  }, []);

  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}
