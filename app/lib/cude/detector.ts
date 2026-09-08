/**
 * Cude.new - AUTO Platform Detector
 * Infers ProjectType from natural language prompt.
 */
import type { ProjectType } from './platform';

interface DetectionRule {
  type: ProjectType;
  keywords: RegExp[];
  weight: number;
}

const RULES: DetectionRule[] = [
  {
    type: 'browser-extension',
    keywords: [
      /chrome extension/i,
      /browser extension/i,
      /manifest\s*v3/i,
      /content script/i,
      /popup.*extension/i,
      /chromium/i,
      /firefox extension/i,
    ],
    weight: 10,
  },
  {
    type: 'vscode-extension',
    keywords: [/vs\s*code extension/i, /vscode extension/i, /code extension/i, /visual studio code/i],
    weight: 10,
  },
  {
    type: 'desktop',
    keywords: [
      /desktop app/i,
      /electron/i,
      /tauri/i,
      /native desktop/i,
      /windows app/i,
      /macos app/i,
      /linux app/i,
      /markdown editor.*desktop/i,
    ],
    weight: 8,
  },
  {
    type: 'android',
    keywords: [/android app/i, /android application/i, /kotlin/i, /jetpack compose/i, /apk/i, /play store/i],
    weight: 9,
  },
  {
    type: 'ios',
    keywords: [/\bios app/i, /\bios application/i, /swiftui/i, /swift\s+app/i, /iphone app/i],
    weight: 9,
  },
  {
    type: 'mobile',
    keywords: [
      /mobile app/i,
      /react native/i,
      /expo/i,
      /flutter/i,
      /cross-platform mobile/i,
      /android and ios/i,
      /ios and android/i,
      /android.*ios/i,
      /ios.*android/i,
    ],
    weight: 9,
  },
  {
    type: 'pwa',
    keywords: [/pwa/i, /progressive web app/i, /offline.*web/i, /installable web/i],
    weight: 8,
  },
  {
    type: 'backend',
    keywords: [/backend/i, /\bapi\b/i, /rest api/i, /graphql api/i, /microservice/i, /server.*api/i],
    weight: 7,
  },
  {
    type: 'fullstack',
    keywords: [/full.?stack/i, /saas/i, /dashboard.*auth/i, /with auth/i, /database.*app/i, /crud.*app/i],
    weight: 6,
  },
  {
    type: 'web',
    keywords: [/website/i, /web app/i, /landing page/i, /portfolio/i, /blog/i, /ecommerce/i, /shop/i],
    weight: 5,
  },
];

export function detectProjectType(prompt: string): ProjectType {
  const scores = new Map<ProjectType, number>();

  for (const rule of RULES) {
    for (const re of rule.keywords) {
      if (re.test(prompt)) {
        scores.set(rule.type, (scores.get(rule.type) ?? 0) + rule.weight);
      }
    }
  }

  if (scores.size === 0) {
    return 'web';
  }

  let best: ProjectType = 'web';
  let bestScore = -1;

  for (const [type, score] of scores.entries()) {
    if (score > bestScore) {
      bestScore = score;
      best = type;
    }
  }

  return best;
}

export function detectProjectTypeWithReason(prompt: string): { type: ProjectType; reason: string } {
  const type = detectProjectType(prompt);
  const matched: string[] = [];

  for (const rule of RULES) {
    if (rule.type === type) {
      for (const re of rule.keywords) {
        if (re.test(prompt)) {
          matched.push(re.source);
        }
      }
    }
  }

  const reason =
    matched.length > 0
      ? `Matched keywords: ${matched.slice(0, 3).join(', ')} → ${type}`
      : `No strong keyword match, defaulting to ${type}`;

  return { type, reason };
}
