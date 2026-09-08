/**
 * Cude.new - Engineering Requirements & Constraints Model
 *
 * Structured representation of what the user actually asked for, extracted from
 * natural language. This is the input to Stack Intelligence and the Product Graph.
 *
 * Design rule: never infer a strict requirement without evidence in the prompt.
 * Anything the user did not speak to stays `unspecified` so that downstream
 * scoring can tell "user does not care" apart from "user asked for medium".
 */

import type { ProjectType } from './platform';

/**
 * Priority ladder. `unspecified` is the default and means "no evidence either
 * way" — it must never be treated as a constraint.
 */
export type Priority = 'unspecified' | 'low' | 'medium' | 'high' | 'critical';

export const PRIORITY_ORDER: Priority[] = ['unspecified', 'low', 'medium', 'high', 'critical'];

export type RequirementValue = string | number | boolean | string[];

export type ExpectedScale = 'unspecified' | 'small' | 'medium' | 'large' | 'enterprise';

/** Numeric rank used for comparisons. `unspecified` ranks below `low`. */
export function priorityRank(p: Priority | undefined): number {
  return PRIORITY_ORDER.indexOf(p ?? 'unspecified');
}

/** True when `p` is at least as strong as `floor`. */
export function isAtLeast(p: Priority | undefined, floor: Priority): boolean {
  return priorityRank(p) >= priorityRank(floor);
}

/** Returns whichever priority is stronger. */
export function maxPriority(a: Priority | undefined, b: Priority | undefined): Priority {
  return priorityRank(a) >= priorityRank(b) ? (a ?? 'unspecified') : (b ?? 'unspecified');
}

export interface EngineeringRequirements {
  /* ---- Platform & deployment ---- */
  targetPlatforms: ProjectType[];
  deploymentConstraints: string[];
  expectedScale: ExpectedScale;

  /* ---- Performance envelope ---- */
  performancePriority: Priority;
  memoryPriority: Priority;
  binarySizePriority: Priority;
  startupSpeedPriority: Priority;

  /* ---- Delivery ---- */
  developmentSpeedPriority: Priority;
  sharedCodePriority: Priority;

  /* ---- Technology constraints ---- */
  preferredLanguages: string[];
  forbiddenLanguages: string[];
  preferredFrameworks: string[];
  forbiddenFrameworks: string[];

  /* ---- Runtime behaviour ---- */
  nativeApiRequirements: string[];
  offlineRequirements: boolean;
  realtimeRequirements: boolean;

  /* ---- Data & identity ---- */
  databaseRequirements: string[];
  authenticationRequirements: string[];
  synchronizationRequirements: string[];

  /* ---- Quality ---- */
  securityPriority: Priority;

  /* ---- Device ---- */
  deviceCapabilities: string[];

  /* ---- Escape hatch ---- */
  customConstraints: Record<string, RequirementValue>;
}

export interface ExtractedRequirements {
  requirements: EngineeringRequirements;

  /** 0-1. Reflects how much of the prompt produced concrete signal. */
  confidence: number;
  sourcePrompt: string;
  extractedAt: string;

  /** Human-readable trace of which phrases drove which requirement. */
  evidence: RequirementEvidence[];
}

export interface RequirementEvidence {
  field: keyof EngineeringRequirements;
  value: string;
  phrase: string;
  hard: boolean;
}

/**
 * Constraints the user states explicitly (via UI or unambiguous prompt language).
 * These are HARD: Stack Intelligence must respect them or surface a conflict.
 */
export interface UserConstraints {
  preferredLanguages?: string[];
  forbiddenLanguages?: string[];
  preferredFrameworks?: string[];
  forbiddenFrameworks?: string[];
  targetPlatforms?: ProjectType[];
  forbiddenPlatforms?: ProjectType[];
  performanceBudget?: {
    maxBundleSize?: string;
    maxMemoryMB?: number;
    maxStartupMs?: number;
  };
  requiredApis?: string[];
  forbiddenApis?: string[];
}

