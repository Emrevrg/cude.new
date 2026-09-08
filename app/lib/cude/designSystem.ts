/**
 * Cude.new - Design Intelligence: Design Director + Design System
 * Machine-readable, executable, platform-aware.
 */

export type Density = 'compact' | 'medium' | 'spacious';
export type Personality = string;

export interface DesignColors {
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceHover: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  borderStrong: string;
  accent: string;
  accentHover: string;
  accentText: string;
  success: string;
  warning: string;
  danger: string;
  overlay: string;
}

export interface TypographyScale {
  fontFamily: string;
  fontMono: string;
  display: { size: string; weight: number; lineHeight: string; letterSpacing: string };
  h1: { size: string; weight: number; lineHeight: string };
  h2: { size: string; weight: number; lineHeight: string };
  h3: { size: string; weight: number; lineHeight: string };
  body: { size: string; weight: number; lineHeight: string };
  small: { size: string; weight: number; lineHeight: string };
  caption: { size: string; weight: number; lineHeight: string };
  tabularNumerals: boolean;
}

export interface SpacingSystem {
  base: number;
  scale: Record<string, string>;
  densityMultiplier: number;
}

export interface RadiusSystem {
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  full: string;
}

export interface ShadowSystem {
  none: string;
  sm: string;
  md: string;
  lg: string;
}

export interface MotionSystem {
  durationFast: string;
  durationNormal: string;
  durationSlow: string;
  easing: string;
  easingEmphasis: string;
  reduceMotion: boolean;
}

export interface ComponentConventions {
  button: { height: string; px: string; radius: string; fontWeight: number; textTransform: string };
  input: { height: string; radius: string; borderWidth: string };
  card: { padding: string; radius: string; borderWidth: string };
  panel: { padding: string; radius: string };
  nav: { height: string; style: string };
  modal: { radius: string; overlay: string };
  badge: { radius: string };
  table: { rowHeight: string; headerWeight: number };
  emptyState: { iconSize: string };
}

export interface DesignSystem {
  meta: { createdAt: string; version: number; prompt: string; preset?: string };
  identity: {
    personality: Personality[];
    audience: string;
    density: Density;
    hierarchy: string;
    platform: string;
  };
  colors: DesignColors;
  typography: TypographyScale;
  spacing: SpacingSystem;
  radius: RadiusSystem;
  shadow: ShadowSystem;
  motion: MotionSystem;
  breakpoints: Record<string, string>;
  components: ComponentConventions;

  // platform overrides
  platform: {
    web: Partial<DesignSystem>;
    android: { touchTargetMin: string };
    ios: { touchTargetMin: string };
    desktop: { density: Density };
  };
}

// Presets as starting directions (seed, not rigid templates)
export type PresetId = 'minimal' | 'technical' | 'editorial' | 'luxury' | 'playful' | 'brutalist' | 'custom';

interface PresetHints {
  density: Density;
  radius: RadiusSystem;
  shadow: ShadowSystem;
  personality: Personality[];
}

