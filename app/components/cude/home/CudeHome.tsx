import { CudeIcon, CudeLogo } from '~/components/cude/CudeLogo';

type StartPath = {
  kind: string;
  title: string;
  description: string;
  icon: string;
  prompt: string;
};

const START_PATHS: StartPath[] = [
  {
    kind: '01 · PRODUCT',
    title: 'Start with an outcome',
    description: 'Turn a business goal into an inspectable plan, architecture, design decision and build.',
    icon: 'i-ph:rocket-launch',
    prompt:
      'I want to start a new product. Help me turn the outcome into a concise product brief, then prepare an architecture decision, a design review and an evidence-based build plan.',
  },
  {
    kind: '02 · CODE',
    title: 'Continue what exists',
    description: 'Read the project before changing it. Preserve working decisions and show the safest next move.',
    icon: 'i-ph:git-branch',
    prompt:
      'I am continuing an existing project. First inspect the codebase and explain the architecture, commands, risks and the smallest safe next step. Do not replace working foundations without evidence.',
  },
  {
    kind: '03 · DEVICE',
    title: 'Build a physical prototype',
    description: 'Produce firmware with the parts, pins, wiring and device instructions it needs to be buildable.',
    icon: 'i-ph:cpu',
    prompt:
      'I want to build a hardware prototype. First confirm the board, components, power source and safety constraints. Then prepare firmware, bill of materials, pin map, wiring plan, assembly checks and flash instructions.',
  },
];

const GUARANTEES = [
  ['Your code', 'Files remain visible, reviewable and exportable.'],
  ['Your model', 'Use hosted, local or OpenAI-compatible providers.'],
  ['Your decision', 'Architecture and design trade-offs stay explicit.'],
];

function startHref(prompt: string) {
  return `/chat/new?prompt=${encodeURIComponent(prompt)}`;
}

/**
 * Cude's clean-room entry surface. It is intentionally a product briefing
 * surface, not an inherited chat home: the first decision is what success
 * looks like, then Cude supplies the engineering environment for it.
 */
export function CudeHome() {
  return (
    <main className="min-h-screen overflow-hidden bg-cude-background-depth-1 text-cude-textPrimary">
      <nav
        className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8"
        aria-label="Cude navigation"
      >
        <a href="/" className="inline-flex items-center" aria-label="Cude home">
          <CudeLogo height={26} />
        </a>
        <a
          href="/chat/new"
          className="rounded-full border border-cude-borderColor px-3 py-1.5 text-xs font-medium text-cude-textSecondary transition-colors hover:border-cude-textTertiary hover:text-cude-textPrimary"
        >
          Open workspace
        </a>
      </nav>

      <section className="relative mx-auto max-w-7xl px-5 pb-16 pt-16 sm:px-8 sm:pt-24 lg:pb-24">
        <div className="absolute -right-24 top-8 h-96 w-96 rounded-full bg-cude-textPrimary opacity-[0.035] blur-3xl" />
        <div className="relative max-w-4xl">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-cude-borderColor bg-cude-background-depth-2 px-3 py-1 text-[10px] font-semibold tracking-[0.18em] text-cude-textSecondary">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            CUDE ENGINEERING ENVIRONMENT
          </div>
          <h1 className="max-w-4xl text-5xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-6xl lg:text-8xl">
            Make the work
            <br />
            make sense.
          </h1>
          <p className="mt-7 max-w-2xl text-base leading-relaxed text-cude-textSecondary sm:text-lg">
            Cude turns intent into a visible engineering run. Plan the product, make decisions in the open, build with
            your preferred model, and leave with code you can own and change.
          </p>
        </div>

        <div className="relative mt-14 grid gap-3 lg:grid-cols-3">
          {START_PATHS.map((path) => (
            <a
              key={path.kind}
              href={startHref(path.prompt)}
              className="group min-h-[232px] rounded-2xl border border-cude-borderColor bg-cude-background-depth-2 p-5 transition-all hover:-translate-y-1 hover:border-cude-textTertiary hover:bg-cude-background-depth-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cude-textPrimary"
            >
              <div className="flex items-start justify-between">
                <span className="text-[10px] font-semibold tracking-[0.16em] text-cude-textTertiary">{path.kind}</span>
                <span
                  className={`${path.icon} text-xl text-cude-textSecondary transition-transform group-hover:scale-110`}
                />
              </div>
              <h2 className="mt-14 text-xl font-semibold tracking-tight">{path.title}</h2>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-cude-textSecondary">{path.description}</p>
              <span className="mt-5 inline-flex items-center gap-1 text-xs font-medium text-cude-textPrimary">
                Begin <span className="i-ph:arrow-up-right" />
              </span>
            </a>
          ))}
        </div>

        <div className="relative mt-14 grid divide-y divide-cude-borderColor border-y border-cude-borderColor sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {GUARANTEES.map(([title, detail]) => (
            <div key={title} className="flex gap-3 py-5 sm:px-5 first:sm:pl-0 last:sm:pr-0">
              <CudeIcon size={20} className="mt-0.5 opacity-70" />
              <div>
                <div className="text-sm font-medium">{title}</div>
                <p className="mt-1 text-xs leading-relaxed text-cude-textSecondary">{detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
