// Cude.new - Switch.tsx (Cude product surface, 2026)
import { memo } from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { classNames } from '~/utils/classNames';

interface SwitchProps {
  className?: string;
  checked?: boolean;
  onCheckedChange?: (event: boolean) => void;
}

export const Switch = memo(({ className, onCheckedChange, checked }: SwitchProps) => {
  return (
    <SwitchPrimitive.Root
      className={classNames(
        'relative h-6 w-11 cursor-pointer rounded-full border',

        /*
         * Off and on have to look different, and on a monochrome theme that is
         * easy to get wrong: both states used to resolve to white in the dark
         * theme, so an enabled provider and a disabled one were identical.
         * Off is the page's own surface; on is the accent, which inverts with
         * the theme.
         */
        'border-cude-borderColor bg-cude-background-depth-3',
        'data-[state=checked]:border-transparent data-[state=checked]:bg-cude-item-contentAccent',
        'transition-colors duration-200 ease-in-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cude-borderColorActive',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      checked={checked}
      onCheckedChange={(e) => onCheckedChange?.(e)}
    >
      <SwitchPrimitive.Thumb
        className={classNames(
          'block h-5 w-5 rounded-full',

          /*
           * The thumb has to read against whichever track is under it: a muted
           * grey on the off track, and the page background on the on track,
           * which is the opposite colour to the accent in either theme.
           */
          'bg-cude-textTertiary data-[state=checked]:bg-cude-background-depth-1',
          'shadow-sm',
          'transition-transform duration-200 ease-in-out',
          'translate-x-0.5',
          'data-[state=checked]:translate-x-[1.375rem]',
          'will-change-transform',
        )}
      />
    </SwitchPrimitive.Root>
  );
});