export function createDefaultRequirements(): EngineeringRequirements {
  return {
    targetPlatforms: [],
    deploymentConstraints: [],
    expectedScale: 'unspecified',
    performancePriority: 'unspecified',
    memoryPriority: 'unspecified',
    binarySizePriority: 'unspecified',
    startupSpeedPriority: 'unspecified',
    developmentSpeedPriority: 'unspecified',
    sharedCodePriority: 'unspecified',
    preferredLanguages: [],
    forbiddenLanguages: [],
    preferredFrameworks: [],
    forbiddenFrameworks: [],
    nativeApiRequirements: [],
    offlineRequirements: false,
    realtimeRequirements: false,
    databaseRequirements: [],
    authenticationRequirements: [],
    synchronizationRequirements: [],
    securityPriority: 'unspecified',
    deviceCapabilities: [],
    customConstraints: {},
  };
}

function union<T>(a: readonly T[] | undefined, b: readonly T[] | undefined): T[] {
  return [...new Set([...(a ?? []), ...(b ?? [])])];
}

export function mergeRequirements(
  base: EngineeringRequirements,
  overrides: Partial<EngineeringRequirements>,
): EngineeringRequirements {
  return {
    ...base,
    ...overrides,
    targetPlatforms: union(base.targetPlatforms, overrides.targetPlatforms),
    deploymentConstraints: union(base.deploymentConstraints, overrides.deploymentConstraints),
    preferredLanguages: union(base.preferredLanguages, overrides.preferredLanguages),
    forbiddenLanguages: union(base.forbiddenLanguages, overrides.forbiddenLanguages),
    preferredFrameworks: union(base.preferredFrameworks, overrides.preferredFrameworks),
    forbiddenFrameworks: union(base.forbiddenFrameworks, overrides.forbiddenFrameworks),
    nativeApiRequirements: union(base.nativeApiRequirements, overrides.nativeApiRequirements),
    databaseRequirements: union(base.databaseRequirements, overrides.databaseRequirements),
    authenticationRequirements: union(base.authenticationRequirements, overrides.authenticationRequirements),
    synchronizationRequirements: union(base.synchronizationRequirements, overrides.synchronizationRequirements),
    deviceCapabilities: union(base.deviceCapabilities, overrides.deviceCapabilities),
    customConstraints: { ...base.customConstraints, ...overrides.customConstraints },
  };
}

/*
 * ------------------------------------------------------------------ *
 * Lexicon
 * ------------------------------------------------------------------
 */

interface Term {
  /** Canonical identifier stored in the requirements. */
  id: string;

  /** Regex alternatives, matched case-insensitively on word boundaries. */
  aliases: string[];
}

const LANGUAGE_TERMS: Term[] = [
  { id: 'rust', aliases: ['rust', 'rustlang'] },
  { id: 'kotlin', aliases: ['kotlin'] },
  { id: 'swift', aliases: ['swift'] },
  { id: 'typescript', aliases: ['typescript', 'ts'] },
  { id: 'javascript', aliases: ['javascript', 'js', 'node', 'nodejs', 'node\\.js'] },
  { id: 'python', aliases: ['python'] },
  { id: 'go', aliases: ['golang', 'go lang'] },
  { id: 'csharp', aliases: ['c#', 'csharp', 'c sharp', '\\.net', 'dotnet'] },
  { id: 'cpp', aliases: ['c\\+\\+', 'cpp'] },
  { id: 'java', aliases: ['java'] },
  { id: 'dart', aliases: ['dart'] },
];

