/**
 * Cude.new - one settings surface, as a card.
 *
 * Deliberately quiet: a monochrome tile with the surface's own icon, its name,
 * and one line saying what it is for. The description is part of the card
 * rather than a tooltip, because a settings grid where you have to hover to
 * find out what something does is a grid you have to hunt through.
 */

import { classNames } from '~/utils/classNames';
import type { SurfaceDefinition } from '~/lib/cude/settings/surfaces';
import { surfaceIcon } from './surfaceIcons';

export interface SurfaceCardProps {
  surface: SurfaceDefinition;
  onOpen: () => void;
}

export function SurfaceCard({ surface, onOpen }: SurfaceCardProps) {
  const Icon = surfaceIcon(surface.id);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${surface.label}: ${surface.description}`}
      className={classNames(
        'group relative text-left p-4 rounded-xl',
        'border border-cude-borderColor',
        'bg-cude-background-depth-2',
        'hover:border-gray-500/40 hover:bg-cude-background-depth-3',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500/40',
        'transition-colors duration-150',
      )}
    >
      {surface.beta && (
        <span className="absolute top-3 right-3 px-1.5 py-0.5 rounded-full bg-cude-background-depth-2 border border-cude-borderColor text-[10px] font-medium text-cude-textTertiary">
          BETA
        </span>
      )}

      <Icon
        className={classNames(
          'w-5 h-5 mb-3 text-cude-textSecondary',
          'group-hover:text-cude-textPrimary transition-colors',
        )}
      />

      <div className="text-sm font-medium text-cude-textPrimary">{surface.label}</div>
      <p className="mt-1 text-xs leading-relaxed text-cude-textTertiary">{surface.description}</p>
    </button>
  );
}