const PRESET_HINTS: Record<PresetId, PresetHints> = {
  minimal: {
    density: 'medium',
    radius: { xs: '4px', sm: '6px', md: '8px', lg: '12px', xl: '16px', full: '9999px' },
    shadow: {
      none: 'none',
      sm: '0 1px 2px rgba(0,0,0,0.06)',
      md: '0 4px 12px rgba(0,0,0,0.08)',
      lg: '0 10px 30px rgba(0,0,0,0.12)',
    },
    personality: ['minimal', 'restrained', 'precise'],
  },
  technical: {
    density: 'compact',
    radius: { xs: '2px', sm: '4px', md: '6px', lg: '8px', xl: '10px', full: '9999px' },
    shadow: {
      none: 'none',
      sm: '0 1px 0 rgba(0,0,0,0.08)',
      md: '0 2px 8px rgba(0,0,0,0.10)',
      lg: '0 8px 20px rgba(0,0,0,0.14)',
    },
    personality: ['technical', 'compact', 'keyboard-oriented'],
  },
  editorial: {
    density: 'spacious',
    radius: { xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '20px', full: '9999px' },
    shadow: {
      none: 'none',
      sm: '0 2px 8px rgba(0,0,0,0.06)',
      md: '0 8px 24px rgba(0,0,0,0.10)',
      lg: '0 16px 40px rgba(0,0,0,0.14)',
    },
    personality: ['editorial', 'spacious', 'typography-focused'],
  },
  luxury: {
    density: 'spacious',
    radius: { xs: '2px', sm: '4px', md: '8px', lg: '12px', xl: '16px', full: '9999px' },
    shadow: {
      none: 'none',
      sm: '0 1px 3px rgba(0,0,0,0.08)',
      md: '0 6px 18px rgba(0,0,0,0.12)',
      lg: '0 12px 36px rgba(0,0,0,0.16)',
    },
    personality: ['luxury', 'restrained', 'editorial'],
  },
  playful: {
    density: 'medium',
    radius: { xs: '6px', sm: '10px', md: '14px', lg: '18px', xl: '24px', full: '9999px' },
    shadow: {
      none: 'none',
      sm: '0 2px 6px rgba(0,0,0,0.08)',
      md: '0 6px 18px rgba(0,0,0,0.12)',
      lg: '0 12px 32px rgba(0,0,0,0.16)',
    },
    personality: ['playful', 'friendly', 'approachable'],
  },
  brutalist: {
    density: 'medium',
    radius: { xs: '0px', sm: '0px', md: '2px', lg: '4px', xl: '6px', full: '9999px' },
    shadow: {
      none: 'none',
      sm: '4px 4px 0 rgba(0,0,0,1)',
      md: '6px 6px 0 rgba(0,0,0,1)',
      lg: '8px 8px 0 rgba(0,0,0,1)',
    },
    personality: ['brutalist', 'bold', 'high-contrast'],
  },
  custom: {
    density: 'medium',
    radius: { xs: '4px', sm: '6px', md: '8px', lg: '12px', xl: '16px', full: '9999px' },
    shadow: {
      none: 'none',
      sm: '0 1px 2px rgba(0,0,0,0.06)',
      md: '0 4px 12px rgba(0,0,0,0.08)',
      lg: '0 10px 30px rgba(0,0,0,0.12)',
    },
    personality: ['custom'],
  },
};

function inferPreset(prompt: string): PresetId {
  const p = prompt.toLowerCase();

  if (/finance|dashboard|analytics|precise|premium|trustworthy/.test(p)) {
    return 'technical';
  }

  if (/luxury|commerce|fashion|editorial/.test(p)) {
    return 'luxury';
  }

  if (/developer|tool|keyboard|compact|technical/.test(p)) {
    return 'technical';
  }

  if (/children|education|playful|friendly/.test(p)) {
    return 'playful';
  }

  if (/portfolio|creative|expressive/.test(p)) {
    return 'editorial';
  }

  if (/brutalist|bold/.test(p)) {
    return 'brutalist';
  }

  if (/scientific|instrument/.test(p)) {
    return 'technical';
  }

  if (/healthcare|soft|approachable/.test(p)) {
    return 'minimal';
  }

  return 'minimal';
}

function financeColors(): DesignColors {
  return {
    background: '#F8F9FA',
    surface: '#FFFFFF',
    surfaceElevated: '#FFFFFF',
    surfaceHover: '#F1F3F5',
    textPrimary: '#0B0D0E',
    textSecondary: '#5A6169',
    textTertiary: '#8A9199',
    border: '#E6E8EB',
    borderStrong: '#D0D5DA',
    accent: '#0F172A',
    accentHover: '#1E293B',
    accentText: '#FFFFFF',
    success: '#0A7F4A',
    warning: '#B45309',
    danger: '#DC2626',
    overlay: 'rgba(0,0,0,0.45)',
  };
}