const FRAMEWORK_TERMS: Term[] = [
  { id: 'tauri', aliases: ['tauri'] },
  { id: 'electron', aliases: ['electron'] },
  { id: 'flutter', aliases: ['flutter'] },
  { id: 'react-native', aliases: ['react native', 'react-native', 'expo'] },
  { id: 'jetpack-compose', aliases: ['jetpack compose', 'compose multiplatform'] },
  { id: 'swiftui', aliases: ['swiftui', 'swift ui'] },
  { id: 'react', aliases: ['react'] },
  { id: 'next.js', aliases: ['next\\.js', 'nextjs'] },
  { id: 'svelte', aliases: ['svelte', 'sveltekit'] },
  { id: 'vue', aliases: ['vue'] },
  { id: 'astro', aliases: ['astro'] },
  { id: 'qt', aliases: ['qt'] },
  { id: 'axum', aliases: ['axum'] },
  { id: 'gin', aliases: ['gin'] },
  { id: 'hono', aliases: ['hono'] },
  { id: 'express', aliases: ['express'] },
  { id: 'fastapi', aliases: ['fastapi', 'fast api'] },
  { id: 'dotnet', aliases: ['winui', 'wpf', 'maui'] },
];

/**
 * Negation cues. When one of these appears shortly before a technology mention,
 * the mention becomes a prohibition rather than a preference.
 */
const NEGATION_CUES = [
  "don't use",
  'do not use',
  'dont use',
  'do not',
  "don't",
  'without',
  'avoid',
  'never use',
  'never',
  'no longer',
  'not use',
  'instead of',
  'rather than',
  'other than',
  'except',
  'exclude',
  'excluding',
  'forbid',
  'forbidden',
  'ban',
  'banned',
  'stay away from',
  'steer clear of',
  'anything but',
  'no',
];

/** Characters of lookbehind used when testing for a negation cue. */
const NEGATION_WINDOW = 28;

function escapeForClass(alias: string): string {
  return alias;
}

/**
 * Word-boundary-ish matcher. Standard `\b` misbehaves for aliases that start or
 * end with a non-word character (`c++`, `.net`, `c#`), so boundaries are only
 * applied on the sides that actually begin/end with a word character.
 */
function buildTermRegex(alias: string): RegExp {
  const startsWord = /^[a-z0-9]/i.test(alias.replace(/\\/g, ''));
  const endsWord = /[a-z0-9]$/i.test(alias.replace(/\\/g, ''));
  const prefix = startsWord ? '(?<![a-z0-9])' : '';
  const suffix = endsWord ? '(?![a-z0-9])' : '';

  return new RegExp(`${prefix}${escapeForClass(alias)}${suffix}`, 'gi');
}

interface TermHit {
  id: string;
  phrase: string;
  negated: boolean;
  index: number;
}

function findTermHits(prompt: string, terms: Term[]): TermHit[] {
  const hits: TermHit[] = [];

  for (const term of terms) {
    for (const alias of term.aliases) {
      const re = buildTermRegex(alias);
      let m: RegExpExecArray | null;

      while ((m = re.exec(prompt)) !== null) {
        const start = m.index;
        const windowStart = Math.max(0, start - NEGATION_WINDOW);
        const before = prompt.slice(windowStart, start).toLowerCase();
        const negated = NEGATION_CUES.some((cue) => {
          const idx = before.lastIndexOf(cue);

          if (idx === -1) {
            return false;
          }

          /*
           * The cue must be a standalone word adjacent to the mention, and
           * nothing between the cue and the mention may re-affirm usage.
           */
          const after = before.slice(idx + cue.length);
          const cueIsWord = idx === 0 || /[^a-z]/.test(before[idx - 1]);

          return cueIsWord && /^[^a-z]*(use |using |the |a |an )?[^a-z]*$/.test(after);
        });

        hits.push({ id: term.id, phrase: m[0], negated, index: start });
      }
    }
  }

  return hits;
}

/*
 * ------------------------------------------------------------------ *
 * Priority phrase detection
 * ------------------------------------------------------------------
 */

interface PriorityRule {
  field: keyof EngineeringRequirements;
  patterns: RegExp[];
  priority: Priority;
}

/**
 * Comparative phrases such as "X matters more than Y" demote Y. Detected before
 * the positive rules so an explicit de-prioritisation is never overwritten.
 */
