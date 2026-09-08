// Cude.new - ExamplePrompts.tsx (Cude product surface, 2026)
import React, { memo } from 'react';

const EXAMPLE_PROMPTS = [
  { text: 'Build a habit tracker Android app with offline storage' },
  { text: 'Build a todo app in React using Tailwind' },
  { text: 'Build a simple blog using Astro' },
  { text: 'Create a Chrome extension that summarizes the current page' },
  { text: 'Build a desktop Markdown editor with autosave' },
  { text: 'Build a VS Code extension that explains selected code' },
];

interface ExamplePromptsProps {
  sendMessage?: (event: React.UIEvent, messageInput?: string) => void | undefined;
}

/*
 * A component, not a function called from JSX.
 *
 * Called as `ExamplePrompts(fn)` its output was inlined into the parent's
 * render, so React had to rebuild all six buttons on every keystroke in the
 * composer. As a memoised component with a stable callback it renders once.
 */
export const ExamplePrompts = memo(({ sendMessage }: ExamplePromptsProps) => {
  return (
    <div id="examples" className="relative flex flex-col gap-9 w-full max-w-3xl mx-auto flex justify-center mt-6">
      <div
        className="flex flex-wrap justify-center gap-2"
        style={{
          animation: '.25s ease-out 0s 1 _fade-and-move-in_g2ptj_1 forwards',
        }}
      >
        {EXAMPLE_PROMPTS.map((examplePrompt, index: number) => {
          return (
            <button
              key={index}
              onClick={(event) => {
                sendMessage?.(event, examplePrompt.text);
              }}
              className="border border-cude-borderColor rounded-full bg-cude-background-depth-2 hover:bg-cude-background-depth-3 dark:bg-cude-background-depth-1 dark:hover:bg-cude-background-depth-2 text-cude-textSecondary hover:text-cude-textPrimary px-3 py-1 text-xs transition-theme"
            >
              {examplePrompt.text}
            </button>
          );
        })}
      </div>
    </div>
  );
});

ExamplePrompts.displayName = 'ExamplePrompts';