function technicalColors(): DesignColors {
  return {
    background: '#0A0A0A',
    surface: '#111111',
    surfaceElevated: '#181818',
    surfaceHover: '#1F1F1F',
    textPrimary: '#FFFFFF',
    textSecondary: '#A0A0A0',
    textTertiary: '#777777',
    border: '#222222',
    borderStrong: '#303030',
    accent: '#FFFFFF',
    accentHover: '#EFEFEF',
    accentText: '#000000',
    success: '#22C55E',
    warning: '#F59E0B',
    danger: '#EF4444',
    overlay: 'rgba(0,0,0,0.6)',
  };
}

function luxuryColors(): DesignColors {
  return {
    background: '#FDFBF7',
    surface: '#FFFFFF',
    surfaceElevated: '#FFFEFC',
    surfaceHover: '#F5F1E8',
    textPrimary: '#1A1A1A',
    textSecondary: '#6B6B6B',
    textTertiary: '#9A9A9A',
    border: '#E8E0D0',
    borderStrong: '#D4CAB5',
    accent: '#1A1A1A',
    accentHover: '#2A2A2A',
    accentText: '#FFFFFF',
    success: '#2D6A4F',
    warning: '#9C6644',
    danger: '#9B2226',
    overlay: 'rgba(26,26,26,0.45)',
  };
}

function playfulColors(): DesignColors {
  return {
    background: '#FFFBEB',
    surface: '#FFFFFF',
    surfaceElevated: '#FFF7ED',
    surfaceHover: '#FFEDD5',
    textPrimary: '#1F2937',
    textSecondary: '#6B7280',
    textTertiary: '#9CA3AF',
    border: '#FDE68A',
    borderStrong: '#FCD34D',
    accent: '#F59E0B',
    accentHover: '#D97706',
    accentText: '#FFFFFF',
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
    overlay: 'rgba(31,41,55,0.45)',
  };
}