const DEPRIORITISE_PATTERNS: Array<{ field: keyof EngineeringRequirements; pattern: RegExp }> = [
  {
    field: 'developmentSpeedPriority',
    pattern:
      /(?:matter|matters|count|counts|weigh|weighs|is|are)\s+more\s+than\s+(?:the\s+)?(?:development|dev|build|iteration|shipping)\s+(?:speed|velocity|time)/i,
  },
  {
    field: 'developmentSpeedPriority',
    pattern: /(?:rather|instead\s+of)\s+than\s+(?:development|dev)\s+(?:speed|velocity)/i,
  },
  {
    field: 'developmentSpeedPriority',
    pattern: /(?:development|dev)\s+(?:speed|velocity|time)\s+(?:is|are)\s+(?:less|not)\s+important/i,
  },
  {
    field: 'performancePriority',
    pattern: /(?:performance|speed)\s+(?:is|are)\s+(?:less|not)\s+(?:important|a\s+priority)/i,
  },
];

const PRIORITY_RULES: PriorityRule[] = [
  {
    field: 'memoryPriority',
    priority: 'high',
    patterns: [
      /\blow\s+(?:memory|ram)\b/i,
      /\b(?:memory|ram)\s+(?:usage|footprint|consumption)\b/i,
      /\bmemory[- ]efficient\b/i,
      /\bminimal\s+(?:memory|ram)\b/i,
    ],
  },
  {
    field: 'startupSpeedPriority',
    priority: 'high',
    patterns: [
      /\bstart(?:up|-up)\s+(?:speed|time|performance)\b/i,
      /\b(?:fast|instant|quick)\s+start(?:up|-up)?\b/i,
      /\bcold\s+start\b/i,
      /\blaunch(?:es)?\s+(?:fast|instantly|quickly)\b/i,
    ],
  },
  {
    field: 'binarySizePriority',
    priority: 'high',
    patterns: [
      /\b(?:lightweight|light-weight)\b/i,
      /\bsmall\s+(?:binary|bundle|download|footprint|distribution|install)\b/i,
      /\btiny\b/i,
      /\bminimal\s+(?:footprint|install|distribution)\b/i,
    ],
  },
  {
    field: 'performancePriority',
    priority: 'high',
    patterns: [
      /\bhigh[- ]performance\b/i,
      /\b(?:performance|throughput|latency)\s+(?:is|are)\s+(?:critical|important|key)\b/i,
      /\b(?:fast|performant)\s+(?:runtime|execution|processing)\b/i,
      /\bcpu[- ]intensive\b/i,
    ],
  },
  {
    field: 'developmentSpeedPriority',
    priority: 'high',
    patterns: [
      /\b(?:quickly|fast|rapidly|asap)\b(?![^.]*\bstart)/i,
      /\bas\s+(?:quickly|fast)\s+as\s+possible\b/i,
      /\b(?:rapid|quick|fast)\s+(?:development|prototyp|iteration|delivery|turnaround)/i,
      /\bship\s+(?:it\s+)?(?:fast|quickly|soon)\b/i,
      /\bmvp\b/i,
      /\bprototype\b/i,
    ],
  },
  {
    field: 'securityPriority',
    priority: 'high',
    patterns: [/\b(?:secure|security|encryption|encrypted|privacy|hipaa|gdpr|soc\s?2|pci)\b/i, /\bsensitive\s+data\b/i],
  },
  {
    field: 'sharedCodePriority',
    priority: 'high',
    patterns: [
      /\bshare[d]?\s+(?:code|logic|business\s+logic|domain)\b/i,
      /\bcode\s+reuse\b/i,
      /\bsingle\s+codebase\b/i,
      /\breuse\s+(?:the\s+)?(?:same\s+)?(?:code|logic)\b/i,
    ],
  },
];

/*
 * ------------------------------------------------------------------ *
 * Platform detection
 * ------------------------------------------------------------------
 */

interface PlatformRule {
  platform: ProjectType;
  patterns: RegExp[];
}

/**
 * Order matters: more specific platforms are tested first so that
 * "browser extension" does not also register as plain "web".
 */
