/*
 * Cude.new - InspireButton.tsx (Cude product surface, 2026)
 *
 * Get Inspired, as it sits in the chat box toolbar next to cloning: an icon,
 * not a banner. Same explorer machinery underneath — a second model maps the
 * reference first — but the contract is different: keep the feel, draw it new.
 */
import { useCallback, useState } from 'react';
import { IconButton } from '~/components/ui/IconButton';
import { CloneDialog } from './CloneDialog';

interface Props {
  /** Sends the built prompt as though the person had typed it. */
  onInspire: (message: string, title: string) => void;
  disabled?: boolean;
}

export function InspireButton({ onInspire, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <IconButton
        title="Get Inspired — study a reference, design something new"
        disabled={disabled}
        className="transition-all"
        onClick={() => setOpen(true)}
      >
        <div className="i-ph:sparkle text-xl" />
      </IconButton>

      <CloneDialog open={open} onClose={close} onClone={onInspire} mode="inspire" />
    </>
  );
}
