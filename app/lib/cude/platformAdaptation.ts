/**
 * Cude.new - Platform-Specific UI Adaptation
 * Design Director owns shared product identity. Platform Architect adapts interaction patterns.
 */

import type { ProjectType } from './platform';
import type { DesignSystem } from './designSystem';

export type NavigationPattern = 'top-tabs' | 'side-rail' | 'bottom-nav' | 'tab-bar' | 'drawer' | 'hamburger';

export type InputMethod = 'touch' | 'pointer' | 'keyboard' | 'mixed';

export type ContentDensity = 'compact' | 'standard' | 'spacious';

export interface PlatformProfile {
  platform: ProjectType | 'all';
  inputMethod: InputMethod;
  primaryNavigation: NavigationPattern;
  touchTargetMin: number; // pixels
  hoverEnabled: boolean;
  contextMenus: boolean;
  keyboardShortcuts: boolean;
  defaultDensity: ContentDensity;
  scrollDirection: 'vertical' | 'horizontal' | 'both';
  contentLayout: 'list' | 'grid' | 'masonry' | 'tabs';
  spacing: 'tight' | 'standard' | 'generous';
  typography: {
    baseFontSize: number;
    scaleRatio: number;
  };
  maxContentWidth: number; // pixels
  recommendedColumns: number; // 1-4
  supportsDarkMode: boolean;
  supportsSystemTheme: boolean;
}