const PLATFORM_RULES: PlatformRule[] = [
  {
    platform: 'vscode-extension',
    patterns: [/\bvs\s?code\s+extension\b/i, /\bvisual\s+studio\s+code\s+extension\b/i, /\bvsix\b/i],
  },
  {
    platform: 'browser-extension',
    patterns: [/\b(?:browser|chrome|firefox|edge)\s+extension\b/i, /\bweb\s?extension\b/i],
  },
  {
    platform: 'ios',
    patterns: [/\bios\b/i, /\biphone\b/i, /\bipad\b/i, /\bapp\s+store\b/i, /\bswiftui\b/i],
  },
  {
    platform: 'android',
    patterns: [/\bandroid\b/i, /\bplay\s+store\b/i, /\bapk\b/i, /\bjetpack\s+compose\b/i],
  },
  {
    platform: 'desktop',
    patterns: [
      /\bdesktop\s+(?:app(?:lication)?|program|client|version|editor|tool)\b/i,
      /\bwindows\b/i,
      /\bmacos\b/i,
      /\bmac\s+os\b/i,
      /\blinux\b/i,
      /\belectron\b/i,
      /\btauri\b/i,
      /\bnative\s+app\s+for\s+(?:windows|mac|linux)\b/i,
    ],
  },
  {
    platform: 'pwa',
    patterns: [/\bpwa\b/i, /\bprogressive\s+web\s+app\b/i],
  },
  {
    platform: 'backend',
    patterns: [/\bbackend\b/i, /\bapi\s+server\b/i, /\bmicroservice\b/i, /\brest\s+api\b/i, /\bgraphql\s+api\b/i],
  },
  {
    platform: 'web',
    patterns: [
      /\bweb\s+(?:app|application|dashboard|platform|site)\b/i,
      /\bwebsite\b/i,
      /\bbrowser\b/i,
      /\bweb\s+dashboard\b/i,
      /\bin\s+the\s+browser\b/i,
      /\bsaas\b/i,
      /\blanding\s+page\b/i,
    ],
  },
  {
    platform: 'mobile',
    patterns: [/\bcross[- ]platform\s+mobile\b/i, /\bmobile\s+app\b/i],
  },
];

/*
 * ------------------------------------------------------------------ *
 * Extraction
 * ------------------------------------------------------------------
 */

/**
 * Parses a natural-language product prompt into structured requirements.
 *
 * Only fields with actual evidence in the prompt are populated; everything else
 * is left at its `unspecified` default so Stack Intelligence can distinguish
 * "no opinion" from "explicitly medium".
 */
