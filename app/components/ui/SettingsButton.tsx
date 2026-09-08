// Cude.new - SettingsButton.tsx (Cude product surface, 2026)
/*
 * A theme token, not a fixed hex.
 *
 * These two were the last hardcoded colours in the interface: a mid-grey,
 * legible against a light background and nearly invisible against a dark one,
 * overriding the token the IconButton had already set. The gear and the
 * question mark were the two controls that did not follow the theme.
 */
import { memo } from 'react';
import { IconButton } from '~/components/ui/IconButton';
interface SettingsButtonProps {
  onClick: () => void;
}

export const SettingsButton = memo(({ onClick }: SettingsButtonProps) => {
  return (
    <IconButton
      onClick={onClick}
      icon="i-ph:gear"
      size="xl"
      title="Settings"
      data-testid="settings-button"
      className="text-cude-textTertiary hover:text-cude-textPrimary hover:bg-cude-item-backgroundActive/10 transition-colors"
    />
  );
});

interface HelpButtonProps {
  onClick: () => void;
}

export const HelpButton = memo(({ onClick }: HelpButtonProps) => {
  return (
    <IconButton
      onClick={onClick}
      icon="i-ph:question"
      size="xl"
      title="Help & Documentation"
      data-testid="help-button"
      className="text-cude-textTertiary hover:text-cude-textPrimary hover:bg-cude-item-backgroundActive/10 transition-colors"
    />
  );
});