export const platformProfiles: Record<ProjectType | 'all', PlatformProfile> = {
  web: {
    platform: 'web',
    inputMethod: 'mixed',
    primaryNavigation: 'top-tabs',
    touchTargetMin: 44,
    hoverEnabled: true,
    contextMenus: true,
    keyboardShortcuts: true,
    defaultDensity: 'standard',
    scrollDirection: 'vertical',
    contentLayout: 'tabs',
    spacing: 'standard',
    typography: { baseFontSize: 14, scaleRatio: 1.2 },
    maxContentWidth: 1200,
    recommendedColumns: 3,
    supportsDarkMode: true,
    supportsSystemTheme: true,
  },
  android: {
    platform: 'android',
    inputMethod: 'touch',
    primaryNavigation: 'bottom-nav',
    touchTargetMin: 48,
    hoverEnabled: false,
    contextMenus: true,
    keyboardShortcuts: true,
    defaultDensity: 'standard',
    scrollDirection: 'vertical',
    contentLayout: 'list',
    spacing: 'standard',
    typography: { baseFontSize: 14, scaleRatio: 1.15 },
    maxContentWidth: 600,
    recommendedColumns: 1,
    supportsDarkMode: true,
    supportsSystemTheme: true,
  },
  ios: {
    platform: 'ios',
    inputMethod: 'touch',
    primaryNavigation: 'tab-bar',
    touchTargetMin: 44,
    hoverEnabled: false,
    contextMenus: true,
    keyboardShortcuts: true,
    defaultDensity: 'standard',
    scrollDirection: 'vertical',
    contentLayout: 'list',
    spacing: 'standard',
    typography: { baseFontSize: 17, scaleRatio: 1.2 },
    maxContentWidth: 600,
    recommendedColumns: 1,
    supportsDarkMode: true,
    supportsSystemTheme: true,
  },
  mobile: {
    platform: 'mobile',
    inputMethod: 'touch',
    primaryNavigation: 'bottom-nav',
    touchTargetMin: 48,
    hoverEnabled: false,
    contextMenus: true,
    keyboardShortcuts: true,
    defaultDensity: 'standard',
    scrollDirection: 'vertical',
    contentLayout: 'list',
    spacing: 'standard',
    typography: { baseFontSize: 14, scaleRatio: 1.15 },
    maxContentWidth: 600,
    recommendedColumns: 1,
    supportsDarkMode: true,
    supportsSystemTheme: true,
  },
  desktop: {
    platform: 'desktop',
    inputMethod: 'keyboard',
    primaryNavigation: 'side-rail',
    touchTargetMin: 28,
    hoverEnabled: true,
    contextMenus: true,
    keyboardShortcuts: true,
    defaultDensity: 'compact',
    scrollDirection: 'both',
    contentLayout: 'grid',
    spacing: 'tight',
    typography: { baseFontSize: 13, scaleRatio: 1.18 },
    maxContentWidth: 1600,
    recommendedColumns: 4,
    supportsDarkMode: true,
    supportsSystemTheme: true,
  },
  fullstack: {
    platform: 'fullstack',
    inputMethod: 'mixed',
    primaryNavigation: 'top-tabs',
    touchTargetMin: 40,
    hoverEnabled: true,
    contextMenus: true,
    keyboardShortcuts: true,
    defaultDensity: 'standard',
    scrollDirection: 'vertical',
    contentLayout: 'tabs',
    spacing: 'standard',
    typography: { baseFontSize: 14, scaleRatio: 1.2 },
    maxContentWidth: 1280,
    recommendedColumns: 3,
    supportsDarkMode: true,
    supportsSystemTheme: true,
  },
  pwa: {
    platform: 'pwa',
    inputMethod: 'mixed',
    primaryNavigation: 'top-tabs',
    touchTargetMin: 44,
    hoverEnabled: true,
    contextMenus: true,
    keyboardShortcuts: true,
    defaultDensity: 'standard',
    scrollDirection: 'vertical',
    contentLayout: 'grid',
    spacing: 'standard',
    typography: { baseFontSize: 14, scaleRatio: 1.2 },
    maxContentWidth: 1200,
    recommendedColumns: 2,
    supportsDarkMode: true,
    supportsSystemTheme: true,
  },
  'browser-extension': {
    platform: 'browser-extension',
    inputMethod: 'mixed',
    primaryNavigation: 'top-tabs',
    touchTargetMin: 32,
    hoverEnabled: true,
    contextMenus: true,
    keyboardShortcuts: true,
    defaultDensity: 'compact',
    scrollDirection: 'vertical',
    contentLayout: 'list',
    spacing: 'tight',
    typography: { baseFontSize: 13, scaleRatio: 1.15 },
    maxContentWidth: 800,
    recommendedColumns: 1,
    supportsDarkMode: true,
    supportsSystemTheme: true,
  },
  'vscode-extension': {
    platform: 'vscode-extension',
    inputMethod: 'keyboard',
    primaryNavigation: 'top-tabs',
    touchTargetMin: 24,
    hoverEnabled: true,
    contextMenus: true,
    keyboardShortcuts: true,
    defaultDensity: 'compact',
    scrollDirection: 'vertical',
    contentLayout: 'list',
    spacing: 'tight',
    typography: { baseFontSize: 13, scaleRatio: 1.15 },
    maxContentWidth: 800,
    recommendedColumns: 1,
    supportsDarkMode: true,
    supportsSystemTheme: true,
  },
  'ide-extension': {
    platform: 'ide-extension',
    inputMethod: 'keyboard',
    primaryNavigation: 'top-tabs',
    touchTargetMin: 24,
    hoverEnabled: true,
    contextMenus: true,
    keyboardShortcuts: true,
    defaultDensity: 'compact',
    scrollDirection: 'vertical',
    contentLayout: 'list',
    spacing: 'tight',
    typography: { baseFontSize: 13, scaleRatio: 1.15 },
    maxContentWidth: 800,
    recommendedColumns: 1,
    supportsDarkMode: true,
    supportsSystemTheme: true,
  },
  backend: {
    platform: 'backend',
    inputMethod: 'mixed',
    primaryNavigation: 'top-tabs',
    touchTargetMin: 36,
    hoverEnabled: true,
    contextMenus: true,
    keyboardShortcuts: true,
    defaultDensity: 'standard',
    scrollDirection: 'vertical',
    contentLayout: 'list',
    spacing: 'standard',
    typography: { baseFontSize: 14, scaleRatio: 1.2 },
    maxContentWidth: 1200,
    recommendedColumns: 3,
    supportsDarkMode: true,
    supportsSystemTheme: true,
  },

  /*
   * 'auto' means the platform has not been resolved yet; mirror the neutral
   * web profile so callers always get a usable answer.
   */
  auto: {
    platform: 'auto',
    inputMethod: 'mixed',
    primaryNavigation: 'top-tabs',
    touchTargetMin: 44,
    hoverEnabled: true,
    contextMenus: true,
    keyboardShortcuts: true,
    defaultDensity: 'standard',
    scrollDirection: 'vertical',
    contentLayout: 'tabs',
    spacing: 'standard',
    typography: { baseFontSize: 14, scaleRatio: 1.2 },
    maxContentWidth: 1200,
    recommendedColumns: 3,
    supportsDarkMode: true,
    supportsSystemTheme: true,
  },
  all: {
    platform: 'all',
    inputMethod: 'mixed',
    primaryNavigation: 'top-tabs',
    touchTargetMin: 40,
    hoverEnabled: true,
    contextMenus: true,
    keyboardShortcuts: true,
    defaultDensity: 'standard',
    scrollDirection: 'vertical',
    contentLayout: 'grid',
    spacing: 'standard',
    typography: { baseFontSize: 14, scaleRatio: 1.2 },
    maxContentWidth: 1200,
    recommendedColumns: 3,
    supportsDarkMode: true,
    supportsSystemTheme: true,
  },
};