export function extractRequirements(prompt: string): ExtractedRequirements {
  const requirements = createDefaultRequirements();
  const evidence: RequirementEvidence[] = [];
  let signals = 0;

  const note = (field: keyof EngineeringRequirements, value: string, phrase: string, hard = false) => {
    evidence.push({ field, value, phrase, hard });
    signals++;
  };

  /* ---- Platforms ---- */
  for (const rule of PLATFORM_RULES) {
    for (const pattern of rule.patterns) {
      const m = pattern.exec(prompt);

      if (m) {
        if (!requirements.targetPlatforms.includes(rule.platform)) {
          requirements.targetPlatforms.push(rule.platform);
          note('targetPlatforms', rule.platform, m[0]);
        }

        break;
      }
    }
  }

  // "mobile" is a generic bucket. If a concrete mobile OS was named, drop it.
  if (
    requirements.targetPlatforms.includes('mobile') &&
    (requirements.targetPlatforms.includes('android') || requirements.targetPlatforms.includes('ios'))
  ) {
    requirements.targetPlatforms = requirements.targetPlatforms.filter((p) => p !== 'mobile');
  }

  // An extension target implies its host, not a standalone web app.
  if (
    requirements.targetPlatforms.includes('browser-extension') ||
    requirements.targetPlatforms.includes('vscode-extension')
  ) {
    requirements.targetPlatforms = requirements.targetPlatforms.filter((p) => p !== 'web');
  }

  /* ---- De-prioritisation (before positive rules) ---- */
  const demoted = new Set<keyof EngineeringRequirements>();

  for (const rule of DEPRIORITISE_PATTERNS) {
    const m = rule.pattern.exec(prompt);

    if (m) {
      (requirements[rule.field] as Priority) = 'low';
      demoted.add(rule.field);
      note(rule.field, 'low', m[0]);
    }
  }

  /* ---- Priorities ---- */
  for (const rule of PRIORITY_RULES) {
    if (demoted.has(rule.field)) {
      continue;
    }

    for (const pattern of rule.patterns) {
      const m = pattern.exec(prompt);

      if (m) {
        (requirements[rule.field] as Priority) = maxPriority(requirements[rule.field] as Priority, rule.priority);
        note(rule.field, rule.priority, m[0]);
        break;
      }
    }
  }

  // "lightweight" is a statement about the shipped artefact as a whole.
  if (isAtLeast(requirements.binarySizePriority, 'high') && /\b(?:lightweight|light-weight|tiny)\b/i.test(prompt)) {
    if (!demoted.has('memoryPriority')) {
      requirements.memoryPriority = maxPriority(requirements.memoryPriority, 'high');
    }
  }

  /* ---- Languages ---- */
  for (const hit of findTermHits(prompt, LANGUAGE_TERMS)) {
    const bucket = hit.negated ? 'forbiddenLanguages' : 'preferredLanguages';

    if (!requirements[bucket].includes(hit.id)) {
      requirements[bucket].push(hit.id);
      note(bucket, hit.id, hit.phrase, true);
    }
  }

  /* ---- Frameworks ---- */
  for (const hit of findTermHits(prompt, FRAMEWORK_TERMS)) {
    const bucket = hit.negated ? 'forbiddenFrameworks' : 'preferredFrameworks';

    if (!requirements[bucket].includes(hit.id)) {
      requirements[bucket].push(hit.id);
      note(bucket, hit.id, hit.phrase, true);
    }
  }

  // A prohibition always beats a co-occurring preference for the same term.
  requirements.preferredLanguages = requirements.preferredLanguages.filter(
    (l) => !requirements.forbiddenLanguages.includes(l),
  );
  requirements.preferredFrameworks = requirements.preferredFrameworks.filter(
    (f) => !requirements.forbiddenFrameworks.includes(f),
  );

  /* ---- Runtime behaviour ---- */
  if (/\b(?:offline|offline[- ]first|local[- ]first)\b/i.test(prompt)) {
    requirements.offlineRequirements = true;
    note('offlineRequirements', 'true', 'offline');
  }

  if (/\b(?:real[- ]?time|realtime|live\s+updates?|websocket)\b/i.test(prompt)) {
    requirements.realtimeRequirements = true;
    note('realtimeRequirements', 'true', 'realtime');
  }

  if (/\b(?:sync|synchroni[sz]e[sd]?|synchroni[sz]ation)\b/i.test(prompt)) {
    requirements.synchronizationRequirements.push('background-sync');
    note('synchronizationRequirements', 'background-sync', 'sync');

    if (requirements.offlineRequirements) {
      requirements.synchronizationRequirements.push('conflict-resolution');
    }
  }

  /* ---- Identity ---- */
  if (/\b(?:biometric|fingerprint|face\s?id)\b/i.test(prompt)) {
    requirements.authenticationRequirements.push('biometric');
    note('authenticationRequirements', 'biometric', 'biometric');
  }

  if (/\b(?:oauth|sso|single\s+sign[- ]on|social\s+login)\b/i.test(prompt)) {
    requirements.authenticationRequirements.push('oauth');
    note('authenticationRequirements', 'oauth', 'oauth');
  }

  if (
    /\b(?:sign\s+in|signs?\s+in|log\s+in|login|authentication|user\s+accounts?|same\s+account)\b/i.test(prompt) &&
    requirements.authenticationRequirements.length === 0
  ) {
    requirements.authenticationRequirements.push('email');
    note('authenticationRequirements', 'email', 'sign in');
  }

  /* ---- Data ---- */
  if (/\b(?:database|db|persist|store\s+data|records?)\b/i.test(prompt)) {
    requirements.databaseRequirements.push('relational');
    note('databaseRequirements', 'relational', 'database');
  }

  if (requirements.offlineRequirements && !requirements.databaseRequirements.includes('local-cache')) {
    requirements.databaseRequirements.push('local-cache');
  }

  /* ---- Device capabilities ---- */
  const capabilityRules: Array<[string, RegExp]> = [
    ['camera', /\b(?:camera|photo|scan(?:ner|ning)?|qr)\b/i],
    ['bluetooth', /\b(?:bluetooth|ble)\b/i],
    ['nfc', /\bnfc\b/i],
    ['gps', /\b(?:gps|location|geolocation|maps?)\b/i],
    ['notifications', /\b(?:push\s+notifications?|notifications?)\b/i],
    ['filesystem', /\b(?:file\s?system|local\s+files?|read\s+files?)\b/i],
  ];

  for (const [cap, pattern] of capabilityRules) {
    if (pattern.test(prompt)) {
      requirements.deviceCapabilities.push(cap);
      requirements.nativeApiRequirements.push(cap);
      note('deviceCapabilities', cap, cap);
    }
  }

  /* ---- Scale ---- */
  if (/\b(?:enterprise|millions\s+of\s+users|large[- ]scale)\b/i.test(prompt)) {
    requirements.expectedScale = 'enterprise';
    note('expectedScale', 'enterprise', 'enterprise');
  } else if (/\b(?:thousands\s+of\s+users|high\s+traffic)\b/i.test(prompt)) {
    requirements.expectedScale = 'large';
    note('expectedScale', 'large', 'large');
  } else if (/\b(?:internal|small\s+team|personal|side\s+project)\b/i.test(prompt)) {
    requirements.expectedScale = 'small';
    note('expectedScale', 'small', 'internal');
  }

  /* ---- Deployment ---- */
  if (/\b(?:app\s+store|play\s+store)\b/i.test(prompt)) {
    requirements.deploymentConstraints.push('app-store');
  }

  if (/\bf[- ]?droid\b/i.test(prompt)) {
    requirements.deploymentConstraints.push('fdroid');
  }

  if (/\b(?:self[- ]host|on[- ]premise|no\s+cloud|air[- ]gapped)\b/i.test(prompt)) {
    requirements.deploymentConstraints.push('self-hosted');
  }

  /* ---- Multi-target implies shared code interest ---- */
  if (requirements.targetPlatforms.length > 1 && requirements.sharedCodePriority === 'unspecified') {
    requirements.sharedCodePriority = 'medium';
  }

  /* ---- Dedupe list fields ---- */
  requirements.deviceCapabilities = [...new Set(requirements.deviceCapabilities)];
  requirements.nativeApiRequirements = [...new Set(requirements.nativeApiRequirements)];
  requirements.databaseRequirements = [...new Set(requirements.databaseRequirements)];
  requirements.authenticationRequirements = [...new Set(requirements.authenticationRequirements)];
  requirements.synchronizationRequirements = [...new Set(requirements.synchronizationRequirements)];
  requirements.deploymentConstraints = [...new Set(requirements.deploymentConstraints)];

  // Confidence grows with signal density but never claims certainty.
  const confidence = Math.min(0.95, 0.25 + signals * 0.07);

  return {
    requirements,
    confidence: requirements.targetPlatforms.length === 0 ? Math.min(confidence, 0.4) : confidence,
    sourcePrompt: prompt,
    extractedAt: new Date().toISOString(),
    evidence,
  };
}

