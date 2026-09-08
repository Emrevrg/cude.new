/**
 * Cude.new - icons for the settings surfaces.
 *
 * Kept apart from `surfaces.ts` so that file stays plain data with no JSX and
 * can be imported by tests and by non-React code. Icons come from the icon set
 * the app already bundles, plus small inline marks for the services that have
 * their own recognisable glyph.
 */

import { Bell, Cloud, Database, Github, Laptop, List, Settings, Sliders, Star, User, Wrench } from 'lucide-react';
import type { SurfaceId } from '~/lib/cude/settings/surfaces';

type IconProps = { className?: string };

const GitLabMark = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path
      fill="currentColor"
      d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z"
    />
  </svg>
);

const NetlifyMark = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path
      fill="currentColor"
      d="M6.49 19.04h-.23L5.13 17.9v-.24l1.73-1.72h1.2l.15.15v1.2zM5.13 6.31V6.07L6.26 4.9h.23L8.2 6.62v1.2l-.15.15h-1.2zm9.7 9.92h-1.65l-.14-.13v-3.86c0-.7-.27-1.22-1.1-1.24-.42 0-.9 0-1.43.02l-.08.08v5l-.14.13H8.63l-.14-.13V9.7l.14-.14h3.71a2.6 2.6 0 0 1 2.6 2.6v3.94zM7.16 12.9H.14L0 12.77v-1.65l.14-.14h7.02l.14.14v1.65zm16.7-.13l-.14.13H16.7l-.14-.13v-1.65l.14-.14h7.02l.14.14zM11.85 7.1V.14l.14-.14h1.65l.14.14v6.96l-.14.14h-1.65zm0 16.76v-6.96l.14-.14h1.65l.14.14v6.96l-.14.14h-1.65z"
    />
  </svg>
);

const VercelMark = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path fill="currentColor" d="M12 2 22 20H2z" />
  </svg>
);

const SupabaseMark = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path
      fill="currentColor"
      d="M13.3 1.2a.6.6 0 0 1 1.06.5l-.9 7.5h6.3c.9 0 1.37 1.07.77 1.73l-9.83 10.9a.6.6 0 0 1-1.05-.5l.9-7.5H4.24c-.9 0-1.37-1.07-.77-1.73z"
    />
  </svg>
);

/** Icon component for each settings surface. */
export const SURFACE_ICONS: Record<SurfaceId, React.ComponentType<IconProps>> = {
  'cloud-providers': Cloud,
  'local-providers': Laptop,
  mcp: Wrench,
  'event-logs': List,
  features: Star,
  notifications: Bell,
  data: Database,
  github: Github,
  gitlab: GitLabMark,
  netlify: NetlifyMark,
  vercel: VercelMark,
  supabase: SupabaseMark,
  profile: User,
  settings: Sliders,
};

/** Fallback so a surface added without an icon still renders. */
export const DEFAULT_SURFACE_ICON = Settings;

export function surfaceIcon(id: SurfaceId): React.ComponentType<IconProps> {
  return SURFACE_ICONS[id] ?? DEFAULT_SURFACE_ICON;
}