export function createDesignSystem(prompt: string, presetOverride?: PresetId): DesignSystem {
  const preset = presetOverride ?? inferPreset(prompt);
  const hints = PRESET_HINTS[preset];

  // Derive personality/audience from prompt
  const pl = prompt.toLowerCase();
  let personality = [...hints.personality];
  let audience = 'general';
  let hierarchy = 'information hierarchy prioritized over decoration';

  if (/finance|dashboard|analytics/.test(pl)) {
    personality = ['precise', 'trustworthy', 'restrained', 'financial', 'information-dense'];
    audience = 'professionals managing personal finances';
    hierarchy = 'data hierarchy, strong numerical readability';
  } else if (/developer|tool/.test(pl)) {
    personality = ['compact', 'technical', 'keyboard-oriented', 'precise'];
    audience = 'developers and power users';
  } else if (/luxury|commerce/.test(pl)) {
    personality = ['luxury', 'spacious', 'editorial', 'restrained'];
    audience = 'premium shoppers';
  } else if (/children|education/.test(pl)) {
    personality = ['friendly', 'expressive', 'accessible', 'playful'];
    audience = 'children and educators';
  }

  // Density based on preset or prompt
  let density: Density = hints.density;

  if (/compact|dense|developer/.test(pl)) {
    density = 'compact';
  }

  if (/spacious|editorial|luxury/.test(pl)) {
    density = 'spacious';
  }

  // Colors per preset
  let colors: DesignColors;

  switch (preset) {
    case 'technical':
      colors = technicalColors();
      break;
    case 'luxury':
      colors = luxuryColors();
      break;
    case 'playful':
      colors = playfulColors();
      break;
    case 'editorial':
      colors = { ...luxuryColors(), accent: '#0F172A' };
      break;
    default:
      // Finance premium uses financeColors (trustworthy)
      if (personality.includes('financial')) {
        colors = financeColors();
      } else {
        colors = financeColors();
      } // default trustworthy
  }

  // For finance premium, start with restrained medium radius (8px) to demonstrate global sharpness change to 6px
  let effectiveRadius = hints.radius;

  if (personality.includes('financial')) {
    effectiveRadius = PRESET_HINTS.minimal.radius; // 8px md, 12px lg — premium trustworthy, not ultra-sharp initially
  }

  const isCompact = density === 'compact';
  const spacingScale: Record<string, string> = isCompact
    ? {
        '0': '0',
        '1': '4px',
        '2': '8px',
        '3': '12px',
        '4': '16px',
        '5': '20px',
        '6': '24px',
        '8': '32px',
        '10': '40px',
        '12': '48px',
      }
    : density === 'spacious'
      ? {
          '0': '0',
          '1': '4px',
          '2': '8px',
          '3': '16px',
          '4': '24px',
          '5': '32px',
          '6': '40px',
          '8': '56px',
          '10': '80px',
          '12': '96px',
        }
      : {
          '0': '0',
          '1': '4px',
          '2': '8px',
          '3': '12px',
          '4': '16px',
          '5': '24px',
          '6': '32px',
          '8': '48px',
          '10': '64px',
          '12': '80px',
        };

  return {
    meta: { createdAt: new Date().toISOString(), version: 1, prompt: prompt.slice(0, 400), preset },
    identity: { personality, audience, density, hierarchy, platform: 'web' },
    colors,
    typography: {
      fontFamily: "'Inter', 'Geist Sans', system-ui, -apple-system, sans-serif",
      fontMono: "'Geist Mono','JetBrains Mono', monospace",
      display: { size: '32px', weight: 700, lineHeight: '1.1', letterSpacing: '-0.02em' },
      h1: { size: '22px', weight: 600, lineHeight: '1.3' },
      h2: { size: '18px', weight: 600, lineHeight: '1.4' },
      h3: { size: '15px', weight: 600, lineHeight: '1.4' },
      body: { size: '14px', weight: 400, lineHeight: '1.6' },
      small: { size: '12px', weight: 400, lineHeight: '1.5' },
      caption: { size: '11px', weight: 500, lineHeight: '1.4' },
      tabularNumerals: personality.includes('financial') || personality.includes('precise'),
    },
    spacing: { base: 4, scale: spacingScale, densityMultiplier: isCompact ? 0.85 : density === 'spacious' ? 1.25 : 1 },
    radius: effectiveRadius,
    shadow: hints.shadow,
    motion: {
      durationFast: '120ms',
      durationNormal: '200ms',
      durationSlow: '320ms',
      easing: 'cubic-bezier(0.4,0,0.2,1)',
      easingEmphasis: 'cubic-bezier(0.2,0,0,1)',
      reduceMotion: false,
    },
    breakpoints: { sm: '640px', md: '768px', lg: '1024px', xl: '1280px' },
    components: {
      button: {
        height: isCompact ? '32px' : '36px',
        px: isCompact ? '12px' : '14px',
        radius: effectiveRadius.md,
        fontWeight: 500,
        textTransform: 'none',
      },
      input: { height: isCompact ? '32px' : '36px', radius: effectiveRadius.md, borderWidth: '1px' },
      card: { padding: isCompact ? '16px' : '20px', radius: effectiveRadius.lg, borderWidth: '1px' },
      panel: { padding: isCompact ? '16px' : '24px', radius: effectiveRadius.lg },
      nav: { height: '48px', style: 'top-tabs+hamburger-mobile' },
      modal: { radius: effectiveRadius.xl, overlay: colors.overlay },
      badge: { radius: hints.radius.full },
      table: { rowHeight: isCompact ? '40px' : '44px', headerWeight: 600 },
      emptyState: { iconSize: '40px' },
    },
    platform: {
      web: {},
      android: { touchTargetMin: '48px' },
      ios: { touchTargetMin: '44px' },
      desktop: { density: isCompact ? 'compact' : 'medium' },
    },
  };
}