/**
 * Back-compat wrapper used by older call sites. Prefer {@link extractRequirements}.
 */
export function extractRequirementsFromPrompt(prompt: string): {
  requirements: EngineeringRequirements;
  constraints: UserConstraints;
} {
  const extracted = extractRequirements(prompt);

  return {
    requirements: extracted.requirements,
    constraints: deriveUserConstraints(extracted.requirements),
  };
}

/**
 * Promotes the hard parts of extracted requirements into explicit user
 * constraints. Language/framework mentions are treated as binding because the
 * user named a specific technology.
 */
export function deriveUserConstraints(requirements: EngineeringRequirements): UserConstraints {
  return {
    preferredLanguages: [...requirements.preferredLanguages],
    forbiddenLanguages: [...requirements.forbiddenLanguages],
    preferredFrameworks: [...requirements.preferredFrameworks],
    forbiddenFrameworks: [...requirements.forbiddenFrameworks],
    targetPlatforms: [...requirements.targetPlatforms],
    requiredApis: [...requirements.nativeApiRequirements],
  };
}

/**
 * Folds explicit user constraints into a requirements object, returning a new
 * object. Prohibitions win over preferences on conflict.
 */
export function mergeUserConstraints(
  requirements: EngineeringRequirements,
  userConstraints: UserConstraints,
): EngineeringRequirements {
  const merged = mergeRequirements(requirements, {
    preferredLanguages: userConstraints.preferredLanguages,
    forbiddenLanguages: userConstraints.forbiddenLanguages,
    preferredFrameworks: userConstraints.preferredFrameworks,
    forbiddenFrameworks: userConstraints.forbiddenFrameworks,
    targetPlatforms: userConstraints.targetPlatforms,
    nativeApiRequirements: userConstraints.requiredApis,
  });

  merged.preferredLanguages = merged.preferredLanguages.filter((l) => !merged.forbiddenLanguages.includes(l));
  merged.preferredFrameworks = merged.preferredFrameworks.filter((f) => !merged.forbiddenFrameworks.includes(f));

  if (userConstraints.forbiddenPlatforms?.length) {
    merged.targetPlatforms = merged.targetPlatforms.filter((p) => !userConstraints.forbiddenPlatforms!.includes(p));
  }

  if (userConstraints.performanceBudget) {
    const budget = userConstraints.performanceBudget;

    if (budget.maxMemoryMB !== undefined) {
      merged.memoryPriority = maxPriority(merged.memoryPriority, 'high');
      merged.customConstraints.maxMemoryMB = budget.maxMemoryMB;
    }

    if (budget.maxStartupMs !== undefined) {
      merged.startupSpeedPriority = maxPriority(merged.startupSpeedPriority, 'high');
      merged.customConstraints.maxStartupMs = budget.maxStartupMs;
    }

    if (budget.maxBundleSize !== undefined) {
      merged.binarySizePriority = maxPriority(merged.binarySizePriority, 'high');
      merged.customConstraints.maxBundleSize = budget.maxBundleSize;
    }
  }

  return merged;
}

