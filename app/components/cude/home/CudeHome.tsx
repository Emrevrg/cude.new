import { CudeLogo } from '~/components/cude/CudeLogo';

const RUN_STEPS = [
  ['01', 'Brief', 'Turn the outcome into a working brief.'],
  ['02', 'Decide', 'Keep architecture and trade-offs explicit.'],
  ['03', 'Build', 'Work in files you can inspect and change.'],
  ['04', 'Prove', 'Finish with checks and evidence.'],
];

const PRINCIPLES = [
  ['Bring your model', 'Use hosted providers, local models, or an OpenAI-compatible endpoint.'],
  ['Keep your files', 'Every artifact stays visible, editable, and exportable.'],
  ['Stay in control', 'Review the plan, diffs, and evidence before you move on.'],
];

const CODE_LINES = [
  ['1', 'const', ' run = await cude.start({'],
  ['2', '', "  outcome: 'Ship a better product',"],
  ['3', '', "  constraints: ['own the code', 'choose the model'],"],
  ['4', '', '  evidence: true,'],
  ['5', '});', ''],
];

function startHref(prompt: string) {
  return `/chat/new?prompt=${encodeURIComponent(prompt)}`;
}

export function CudeHome() {
  return (
    <main className="min-h-screen overflow-hidden bg-cude-background-depth-1 text-cude-textPrimary">
      <nav className="mx-auto flex h-18 max-w-[1440px] items-center justify-between border-b border-cude-borderColor px-5 sm:px-8 lg:px-12" aria-label="Cude navigation">
        <a href="/" className="inline-flex items-center" aria-label="Cude home"><CudeLogo height={25} /></a>
        <div className="hidden items-center gap-7 text-xs text-cude-textSecondary sm:flex">
          <a href="#how-it-works" className="transition-colors hover:text-cude-textPrimary">How it works</a>
          <a href="#principles" className="transition-colors hover:text-cude-textPrimary">Principles</a>
          <a href="https://github.com/Emrevrg/cude.new" className="transition-colors hover:text-cude-textPrimary">GitHub ↗</a>
        </div>
        <a href="/chat/new" className="rounded-full bg-cude-button-primary-background px-4 py-2 text-xs font-medium text-cude-button-primary-text transition-opacity hover:opacity-85">Open Cude</a>
      </nav>

      <section className="mx-auto grid max-w-[1440px] border-x border-cude-borderColor lg:grid-cols-[minmax(0,1.08fr)_minmax(440px,.92fr)]">
        <div className="relative px-5 pb-16 pt-18 sm:px-8 sm:pb-24 sm:pt-28 lg:px-12 lg:pb-32 lg:pt-36">
          <div className="mb-8 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.17em] text-cude-textTertiary"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Open engineering environment</div>
          <h1 className="max-w-[800px] text-[clamp(3.4rem,8vw,7.7rem)] font-semibold leading-[0.87] tracking-[-0.075em]">Make software<br />you can explain.</h1>
          <p className="mt-9 max-w-xl text-base leading-7 text-cude-textSecondary sm:text-lg">Cude turns a product intention into a visible engineering run: brief, decisions, files, checks, and the evidence behind each move.</p>
          <div className="mt-10 flex flex-wrap gap-3">
            <a href={startHref('I have a product idea. Help me turn it into a concise brief, explicit architecture decisions, an implementation plan and evidence-based build steps.')} className="inline-flex items-center gap-2 rounded-full bg-cude-button-primary-background px-5 py-3 text-sm font-medium text-cude-button-primary-text transition-transform hover:-translate-y-0.5">Start a run <span aria-hidden>→</span></a>
            <a href="#how-it-works" className="inline-flex items-center gap-2 rounded-full border border-cude-borderColor px-5 py-3 text-sm font-medium transition-colors hover:border-cude-textTertiary">See the system <span aria-hidden>↓</span></a>
          </div>
          <p className="mt-10 text-xs text-cude-textTertiary">Apache-2.0 · Local and hosted models · Your repository</p>
        </div>

        <div className="border-t border-cude-borderColor bg-cude-background-depth-2 p-4 sm:p-7 lg:border-l lg:border-t-0 lg:p-9">
          <div className="overflow-hidden rounded-xl border border-cude-borderColor bg-cude-background-depth-1 shadow-[0_18px_50px_rgba(0,0,0,0.08)]">
            <div className="flex items-center justify-between border-b border-cude-borderColor px-4 py-3 text-[11px] text-cude-textTertiary"><span className="font-mono">cude.run / product-launch</span><span className="rounded-full border border-cude-borderColor px-2 py-0.5">active</span></div>
            <div className="grid min-h-[350px] grid-cols-[108px_1fr] sm:grid-cols-[132px_1fr]">
              <aside className="border-r border-cude-borderColor p-3 text-[11px] text-cude-textSecondary">
                <div className="mb-5 font-medium text-cude-textPrimary">Run</div>
                {['Brief', 'Decisions', 'Files', 'Evidence'].map((item, index) => <div key={item} className={`mb-3 flex items-center gap-2 ${index === 2 ? 'text-cude-textPrimary' : ''}`}><span className={`h-1.5 w-1.5 rounded-full ${index === 2 ? 'bg-emerald-500' : 'bg-cude-borderColor'}`} />{item}</div>)}
              </aside>
              <div className="p-5 sm:p-6">
                <div className="flex items-center justify-between"><div><p className="text-xs text-cude-textTertiary">BUILD / 03</p><h2 className="mt-1 text-lg font-medium tracking-tight">Create the working surface</h2></div><span className="i-ph:brackets-curly text-2xl text-cude-textSecondary" /></div>
                <div className="mt-7 rounded-lg border border-cude-borderColor bg-cude-background-depth-2 p-4 font-mono text-[11px] leading-6 sm:text-xs">
                  {CODE_LINES.map(([line, keyword, text]) => <div key={line} className="grid grid-cols-[22px_44px_1fr]"><span className="select-none text-cude-textTertiary">{line}</span><span className="text-violet-500">{keyword}</span><span className="text-cude-textSecondary">{text}</span></div>)}
                </div>
                <div className="mt-6 flex items-center gap-3 border-t border-cude-borderColor pt-4"><span className="h-2 w-2 rounded-full bg-emerald-500" /><span className="text-xs text-cude-textSecondary">Files staged for review</span><span className="ml-auto text-xs text-cude-textTertiary">12 checks</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-[1440px] border-x border-t border-cude-borderColor px-5 py-16 sm:px-8 sm:py-24 lg:px-12">
        <div className="grid gap-10 lg:grid-cols-[.75fr_1.25fr] lg:gap-20"><div><p className="text-[11px] font-medium uppercase tracking-[0.17em] text-cude-textTertiary">One legible run</p><h2 className="mt-4 max-w-sm text-3xl font-semibold leading-tight tracking-[-0.04em] sm:text-4xl">From a request to a result you can verify.</h2></div><div className="grid gap-px overflow-hidden border border-cude-borderColor bg-cude-borderColor sm:grid-cols-2">{RUN_STEPS.map(([number,title,detail]) => <div key={number} className="min-h-44 bg-cude-background-depth-1 p-5 sm:p-7"><span className="font-mono text-xs text-cude-textTertiary">{number}</span><h3 className="mt-9 text-xl font-medium tracking-tight">{title}</h3><p className="mt-2 max-w-xs text-sm leading-6 text-cude-textSecondary">{detail}</p></div>)}</div></div>
      </section>

      <section id="principles" className="mx-auto max-w-[1440px] border-x border-t border-cude-borderColor bg-cude-background-depth-2 px-5 py-16 sm:px-8 sm:py-24 lg:px-12">
        <p className="text-[11px] font-medium uppercase tracking-[0.17em] text-cude-textTertiary">The Cude contract</p>
        <div className="mt-7 grid border-t border-cude-borderColor sm:grid-cols-3">{PRINCIPLES.map(([title,detail]) => <div key={title} className="border-b border-cude-borderColor py-7 sm:border-b-0 sm:px-7 sm:first:pl-0 sm:not(:last-child):border-r"><span className="i-ph:seal-check mb-7 block text-xl" /><h3 className="text-lg font-medium tracking-tight">{title}</h3><p className="mt-3 text-sm leading-6 text-cude-textSecondary">{detail}</p></div>)}</div>
      </section>

      <section className="mx-auto max-w-[1440px] border-x border-t border-cude-borderColor px-5 py-20 text-center sm:px-8 sm:py-28 lg:px-12"><p className="text-[11px] font-medium uppercase tracking-[0.17em] text-cude-textTertiary">Build with an engineering record</p><h2 className="mx-auto mt-5 max-w-3xl text-4xl font-semibold leading-[0.95] tracking-[-0.055em] sm:text-6xl">The model can change.<br />The work stays yours.</h2><a href="/chat/new" className="mt-9 inline-flex rounded-full bg-cude-button-primary-background px-6 py-3 text-sm font-medium text-cude-button-primary-text transition-transform hover:-translate-y-0.5">Open the workspace →</a></section>

      <footer className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 border border-cude-borderColor px-5 py-6 text-xs text-cude-textTertiary sm:px-8 lg:px-12"><span>© 2026 Cude.new</span><div className="flex gap-5"><a className="hover:text-cude-textPrimary" href="https://github.com/Emrevrg/cude.new">GitHub</a><a className="hover:text-cude-textPrimary" href="https://github.com/Emrevrg/cude.new/blob/main/LICENSE">Apache-2.0</a></div></footer>
    </main>
  );
}
