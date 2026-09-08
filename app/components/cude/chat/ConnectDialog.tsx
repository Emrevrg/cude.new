/**
 * Cude.new - connecting a service from where you needed it.
 *
 * Asked for at the moment a deploy or a clone finds no connection, so the work
 * in progress is not lost to a trip through settings. It renders the same
 * connection surface the settings panel does — one form, one set of rules about
 * where the token goes.
 */

import { useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { ConnectionSurface } from '~/components/cude/settings/ConnectionSurface';
import { useServiceConnection } from '~/lib/cude/state/useServiceConnection';
import type { ServiceId } from '~/lib/cude/state/serviceConnections';

export interface ConnectDialogProps {
  service: ServiceId;
  isOpen: boolean;
  onClose: () => void;
}

export function ConnectDialog({ service, isOpen, onClose }: ConnectDialogProps) {
  const { isConnected } = useServiceConnection(service);

  /*
   * Close on success. The dialog exists to unblock something else, so leaving
   * it open once connected would make the user dismiss it themselves.
   */
  useEffect(() => {
    if (isOpen && isConnected) {
      onClose();
    }
  }, [isOpen, isConnected, onClose]);

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm" />

        <Dialog.Content className="fixed left-1/2 top-1/2 z-[10000] w-[min(440px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-cude-borderColor bg-cude-background-depth-1 p-5 shadow-xl">
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="sr-only">Connect a service</Dialog.Title>

            <div className="flex-1">
              <ConnectionSurface service={service} />
            </div>

            <Dialog.Close
              aria-label="Close"
              className="shrink-0 rounded-lg p-1 text-cude-textTertiary hover:text-cude-textPrimary"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