/** Compact human-readable summary used by the Architecture UI. */
export function summarizeRequirements(requirements: EngineeringRequirements): string[] {
  const lines: string[] = [];

  const priorityFields: Array<[string, Priority]> = [
    ['performance', requirements.performancePriority],
    ['memory', requirements.memoryPriority],
    ['binary size', requirements.binarySizePriority],
    ['startup speed', requirements.startupSpeedPriority],
    ['development speed', requirements.developmentSpeedPriority],
    ['shared code', requirements.sharedCodePriority],
    ['security', requirements.securityPriority],
  ];

  for (const [label, priority] of priorityFields) {
    if (priority !== 'unspecified') {
      lines.push(`${label}: ${priority}`);
    }
  }

  if (requirements.preferredLanguages.length) {
    lines.push(`required language: ${requirements.preferredLanguages.join(', ')}`);
  }

  if (requirements.forbiddenLanguages.length) {
    lines.push(`excluded language: ${requirements.forbiddenLanguages.join(', ')}`);
  }

  if (requirements.forbiddenFrameworks.length) {
    lines.push(`excluded framework: ${requirements.forbiddenFrameworks.join(', ')}`);
  }

  if (requirements.offlineRequirements) {
    lines.push('offline capable');
  }

  if (requirements.synchronizationRequirements.length) {
    lines.push('cross-device sync');
  }

  return lines;
}
