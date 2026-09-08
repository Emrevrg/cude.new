/**
 * Cude.new - settings surfaces.
 *
 * The settings panel's information architecture, expressed as Cude's own
 * product model rather than a flat list of integrations. Each surface belongs
 * to a group that says *why* it exists:
 *
 *   engine     what Cude builds with — providers, model access
 *   pipeline   what Cude did — the event journal, features it can use
 *   project    the user's data — export, import, connected repositories
 *   you        identity and preferences
 *
 * The inherited panel listed fourteen tabs in one undifferentiated grid, so a
 * provider key and a deployment integration sat at the same level as the user's
 * avatar.
 */

export type SurfaceId =
  | 'profile'
  | 'settings'
  | 'notifications'
  | 'features'
  | 'data'
  | 'cloud-providers'
  | 'local-providers'
  | 'github'
  | 'gitlab'
  | 'netlify'
  | 'vercel'
  | 'supabase'
  | 'event-logs'
  | 'mcp';

export type SurfaceGroup = 'engine' | 'pipeline' | 'project' | 'you';

export interface SurfaceDefinition {
  id: SurfaceId;
  label: string;
  description: string;
  group: SurfaceGroup;

  /** Shown with a BETA marker. */
  beta?: boolean;
}

export const SURFACE_GROUPS: Array<{ id: SurfaceGroup; label: string; description: string }> = [
  { id: 'engine', label: 'Engine', description: 'The models and providers Cude builds with.' },
  { id: 'pipeline', label: 'Pipeline', description: 'What Cude did, and what it is allowed to do.' },
  { id: 'project', label: 'Project', description: 'Your data and the services it connects to.' },
  { id: 'you', label: 'You', description: 'Identity and preferences.' },
];

export const SURFACES: SurfaceDefinition[] = [
  {
    id: 'cloud-providers',
    label: 'Cloud Providers',
    description: 'Connect hosted model providers and pick which are available.',
    group: 'engine',
  },
  {
    id: 'local-providers',
    label: 'Local Providers',
    description: 'Use models running on this machine.',
    group: 'engine',
    beta: true,
  },
  {
    id: 'mcp',
    label: 'MCP Servers',
    description: 'Give Cude access to external tools.',
    group: 'engine',
    beta: true,
  },
  {
    id: 'event-logs',
    label: 'Event Logs',
    description: 'Everything the pipeline recorded, by stage.',
    group: 'pipeline',
  },
  {
    id: 'features',
    label: 'Features',
    description: 'Turn parts of the engineering pipeline on and off.',
    group: 'pipeline',
  },
  {
    id: 'notifications',
    label: 'Notifications',
    description: 'What Cude tells you about, and when.',
    group: 'pipeline',
  },
  {
    id: 'data',
    label: 'Data Management',
    description: 'Export, import and clear what Cude has stored.',
    group: 'project',
  },
  {
    id: 'github',
    label: 'GitHub',
    description: 'Import repositories and publish what Cude builds.',
    group: 'project',
  },
  {
    id: 'gitlab',
    label: 'GitLab',
    description: 'Import repositories and publish what Cude builds.',
    group: 'project',
  },
  {
    id: 'netlify',
    label: 'Netlify',
    description: 'Deploy a built product to Netlify.',
    group: 'project',
  },
  {
    id: 'vercel',
    label: 'Vercel',
    description: 'Deploy a built product to Vercel.',
    group: 'project',
  },
  {
    id: 'supabase',
    label: 'Supabase',
    description: 'Give a product a database, auth and storage.',
    group: 'project',
  },
  {
    id: 'profile',
    label: 'Profile',
    description: 'Your name and avatar.',
    group: 'you',
  },
  {
    id: 'settings',
    label: 'Preferences',
    description: 'Theme, language and how Cude behaves.',
    group: 'you',
  },
];

const BY_ID = new Map(SURFACES.map((surface) => [surface.id, surface]));

export function getSurface(id: SurfaceId): SurfaceDefinition | undefined {
  return BY_ID.get(id);
}

/** Ids this build ships, in display order. */
export function surfaceIds(): SurfaceId[] {
  return SURFACES.map((surface) => surface.id);
}

/** Surfaces in one group, in display order. */
export function surfacesInGroup(group: SurfaceGroup): SurfaceDefinition[] {
  return SURFACES.filter((surface) => surface.group === group);
}

/**
 * Group the visible surfaces for rendering.
 *
 * Empty groups are dropped, so hiding every provider surface does not leave an
 * "Engine" heading with nothing under it.
 */
export function groupSurfaces(visible: SurfaceId[]): Array<{
  id: SurfaceGroup;
  label: string;
  description: string;
  surfaces: SurfaceDefinition[];
}> {
  const allowed = new Set(visible);

  return SURFACE_GROUPS.map((group) => ({
    ...group,
    surfaces: surfacesInGroup(group.id).filter((surface) => allowed.has(surface.id)),
  })).filter((group) => group.surfaces.length > 0);
}