export function designSystemToCssVars(ds: DesignSystem): string {
  return `:root{
  --color-background:${ds.colors.background};
  --color-surface:${ds.colors.surface};
  --color-surface-elevated:${ds.colors.surfaceElevated};
  --color-surface-hover:${ds.colors.surfaceHover};
  --color-text-primary:${ds.colors.textPrimary};
  --color-text-secondary:${ds.colors.textSecondary};
  --color-text-tertiary:${ds.colors.textTertiary};
  --color-border:${ds.colors.border};
  --color-border-strong:${ds.colors.borderStrong};
  --color-accent:${ds.colors.accent};
  --color-accent-hover:${ds.colors.accentHover};
  --color-accent-text:${ds.colors.accentText};
  --color-success:${ds.colors.success};
  --color-warning:${ds.colors.warning};
  --color-danger:${ds.colors.danger};
  --font-family:${ds.typography.fontFamily};
  --font-mono:${ds.typography.fontMono};
  --radius-xs:${ds.radius.xs};
  --radius-sm:${ds.radius.sm};
  --radius-md:${ds.radius.md};
  --radius-lg:${ds.radius.lg};
  --radius-xl:${ds.radius.xl};
  --space-1:${ds.spacing.scale['1']};
  --space-2:${ds.spacing.scale['2']};
  --space-3:${ds.spacing.scale['3']};
  --space-4:${ds.spacing.scale['4']};
  --space-6:${ds.spacing.scale['6']};
  --shadow-sm:${ds.shadow.sm};
  --shadow-md:${ds.shadow.md};
  --shadow-lg:${ds.shadow.lg};
  --motion-fast:${ds.motion.durationFast};
  --motion-normal:${ds.motion.durationNormal};
  --motion-easing:${ds.motion.easing};
  --component-button-height:${ds.components.button.height};
  --component-input-height:${ds.components.input.height};
  --component-card-padding:${ds.components.card.padding};
  --component-nav-height:${ds.components.nav.height};
}`;
}

export function updateDesignSystem(ds: DesignSystem, patch: Partial<DesignSystem>): DesignSystem {
  return {
    ...ds,
    ...patch,
    meta: { ...ds.meta, version: ds.meta.version + 1 },
    colors: { ...ds.colors, ...(patch.colors ?? {}) },
    radius: { ...ds.radius, ...(patch.radius ?? {}) },
    spacing: patch.spacing
      ? { ...ds.spacing, ...patch.spacing, scale: { ...ds.spacing.scale, ...(patch.spacing.scale ?? {}) } }
      : ds.spacing,
    components: { ...ds.components, ...(patch.components ?? {}) },
  };
}

export function applyGlobalCompactSharp(ds: DesignSystem): DesignSystem {
  // Global change: more compact + sharper corners, preserve identity
  const currentRadius = ds.radius;
  const sharper: RadiusSystem = {
    xs: '2px',
    sm: '4px',
    md: '6px',
    lg: '8px',
    xl: '10px',
    full: currentRadius.full,
  };
  const moreCompactScale: Record<string, string> = {
    '0': '0',
    '1': '2px',
    '2': '6px',
    '3': '10px',
    '4': '14px',
    '5': '18px',
    '6': '22px',
    '8': '28px',
    '10': '36px',
    '12': '44px',
  };

  return {
    ...ds,
    meta: { ...ds.meta, version: ds.meta.version + 1 },
    identity: { ...ds.identity, density: 'compact' },
    radius: sharper,
    spacing: { ...ds.spacing, scale: moreCompactScale, densityMultiplier: 0.8 },
    components: {
      ...ds.components,
      button: { ...ds.components.button, height: '30px', px: '10px', radius: sharper.md },
      input: { ...ds.components.input, height: '30px', radius: sharper.md },
      card: { ...ds.components.card, padding: '12px', radius: sharper.lg },
      panel: { ...ds.components.panel, padding: '14px', radius: sharper.lg },
    },
  };
}

export function validateDesignSystem(ds: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!ds?.colors?.background) {
    errors.push('missing colors.background');
  }

  if (!ds?.colors?.accent) {
    errors.push('missing colors.accent');
  }

  if (!ds?.typography?.fontFamily) {
    errors.push('missing typography.fontFamily');
  }

  if (!ds?.spacing?.scale) {
    errors.push('missing spacing.scale');
  }

  if (!ds?.radius?.md) {
    errors.push('missing radius.md');
  }

  if (!ds?.components?.button) {
    errors.push('missing components.button');
  }

  return { valid: errors.length === 0, errors };
}
