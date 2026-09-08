// Cude.new - ExportChatButton.tsx (Cude product surface, 2026)
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';

export const ExportChatButton = ({ exportChat }: { exportChat?: () => void }) => {
  return (
    <DropdownMenu.Root>
      {/* Ghost styling matches the other workbench project actions. */}
      <DropdownMenu.Trigger
        title="Export project or chat"
        aria-label="Export project or chat"
        className={classNames(
          'shrink-0 h-7 px-2 rounded-md flex items-center gap-1.5 text-xs whitespace-nowrap transition-colors',
          'text-cude-textSecondary hover:text-cude-textPrimary hover:bg-cude-background-depth-3',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cude-textTertiary',
          '[&:is(:disabled,.disabled)]:cursor-not-allowed [&:is(:disabled,.disabled)]:opacity-50',
        )}
      >
        <span className="i-ph:export text-sm" />
        <span className="hidden xl:inline">Export</span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        className={classNames(
          'z-[250]',
          'bg-cude-background-depth-2',
          'rounded-lg shadow-lg',
          'border border-cude-borderColor',
          'animate-in fade-in-0 zoom-in-95',
          'py-1',
        )}
        sideOffset={5}
        align="end"
      >
        <DropdownMenu.Item
          className={classNames(
            'cursor-pointer flex items-center w-auto px-4 py-2 text-sm text-cude-textPrimary hover:bg-cude-item-backgroundActive gap-2 rounded-md group relative',
          )}
          onClick={() => {
            workbenchStore.downloadZip();
          }}
        >
          <div className="i-ph:code size-4.5"></div>
          <span>Download Code</span>
        </DropdownMenu.Item>
        <DropdownMenu.Item
          className={classNames(
            'cursor-pointer flex items-center w-full px-4 py-2 text-sm text-cude-textPrimary hover:bg-cude-item-backgroundActive gap-2 rounded-md group relative',
          )}
          onClick={() => exportChat?.()}
        >
          <div className="i-ph:chat size-4.5"></div>
          <span>Export Chat</span>
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
};
