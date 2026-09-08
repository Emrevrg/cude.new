/*
 * Cude.new - CloneButton.tsx (Cude product surface, 2026)
 *
 * The clone control, as it sits in the chat box toolbar next to the MCP tools:
 * an icon, not a banner. Cloning is one of the things you can do here, not the
 * headline, and the toolbar is where a person looks for "what else can this
 * box do".
 */
import { useCallback, useState } from 'react';
import { IconButton } from '~/components/ui/IconButton';
import { CloneDialog } from './CloneDialog';

interface Props {
  /** Sends the built prompt as though the person had typed it. */
  onClone: (message: string, title: string) => void;
  disabled?: boolean;
}

export function CloneButton({ onClone, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <IconButton title="Clone a program" disabled={disabled} className="transition-all" onClick={() => setOpen(true)}>
        <div className="i-ph:copy text-xl" />
      </IconButton>

      <CloneDialog open={open} onClose={close} onClone={onClone} />
    </>
  );
}
