/**
 * Cude.new - Project Type Abstraction
 * Defines every supported platform + its build/test/preview strategy.
 */

export const PROJECT_TYPES = [
  'auto',
  'web',
  'fullstack',
  'pwa',
  'android',
  'ios',
  'mobile',
  'desktop',
  'browser-extension',
  'vscode-extension',
  'ide-extension',
  'backend',
] as const;

export type ProjectType = (typeof PROJECT_TYPES)[number];

export interface ProjectTypeConfig {
  id: ProjectType;
  label: string;
  shortLabel: string;
  description: string;
  icon: string;
  frameworks: string[];
  runtime: string;
  buildCommand: string;
  testStrategy: string;
  previewStrategy: string;
  artifactType: string;
  validation: string[];
  supported: boolean;
}

export const PROJECT_TYPE_CONFIGS: Record<ProjectType, ProjectTypeConfig> = {
  auto: {
    id: 'auto',
    label: 'Auto',
    shortLabel: 'AUTO',
    description: 'Infer platform from prompt',
    icon: 'i-ph:sparkle',
    frameworks: [],
    runtime: 'auto',
    buildCommand: 'auto',
    testStrategy: 'auto',
    previewStrategy: 'auto',
    artifactType: 'auto',
    validation: [],
    supported: true,
  },
  web: {
    id: 'web',
    label: 'Web',
    shortLabel: 'WEB',
    description: 'Modern web application',
    icon: 'i-ph:globe',
    frameworks: ['React', 'Vite', 'Next.js', 'Vue', 'Svelte'],
    runtime: 'WebContainer + Vite',
    buildCommand: 'npm run build',
    testStrategy: 'vitest + playwright',
    previewStrategy: 'WebContainer preview iframe',
    artifactType: 'static build / SPA',
    validation: ['typecheck', 'vite build', 'preview loads'],
    supported: true,
  },
  fullstack: {
    id: 'fullstack',
    label: 'Full-Stack Web',
    shortLabel: 'FULL-STACK',
    description: 'Frontend + backend + database',
    icon: 'i-ph:stack',
    frameworks: ['React + Remix', 'Next.js + API Routes', 'Vite + Express'],
    runtime: 'WebContainer + Node',
    buildCommand: 'npm run build',
    testStrategy: 'vitest + api tests',
    previewStrategy: 'WebContainer preview',
    artifactType: 'full-stack bundle',
    validation: ['typecheck', 'build', 'api health'],
    supported: true,
  },
  pwa: {
    id: 'pwa',
    label: 'PWA',
    shortLabel: 'PWA',
    description: 'Progressive Web App',
    icon: 'i-ph:device-mobile',
    frameworks: ['Vite PWA', 'Next.js + next-pwa'],
    runtime: 'WebContainer',
    buildCommand: 'npm run build',
    testStrategy: 'lighthouse + vitest',
    previewStrategy: 'preview with service worker',
    artifactType: 'PWA bundle',
    validation: ['manifest', 'service worker', 'build'],
    supported: true,
  },
  android: {
    id: 'android',
    label: 'Android',
    shortLabel: 'ANDROID',
    description: 'Android application',
    icon: 'i-ph:android-logo',
    frameworks: ['Kotlin + Compose', 'React Native + Expo', 'Flutter'],
    runtime: 'Gradle / Expo',
    buildCommand: './gradlew assembleDebug',
    testStrategy: 'gradle build + lint',
    previewStrategy: 'Expo QR / device frame',
    artifactType: 'APK / AAB',
    validation: ['manifest', 'gradle build', 'lint'],
    supported: true,
  },
  ios: {
    id: 'ios',
    label: 'iOS',
    shortLabel: 'IOS',
    description: 'iOS application (SwiftUI)',
    icon: 'i-ph:apple-logo',
    frameworks: ['Swift + SwiftUI', 'React Native + Expo', 'Flutter'],
    runtime: 'Xcode (macOS only)',
    buildCommand: 'xcodebuild',
    testStrategy: 'swift build + tests',
    previewStrategy: 'Source preview (build requires macOS)',
    artifactType: 'IPA',
    validation: ['source structure', 'static checks'],
    supported: true,
  },
  mobile: {
    id: 'mobile',
    label: 'Mobile (Cross-Platform)',
    shortLabel: 'MOBILE',
    description: 'Android + iOS shared codebase',
    icon: 'i-ph:devices',
    frameworks: ['React Native + Expo', 'Flutter'],
    runtime: 'Expo / Flutter',
    buildCommand: 'npx expo export / flutter build',
    testStrategy: 'typecheck + build',
    previewStrategy: 'Expo web / device frame',
    artifactType: 'APK + IPA',
    validation: ['typecheck', 'build'],
    supported: true,
  },
  desktop: {
    id: 'desktop',
    label: 'Desktop',
    shortLabel: 'DESKTOP',
    description: 'Desktop application',
    icon: 'i-ph:monitor',
    frameworks: ['Electron', 'Tauri', 'Vite + Electron'],
    runtime: 'Electron / Tauri',
    buildCommand: 'npm run electron:build',
    testStrategy: 'electron build + tests',
    previewStrategy: 'Desktop window (where supported)',
    artifactType: 'installer (exe/dmg/AppImage)',
    validation: ['compile', 'package config'],
    supported: true,
  },
  'browser-extension': {
    id: 'browser-extension',
    label: 'Browser Extension',
    shortLabel: 'EXTENSION',
    description: 'Chrome / Chromium / Firefox extension (MV3)',
    icon: 'i-ph:puzzle-piece',
    frameworks: ['Vite + Manifest V3', 'WXT', 'Plasmo'],
    runtime: 'Browser extension runtime',
    buildCommand: 'npm run build',
    testStrategy: 'manifest validation + build',
    previewStrategy: 'manifest + popup preview + install instructions',
    artifactType: 'zip (extension)',
    validation: ['manifest.json', 'popup', 'service worker', 'build'],
    supported: true,
  },
  'vscode-extension': {
    id: 'vscode-extension',
    label: 'VS Code Extension',
    shortLabel: 'VS CODE',
    description: 'Visual Studio Code extension',
    icon: 'i-ph:code',
    frameworks: ['VS Code Extension API + TypeScript'],
    runtime: 'VS Code Extension Host',
    buildCommand: 'npm run compile',
    testStrategy: 'npm run compile + npm test + vsce package',
    previewStrategy: 'contributions preview + launch instructions',
    artifactType: 'VSIX',
    validation: ['package.json contributions', 'compile', 'tests'],
    supported: true,
  },
  'ide-extension': {
    id: 'ide-extension',
    label: 'IDE Extension',
    shortLabel: 'IDE',
    description: 'JetBrains / compatible IDE extension',
    icon: 'i-ph:brackets-curly',
    frameworks: ['IntelliJ Platform SDK', 'VS Code compat'],
    runtime: 'IDE runtime',
    buildCommand: 'gradle build / npm run compile',
    testStrategy: 'build validation',
    previewStrategy: 'manifest preview',
    artifactType: 'plugin zip / VSIX',
    validation: ['manifest', 'build'],
    supported: false,
  },
  backend: {
    id: 'backend',
    label: 'Backend / API',
    shortLabel: 'API',
    description: 'API & backend services',
    icon: 'i-ph:server',
    frameworks: ['Hono', 'Express', 'Fastify', 'Remix API'],
    runtime: 'Node / Workers',
    buildCommand: 'npm run build',
    testStrategy: 'api tests + typecheck',
    previewStrategy: 'API route preview / curl instructions',
    artifactType: 'worker / server bundle',
    validation: ['typecheck', 'build', 'route tests'],
    supported: true,
  },
};

export function getProjectTypeConfig(type: ProjectType): ProjectTypeConfig {
  return PROJECT_TYPE_CONFIGS[type] ?? PROJECT_TYPE_CONFIGS.web;
}

export function isProjectTypeSupported(type: ProjectType): boolean {
  return PROJECT_TYPE_CONFIGS[type]?.supported ?? false;
}