export function getPlatformProfile(platform: ProjectType): PlatformProfile {
  return platformProfiles[platform] || platformProfiles.all;
}

export function adaptDesignSystemToPlatform(baseDesign: DesignSystem, platform: ProjectType): DesignSystem {
  const profile = getPlatformProfile(platform);

  return {
    ...baseDesign,
    identity: { ...baseDesign.identity, platform },
    components: {
      ...baseDesign.components,
      button: {
        ...baseDesign.components.button,
        height:
          profile.inputMethod === 'touch'
            ? `${Math.max(profile.touchTargetMin, 44)}px`
            : profile.inputMethod === 'keyboard'
              ? '32px'
              : baseDesign.components.button.height,
      },
    },
    platform: {
      ...baseDesign.platform,
      [platform]: { touchTargetMin: `${profile.touchTargetMin}px`, density: profile.defaultDensity },
    },
  };
}

export function generatePlatformNavigationCode(platform: ProjectType, designSystem: DesignSystem): string {
  const profile = getPlatformProfile(platform);

  switch (profile.primaryNavigation) {
    case 'top-tabs':
      return generateTopTabsCode(designSystem);
    case 'bottom-nav':
      return generateBottomNavCode(designSystem);
    case 'side-rail':
      return generateSideRailCode(designSystem);
    case 'drawer':
    case 'hamburger':
      return generateDrawerCode(designSystem);
    default:
      return generateTopTabsCode(designSystem);
  }
}

function generateTopTabsCode(ds: DesignSystem): string {
  return `// Top tab navigation - ${ds.identity.platform}
<nav style={{
  display: 'flex',
  gap: '${ds.spacing.scale['1']}',
  padding: '${ds.spacing.scale['2']} ${ds.spacing.scale['4']}',
  borderBottom: '1px solid ${ds.colors.border}',
  background: '${ds.colors.surface}',
}}>
  {items.map(item => (
    <a
      key={item.id}
      style={{
        padding: '${ds.spacing.scale['2']} ${ds.spacing.scale['3']}',
        borderRadius: '${ds.radius.md}',
        background: activeId === item.id ? ds.colors.surfaceHover : 'transparent',
        color: activeId === item.id ? ds.colors.textPrimary : ds.colors.textSecondary,
        minHeight: '${ds.components.button.height}',
        minWidth: '44px',
      }}
    >
      {item.label}
    </a>
  ))}
</nav>`;
}

function generateBottomNavCode(ds: DesignSystem): string {
  return `// Bottom tab navigation - ${ds.identity.platform} (mobile-first)
<nav style={{
  display: 'flex',
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  padding: '${ds.spacing.scale['2']}',
  borderTop: '1px solid ${ds.colors.border}',
  background: '${ds.colors.surface}',
  minHeight: '56px',
}}>
  {items.map(item => (
    <a
      key={item.id}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '${ds.spacing.scale['1']}',
        minHeight: '${ds.components.button.height}',
        minWidth: '44px',
        color: activeId === item.id ? ds.colors.accent : ds.colors.textTertiary,
      }}
    >
      {item.icon && <span>{item.icon}</span>}
      <span style={{ fontSize: '12px', marginTop: '2px' }}>{item.label}</span>
    </a>
  ))}
</nav>`;
}

function generateSideRailCode(ds: DesignSystem): string {
  return `// Side rail navigation - ${ds.identity.platform} (desktop)
<nav style={{
  display: 'flex',
  flexDirection: 'column',
  width: '240px',
  padding: '${ds.spacing.scale['3']}',
  borderRight: '1px solid ${ds.colors.border}',
  background: '${ds.colors.surface}',
  minHeight: '100vh',
}}>
  {items.map(item => (
    <a
      key={item.id}
      style={{
        padding: '${ds.spacing.scale['2']} ${ds.spacing.scale['3']}',
        borderRadius: '${ds.radius.md}',
        marginBottom: '${ds.spacing.scale['1']}',
        minHeight: '${ds.components.button.height}',
        background: activeId === item.id ? ds.colors.surfaceHover : 'transparent',
        color: activeId === item.id ? ds.colors.textPrimary : ds.colors.textSecondary,
        display: 'flex',
        alignItems: 'center',
        gap: '${ds.spacing.scale['2']}',
        textDecoration: 'none',
      }}
    >
      {item.icon && <span style={{ width: '20px' }}>{item.icon}</span>}
      <span>{item.label}</span>
    </a>
  ))}
</nav>`;
}

