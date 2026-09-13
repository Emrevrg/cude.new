import { memo } from 'react';
import type { ProjectType } from '~/lib/cude/platform';
import { setPlatform } from '~/lib/stores/cude';

type LaunchRecipe = {
  eyebrow: string;
  title: string;
  detail: string;
  icon: string;
  platform: ProjectType;
  prompt: string;
};

const RECIPES: LaunchRecipe[] = [
  {
    eyebrow: 'PRODUCT',
    title: 'Ship a real application',
    detail: 'Plan the product, choose the stack, review the design and release with evidence.',
    icon: 'i-ph:rocket-launch',
    platform: 'fullstack',
    prompt:
      'Build a production-ready full-stack product. Start by asking only the highest-leverage questions, then create an architecture decision, a design proposal, a build plan, tests, and a release checklist.',
  },
  {
    eyebrow: 'FREEDOM',
    title: 'Continue my own code',
    detail: 'Bring an existing repository or folder; retain ownership of the files, model and deployment path.',
    icon: 'i-ph:git-branch',
    platform: 'auto',
    prompt:
      'I want to continue an existing project. First inspect the project and explain its architecture, risks, run commands, and the smallest safe next step. Do not replace working foundations without explaining why.',
  },
  {
    eyebrow: 'HARDWARE',
    title: 'Make a physical prototype',
    detail: 'Create firmware alongside a pin map, bill of materials, wiring plan, and flashing instructions.',
    icon: 'i-ph:cpu',
    platform: 'hardware',
    prompt:
      'Build an ESP32 hardware prototype. Produce the firmware, a precise bill of materials, a pin-by-pin wiring plan, assembly checks, safe power notes, and PlatformIO flash and serial-monitor instructions. Ask about the board, sensors, power source and enclosure before making unsafe assumptions.',
  },
];

interface Props {
  sendMessage?: (event: React.UIEvent, messageInput?: string) => void;
}

/**
 * A product-launch surface, not a gallery of generic prompt chips. Each choice
 * makes Cude's operating model explicit before a build begins.
 */
export const CudeLaunchpad = memo(({ sendMessage }: Props) => (
  <section className="w-full max-w-4xl mx-auto px-4 pb-5" aria-label="Choose a Cude starting path">
    <div className="flex items-center gap-3 mb-3">
      <span className="h-px flex-1 bg-cude-borderColor" />
      <span className="text-[10px] font-semibold tracking-[0.18em] text-cude-textTertiary">START WITH INTENT</span>
      <span className="h-px flex-1 bg-cude-borderColor" />
    </div>
    <div className="grid gap-2 md:grid-cols-3">
      {RECIPES.map((recipe) => (
        <button
          key={recipe.title}
          type="button"
          onClick={(event) => {
            setPlatform(recipe.platform);
            sendMessage?.(event, recipe.prompt);
          }}
          className="group min-h-[146px] rounded-xl border border-cude-borderColor bg-cude-background-depth-2 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-cude-textTertiary hover:bg-cude-background-depth-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cude-textPrimary"
        >
          <div className="flex items-start justify-between gap-3">
            <span className="text-[10px] font-semibold tracking-[0.16em] text-cude-textTertiary">{recipe.eyebrow}</span>
            <span
              className={`${recipe.icon} text-lg text-cude-textSecondary transition-transform group-hover:scale-110`}
            />
          </div>
          <div className="mt-4 text-sm font-semibold text-cude-textPrimary">{recipe.title}</div>
          <p className="mt-1.5 text-xs leading-relaxed text-cude-textSecondary">{recipe.detail}</p>
        </button>
      ))}
    </div>
  </section>
));

CudeLaunchpad.displayName = 'CudeLaunchpad';
