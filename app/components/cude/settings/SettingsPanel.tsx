/**
 * Cude.new - settings panel.
 *
 * Cude's own information architecture: surfaces grouped by why they exist —
 * what Cude builds with, what it did, the project's data, and you — rather than
 * one flat grid where a provider key sits beside an avatar.
 *
 * The individual surfaces are rendered by their existing components; this is
 * the frame, the navigation and the state around them.
 */

import { useCallback, useMemo, useState } from 'react';
import { useStore } from '@nanostores/react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { motion, AnimatePresence } from 'framer-motion';
import { classNames } from '~/utils/classNames';
import { DialogTitle } from '~/components/ui/Dialog';
import { groupSurfaces, getSurface, type SurfaceId } from '~/lib/cude/settings/surfaces';
import { tabConfigurationStore } from '~/lib/cude/state/settings';
import { SurfaceCard } from './SurfaceCard';

export interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;

  /** Renders the body of a surface. */
  renderSurface: (id: SurfaceId) => React.ReactNode;

  /** Shown in the header, e.g. the avatar menu. */
  headerAccessory?: React.ReactNode;
}

export function SettingsPanel({ open, onClose, renderSurface, headerAccessory }: SettingsPanelProps) {
  const [active, setActive] = useState<SurfaceId | null>(null);
  const configuration = useStore(tabConfigurationStore);

  const groups = useMemo(() => {
    const visible = (configuration?.userTabs ?? [])
      .filter((tab) => tab.visible)
      .sort((a, b) => a.order - b.order)
      .map((tab) => tab.id as SurfaceId);

    return groupSurfaces(visible);
  }, [configuration]);

  const handleClose = useCallback(() => {
    setActive(null);
    onClose();
  }, [onClose]);

  const activeSurface = active ? getSurface(active) : undefined;

  return (
    <RadixDialog.Root open={open}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay asChild>
          <motion.div
            className="fixed inset-0 z-max bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={handleClose}
          />
        </RadixDialog.Overlay>

        <RadixDialog.Content
          aria-describedby={undefined}
          onEscapeKeyDown={handleClose}
          onPointerDownOutside={handleClose}
          className="fixed inset-0 flex items-center justify-center z-max"
        >
          <motion.div
            className={classNames(
              'w-[min(1100px,94vw)] h-[min(760px,88vh)] flex flex-col overflow-hidden',
              'rounded-2xl border border-cude-borderColor',
              'bg-cude-background-depth-1 shadow-2xl',
            )}
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.985 }}
            transition={{ duration: 0.18 }}
          >
            <header className="h-14 shrink-0 flex items-center justify-between px-5 border-b border-cude-borderColor">
              <div className="flex items-center gap-3">
                {activeSurface && (
                  <button
                    onClick={() => setActive(null)}
                    aria-label="Back to all settings"
                    className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-cude-background-depth-3 transition-colors"
                  >
                    <div className="i-ph:arrow-left w-4 h-4 text-cude-textSecondary" />
                  </button>
                )}
                <DialogTitle className="text-lg font-semibold text-cude-textPrimary">
                  {activeSurface ? activeSurface.label : 'Settings'}
                </DialogTitle>
              </div>

              <div className="flex items-center gap-2">
                {headerAccessory}
                <button
                  onClick={handleClose}
                  aria-label="Close settings"
                  className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-cude-background-depth-3 transition-colors"
                >
                  <div className="i-ph:x w-4 h-4 text-cude-textSecondary" />
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto">
              <AnimatePresence mode="wait">
                {activeSurface ? (
                  <motion.div
                    key={activeSurface.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.15 }}
                    className="p-6"
                  >
                    {renderSurface(activeSurface.id)}
                  </motion.div>
                ) : (
                  <motion.div
                    key="index"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="p-6 flex flex-col gap-8"
                  >
                    {groups.map((group) => (
                      <section key={group.id}>
                        <div className="mb-3">
                          <h3 className="text-sm font-semibold text-cude-textPrimary">{group.label}</h3>
                          <p className="text-xs text-cude-textTertiary">{group.description}</p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {group.surfaces.map((surface) => (
                            <SurfaceCard key={surface.id} surface={surface} onOpen={() => setActive(surface.id)} />
                          ))}
                        </div>
                      </section>
                    ))}

                    {groups.length === 0 && (
                      <p className="text-sm text-cude-textTertiary">
                        Every settings surface is hidden. Re-enable one to see it here.
                      </p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
