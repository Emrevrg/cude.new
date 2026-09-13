import type { ProjectType } from './platform';

/**
 * A product target is not automatically a runnable artifact. This matrix makes
 * the boundary explicit in the UI and preflight decisions so Cude never
 * represents a starter template as a device build or a deployed application.
 */
export type DeliveryTier = 'browser-ready' | 'local-validation' | 'device-required' | 'planning-only';

export interface TargetCapability {
  tier: DeliveryTier;
  label: string;
  summary: string;
  canGenerate: boolean;
  canValidateHere: boolean;
  canPreviewHere: boolean;
  nextRequirement?: string;
}

const CAPABILITIES: Record<ProjectType, TargetCapability> = {
  auto: {
    tier: 'planning-only',
    label: 'Choose from brief',
    summary: 'Cude selects a target after reading the product brief.',
    canGenerate: true,
    canValidateHere: false,
    canPreviewHere: false,
  },
  web: {
    tier: 'browser-ready',
    label: 'Browser ready',
    summary: 'Generate, run and inspect a web project in the workspace.',
    canGenerate: true,
    canValidateHere: true,
    canPreviewHere: true,
  },
  fullstack: {
    tier: 'browser-ready',
    label: 'Browser ready',
    summary: 'Generate and review the product in the browser workspace.',
    canGenerate: true,
    canValidateHere: true,
    canPreviewHere: true,
  },
  pwa: {
    tier: 'browser-ready',
    label: 'Browser ready',
    summary: 'Generate and inspect the installable web surface in the workspace.',
    canGenerate: true,
    canValidateHere: true,
    canPreviewHere: true,
  },
  android: {
    tier: 'local-validation',
    label: 'Local validation',
    summary: 'Cude generates the project; a local Android toolchain produces the APK/AAB.',
    canGenerate: true,
    canValidateHere: false,
    canPreviewHere: false,
    nextRequirement: 'Android SDK and a connected emulator or device',
  },
  ios: {
    tier: 'device-required',
    label: 'macOS required',
    summary: 'Cude generates the source; Xcode on macOS builds and signs it.',
    canGenerate: true,
    canValidateHere: false,
    canPreviewHere: false,
    nextRequirement: 'macOS, Xcode and a signing setup',
  },
  mobile: {
    tier: 'local-validation',
    label: 'Local validation',
    summary: 'Cude generates shared mobile source; local Expo or Flutter tooling validates it.',
    canGenerate: true,
    canValidateHere: false,
    canPreviewHere: false,
    nextRequirement: 'Expo/Flutter plus an emulator or device',
  },
  desktop: {
    tier: 'local-validation',
    label: 'Local validation',
    summary: 'Cude generates desktop source; native packaging runs in a local toolchain.',
    canGenerate: true,
    canValidateHere: false,
    canPreviewHere: false,
    nextRequirement: 'Platform-specific packaging toolchain',
  },
  'browser-extension': {
    tier: 'local-validation',
    label: 'Local validation',
    summary: 'Cude generates an extension; browser installation remains a local review step.',
    canGenerate: true,
    canValidateHere: true,
    canPreviewHere: false,
    nextRequirement: 'A Chromium/Firefox profile for manual loading',
  },
  'vscode-extension': {
    tier: 'local-validation',
    label: 'Local validation',
    summary: 'Cude generates a VSIX project; an Extension Host validates the behavior.',
    canGenerate: true,
    canValidateHere: false,
    canPreviewHere: false,
    nextRequirement: 'VS Code Extension Host',
  },
  'ide-extension': {
    tier: 'planning-only',
    label: 'Planning only',
    summary: 'Cude can plan the target, but does not claim a native IDE build.',
    canGenerate: false,
    canValidateHere: false,
    canPreviewHere: false,
    nextRequirement: 'A configured target IDE toolchain',
  },
  backend: {
    tier: 'browser-ready',
    label: 'Workspace ready',
    summary: 'Cude generates and verifies the service workspace; deployment is your decision.',
    canGenerate: true,
    canValidateHere: true,
    canPreviewHere: true,
  },
  hardware: {
    tier: 'device-required',
    label: 'Device required',
    summary: 'Cude generates firmware and a build packet; compilation and flashing happen with real hardware.',
    canGenerate: true,
    canValidateHere: false,
    canPreviewHere: false,
    nextRequirement: 'A supported board, PlatformIO and a USB data connection',
  },
};

export function capabilityFor(target: ProjectType): TargetCapability {
  return CAPABILITIES[target];
}

export function canRunInWorkspace(target: ProjectType): boolean {
  const capability = capabilityFor(target);
  return capability.canValidateHere || capability.canPreviewHere;
}