function generateDrawerCode(ds: DesignSystem): string {
  return `// Drawer/Hamburger navigation - ${ds.identity.platform} (mobile)
<>
  <button
    onClick={() => setOpen(!open)}
    style={{
      padding: '${ds.spacing.scale['2']}',
      minHeight: '${ds.components.button.height}',
      minWidth: '44px',
    }}
  >
    ☰
  </button>
  {open && (
    <nav style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '280px',
      height: '100vh',
      padding: '${ds.spacing.scale['4']}',
      background: '${ds.colors.surface}',
      borderRight: '1px solid ${ds.colors.border}',
      zIndex: 1000,
    }}>
      {items.map(item => (
        <a key={item.id} style={{
          padding: '${ds.spacing.scale['3']}',
          display: 'block',
          color: ds.colors.textPrimary,
          minHeight: '${ds.components.button.height}',
        }}>
          {item.label}
        </a>
      ))}
    </nav>
  )}
</>`;
}

/*
 * ------------------------------------------------------------------ *
 * Platform adapters
 * ------------------------------------------------------------------
 */

/**
 * The concrete, inspectable result of adapting one shared product identity to
 * one platform. Shared identity does not mean identical layout: the tokens and
 * character carry over, the interaction model does not.
 */
export interface PlatformAdapter {
  platform: ProjectType;
  profile: PlatformProfile;

  /** Design system with platform-specific overrides applied. */
  designSystem: DesignSystem;

  /** Navigation chosen for this platform. */
  navigationPattern: NavigationPattern;

  /** Generated navigation scaffold for the selected pattern. */
  navigationCode: string;

  /** Minimum interactive target size in CSS pixels. */
  touchTargetMin: number;
  density: ContentDensity;

  /** Short, user-facing notes explaining what changed and why. */
  adaptationNotes: string[];
}

function adaptationNotesFor(profile: PlatformProfile): string[] {
  const notes: string[] = [];

  if (profile.inputMethod === 'touch') {
    notes.push(`Touch-first: ${profile.touchTargetMin}px minimum interaction targets`);
    notes.push(`${profile.primaryNavigation} navigation for thumb reach`);
  }

  if (profile.inputMethod === 'keyboard' || profile.inputMethod === 'mixed') {
    notes.push('Keyboard shortcuts and context menus enabled');
  }

  if (profile.defaultDensity === 'compact') {
    notes.push('Dense information layout for pointer precision');
  }

  if (!profile.hoverEnabled) {
    notes.push('No hover states — all affordances are visible at rest');
  }

  notes.push(`Up to ${profile.recommendedColumns} column${profile.recommendedColumns === 1 ? '' : 's'}`);

  return notes;
}

/**
 * Produces the platform adaptation for a single target. This is what the
 * Platform Architect stage emits per target, and what the Architecture UI shows.
 */
export function createPlatformAdapter(platform: ProjectType, baseDesign: DesignSystem): PlatformAdapter {
  const profile = getPlatformProfile(platform);
  const designSystem = adaptDesignSystemToPlatform(baseDesign, platform);

  return {
    platform,
    profile,
    designSystem,
    navigationPattern: profile.primaryNavigation,
    navigationCode: generatePlatformNavigationCode(platform, designSystem),
    touchTargetMin: profile.touchTargetMin,
    density: profile.defaultDensity,
    adaptationNotes: adaptationNotesFor(profile),
  };
}

/** Builds adapters for every target of a product family. */
export function createPlatformAdapters(
  platforms: ProjectType[],
  baseDesign: DesignSystem,
): Record<string, PlatformAdapter> {
  const adapters: Record<string, PlatformAdapter> = {};

  for (const platform of platforms) {
    adapters[platform] = createPlatformAdapter(platform, baseDesign);
  }

  return adapters;
}

/**
 * True when two platforms received genuinely different interaction models.
 * Used by verification to prove the same UI was not stretched across targets.
 */
export function adaptationsDiffer(a: PlatformAdapter, b: PlatformAdapter): boolean {
  return (
    a.navigationPattern !== b.navigationPattern ||
    a.touchTargetMin !== b.touchTargetMin ||
    a.density !== b.density ||
    a.profile.inputMethod !== b.profile.inputMethod
  );
}
