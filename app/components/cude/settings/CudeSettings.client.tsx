/**
 * Cude.new - the settings surface, wired up.
 *
 * Binds the Cude settings panel to the components that render each surface.
 * Kept apart from the panel itself so the panel stays a pure frame that can be
 * rendered with any set of surfaces — which is what makes it testable.
 */

import { AvatarDropdown } from '~/components/@settings/core/AvatarDropdown';
import type { SurfaceId } from '~/lib/cude/settings/surfaces';
import { SettingsPanel } from './SettingsPanel';

import ProfileTab from '~/components/@settings/tabs/profile/ProfileTab';
import SettingsTab from '~/components/@settings/tabs/settings/SettingsTab';
import NotificationsTab from '~/components/@settings/tabs/notifications/NotificationsTab';
import FeaturesTab from '~/components/@settings/tabs/features/FeaturesTab';
import { EventLogSurface } from './EventLogSurface';
import { ConnectionSurface } from './ConnectionSurface';
import { DataSurface } from './DataSurface';
import { LocalProvidersSurface } from './LocalProvidersSurface';
import CloudProvidersTab from '~/components/@settings/tabs/providers/cloud/CloudProvidersTab';
import McpTab from '~/components/@settings/tabs/mcp/McpTab';

export interface CudeSettingsProps {
  open: boolean;
  onClose: () => void;
}

function renderSurface(id: SurfaceId) {
  switch (id) {
    case 'profile':
      return <ProfileTab />;
    case 'settings':
      return <SettingsTab />;
    case 'notifications':
      return <NotificationsTab />;
    case 'features':
      return <FeaturesTab />;
    case 'data':
      return <DataSurface />;
    case 'cloud-providers':
      return <CloudProvidersTab />;
    case 'local-providers':
      return <LocalProvidersSurface />;
    case 'github':
    case 'gitlab':
    case 'supabase':
    case 'vercel':
    case 'netlify':
      return <ConnectionSurface service={id} showTitle={false} />;
    case 'event-logs':
      return <EventLogSurface />;
    case 'mcp':
      return <McpTab />;
    default:
      return null;
  }
}

export function CudeSettings({ open, onClose }: CudeSettingsProps) {
  return (
    <SettingsPanel
      open={open}
      onClose={onClose}
      renderSurface={renderSurface}
      headerAccessory={<AvatarDropdown onSelectTab={() => undefined} />}
    />
  );
}
