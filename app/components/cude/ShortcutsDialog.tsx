/*
 * Cude.new - ShortcutsDialog.tsx (Cude product surface, 2026)
 *
 * Every keyboard shortcut in one place, read from the same store the window
 * listens to — so the list cannot drift from what the keys actually do. Where
 * a binding says Ctrl-or-Command, the chip names the one for this machine.
 */
import { memo } from 'react';
import { useStore } from '@nanostores/react';
import { Dialog, DialogRoot, DialogTitle, DialogDescription } from '~/components/ui/Dialog';
import { classNames } from '~/utils/classNames';
import { shortcutsStore } from '~/lib/cude/state/settings';
import type { ShortcutBinding } from '~/lib/cude/state/settings/types';
import { isMac } from '~/utils/os';

interface Props {
  open: boolean;
  onClose: () => void;
}

function Chord({ binding }: { binding: ShortcutBinding }) {
  const keys: string[] = [];

  if (binding.ctrlOrMetaKey) {
    keys.push(isMac ? '⌘' : 'Ctrl');
  }

  if (binding.ctrlKey) {
    keys.push('Ctrl');
  }

  if (binding.metaKey) {
    keys.push(isMac ? '⌘' : 'Win');
  }

  if (binding.altKey) {
    keys.push(isMac ? '⌥' : 'Alt');
  }

  if (binding.shiftKey) {
    keys.push('Shift');
  }

  keys.push(binding.key.length === 1 ? binding.key.toUpperCase() : binding.key);

  return (
    <span className="flex items-center gap-1 shrink-0">
      {keys.map((key) => (
        <kbd
          key={key}
          className="px-2 py-1 text-xs font-semibold text-cude-textSecondary bg-cude-background-depth-2 border border-cude-borderColor rounded shadow-sm"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}

export const ShortcutsDialog = memo(({ open, onClose }: Props) => {
  const bindings = useStore(shortcutsStore);

  return (
    <DialogRoot
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      {open && (
        <Dialog className="max-w-md w-full p-6" onClose={onClose}>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription className="mt-1">What the keys do, anywhere in Cude.</DialogDescription>
          <div className="mt-4 space-y-2">
            {(Object.entries(bindings) as Array<[string, ShortcutBinding]>).map(([id, binding]) => (
              <div
                key={id}
                className={classNames(
                  'flex items-center justify-between gap-3 p-2.5 rounded-lg',
                  'bg-cude-background-depth-2 border border-cude-borderColor',
                )}
              >
                <span className="text-sm text-cude-textPrimary">{binding.description}</span>
                <Chord binding={binding} />
              </div>
            ))}
          </div>
        </Dialog>
      )}
    </DialogRoot>
  );
});

ShortcutsDialog.displayName = 'ShortcutsDialog';
