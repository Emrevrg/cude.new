/**
 * Cude.new - Theme Studio
 *
 * The product surface for the design system: direction, colour, typography,
 * spacing, radius, density, components, motion and per-platform adaptation.
 * Raw token JSON is available but secondary.
 */

import { useStore } from '@nanostores/react';
import { useState, type ReactNode } from 'react';
import { architectureStore, designSystemStore, designSystemStatusStore } from '~/lib/stores/cude';
import { applyGlobalCompactSharp, createDesignSystem, type PresetId } from '~/lib/cude/designSystem';
import { classNames } from '~/utils/classNames';

const PRESETS: { id: PresetId; label: string }[] = [
  { id: 'minimal', label: 'Minimal' },
  { id: 'technical', label: 'Technical' },
  { id: 'editorial', label: 'Editorial' },
  { id: 'luxury', label: 'Luxury' },
  { id: 'playful', label: 'Playful' },
  { id: 'brutalist', label: 'Brutalist' },
  { id: 'custom', label: 'Custom' },
];

/** Turns a duration + easing into the character a designer actually reasons about. */
function describeMotion(durationNormal: string, easing: string): string {
  const ms = parseInt(durationNormal, 10);
  const pace = Number.isNaN(ms) ? 'Measured' : ms <= 150 ? 'Fast' : ms <= 250 ? 'Brisk' : 'Relaxed';
  const character = /cubic-bezier/.test(easing) ? 'Precise' : /ease-out/.test(easing) ? 'Soft' : 'Linear';

  return `${pace} / ${character}`;
}

/** Characterises the spacing scale rather than reciting its base value. */
function describeSpacing(base: number, steps: number): string {
  const rhythm = base <= 4 ? 'Tight' : base <= 8 ? 'Balanced' : 'Generous';
  return `${rhythm} · ${steps}-step scale`;
}

/** Characterises corner treatment. */
function describeRadius(md: string): string {
  const px = parseInt(md, 10);

  if (Number.isNaN(px)) {
    return md;
  }

  return px === 0 ? 'Sharp' : px <= 4 ? 'Crisp' : px <= 10 ? 'Softened' : 'Rounded';
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="text-[10px] tracking-widest font-semibold text-cude-textTertiary mb-1.5">{children}</div>;
}

function PresetRow({ activePreset, onSelect }: { activePreset?: string; onSelect: (preset: PresetId) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PRESETS.map((preset) => (
        <button
          key={preset.id}
          onClick={() => onSelect(preset.id)}
          className={classNames(
            'px-2.5 py-1 rounded-md border text-xs transition-colors',
            activePreset === preset.id
              ? 'border-cude-textPrimary text-cude-textPrimary'
              : 'border-cude-borderColor text-cude-textSecondary hover:text-cude-textPrimary hover:border-cude-textTertiary',
          )}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Deliberate empty state. The design system is an output of product analysis, so
 * this explains what will fill the panel rather than showing a blank surface.
 */
function EmptyState({ onPreview }: { onPreview: (preset: PresetId) => void }) {
  return (
    <div className="p-6 rounded-lg border border-cude-borderColor bg-cude-background-depth-1">
      <div className="text-[11px] tracking-widest font-semibold text-cude-textTertiary mb-2">THEME STUDIO</div>
      <p className="text-sm text-cude-textSecondary max-w-md leading-relaxed">
        Design Director will create this product&rsquo;s visual system after product analysis — colour semantics,
        typography, spacing, density and component character, adapted per platform.
      </p>
      <div className="mt-4">
        <SectionLabel>PREVIEW A DIRECTION</SectionLabel>
        <PresetRow onSelect={onPreview} />
      </div>
    </div>
  );
}

/** Shows how the one shared identity was adapted for each target platform. */
function PlatformAdaptation() {
  const architecture = useStore(architectureStore);
  const adapters = architecture ? Object.values(architecture.platformAdapters) : [];

  if (adapters.length === 0) {
    return null;
  }

  return (
    <div className="px-4 pb-4">
      <SectionLabel>PLATFORM ADAPTATION</SectionLabel>
      <div className="grid gap-2 sm:grid-cols-2">
        {adapters.map((adapter) => (
          <div
            key={adapter.platform}
            className="px-3 py-2 rounded-md border border-cude-borderColor bg-cude-background-depth-2"
          >
            <div className="text-[11px] tracking-widest font-semibold text-cude-textSecondary">
              {adapter.platform.toUpperCase()}
            </div>
            <div className="text-[11px] text-cude-textTertiary mt-0.5">
              {adapter.navigationPattern} · {adapter.density} · {adapter.touchTargetMin}px targets
            </div>
            <ul className="mt-1 space-y-0.5">
              {adapter.adaptationNotes.slice(0, 2).map((note) => (
                <li key={note} className="text-[11px] text-cude-textSecondary flex gap-1.5">
                  <span className="text-cude-textTertiary">•</span>
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ThemeStudio() {
  const ds = useStore(designSystemStore);
  const status = useStore(designSystemStatusStore);
  const [showJson, setShowJson] = useState(false);

  const previewPreset = (preset: PresetId) => {
    designSystemStore.set(createDesignSystem(`Preset ${preset} — sample product`, preset));
    designSystemStatusStore.set('draft');
  };

  if (!ds) {
    return <EmptyState onPreview={previewPreset} />;
  }

  const applyPreset = (preset: PresetId) => {
    const next = createDesignSystem(ds.meta.prompt, preset);
    designSystemStore.set({ ...next, meta: { ...next.meta, version: ds.meta.version + 1 } });
    designSystemStatusStore.set('modified');
  };

  return (
    <div className="border border-cude-borderColor rounded-lg bg-cude-background-depth-1 overflow-hidden">
      <div className="px-4 py-3 border-b border-cude-borderColor flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] tracking-widest font-semibold text-cude-textTertiary">
            THEME STUDIO · v{ds.meta.version}
          </div>
          <div className="text-sm font-medium text-cude-textPrimary truncate">
            {/* The preset name is often also the first personality trait; do not repeat it. */}
            {[ds.meta.preset, ...ds.identity.personality.filter((trait) => trait !== ds.meta.preset)].join(' · ')}
          </div>
          <div className="text-xs text-cude-textSecondary">{ds.identity.density} density</div>
        </div>
        <span className="shrink-0 px-2 py-1 rounded border text-[10px] tracking-widest font-medium border-cude-borderColor text-cude-textSecondary">
          {status.toUpperCase()}
        </span>
      </div>

      <div className="px-4 py-3 border-b border-cude-borderColor">
        <SectionLabel>DESIGN DIRECTION</SectionLabel>
        <PresetRow activePreset={ds.meta.preset} onSelect={applyPreset} />
      </div>

      <div className="p-4 grid gap-4 sm:grid-cols-2">
        <div>
          <SectionLabel>COLORS</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(ds.colors)
              .slice(0, 8)
              .map(([name, value]) => (
                <div key={name} className="flex items-center gap-1.5 px-2 py-1 rounded border border-cude-borderColor">
                  <span
                    className="w-3 h-3 rounded-sm border border-black/10 shrink-0"
                    style={{ background: String(value) }}
                  />
                  <span className="text-[11px] text-cude-textSecondary">{name}</span>
                </div>
              ))}
          </div>
        </div>

        <div>
          <SectionLabel>TYPOGRAPHY</SectionLabel>
          {/* Preview the face itself rather than only naming it. */}
          <div
            className="text-cude-textPrimary leading-tight"
            style={{ fontFamily: ds.typography.fontFamily, fontSize: ds.typography.h1.size }}
          >
            Ag
          </div>
          <div className="text-xs text-cude-textSecondary mt-1">
            {ds.typography.fontFamily.split(',')[0].replace(/['"]/g, '')}
          </div>
          <div className="text-[11px] text-cude-textTertiary">
            H1 {ds.typography.h1.size} · Body {ds.typography.body.size} · tabular{' '}
            {ds.typography.tabularNumerals ? 'on' : 'off'}
          </div>
        </div>

        <div>
          <SectionLabel>SPACING &amp; RADIUS</SectionLabel>
          <div className="text-xs text-cude-textPrimary">
            {describeSpacing(ds.spacing.base, Object.keys(ds.spacing.scale).length)}
          </div>
          <div className="text-xs text-cude-textPrimary mt-0.5">{describeRadius(ds.radius.md)} corners</div>
          <div className="text-[11px] text-cude-textTertiary mt-0.5">
            base {ds.spacing.base}px · radius {ds.radius.md} / {ds.radius.lg}
          </div>
        </div>

        <div>
          <SectionLabel>COMPONENTS</SectionLabel>
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center px-2 border border-cude-borderColor text-[11px] text-cude-textSecondary"
              style={{ height: ds.components.button.height, borderRadius: ds.radius.md }}
            >
              Button
            </span>
          </div>
          <div className="text-[11px] text-cude-textTertiary mt-1.5">
            button {ds.components.button.height} · card {ds.components.card.padding} · nav {ds.components.nav.height}
          </div>
        </div>

        <div>
          <SectionLabel>MOTION</SectionLabel>
          <div className="text-xs text-cude-textPrimary">
            {describeMotion(ds.motion.durationNormal, ds.motion.easing)}
          </div>
          <div className="text-[11px] text-cude-textTertiary mt-0.5">
            {ds.motion.durationNormal} · {ds.motion.easing}
          </div>
          <div className="text-[11px] text-cude-textTertiary">
            reduced motion {ds.motion.reduceMotion ? 'respected' : 'default'}
          </div>
        </div>

        <div>
          <SectionLabel>DENSITY</SectionLabel>
          <div className="text-xs text-cude-textPrimary capitalize">{ds.identity.density}</div>
        </div>
      </div>

      <PlatformAdaptation />

      <div className="px-4 pb-4 flex flex-wrap gap-2">
        <button
          onClick={() => {
            designSystemStore.set(applyGlobalCompactSharp(ds));
            designSystemStatusStore.set('modified');
          }}
          className="px-3 py-1.5 rounded-md border border-cude-textPrimary bg-cude-textPrimary text-cude-background-depth-1 text-xs font-medium"
        >
          Make compact + sharper
        </button>
        <button
          onClick={() => setShowJson(!showJson)}
          className="px-3 py-1.5 rounded-md border border-cude-borderColor text-xs text-cude-textSecondary hover:text-cude-textPrimary"
        >
          {showJson ? 'Hide tokens' : 'Inspect tokens'}
        </button>
      </div>

      {showJson && (
        <div className="p-4 border-t border-cude-borderColor bg-cude-background-depth-2 max-h-[320px] overflow-auto modern-scrollbar">
          <pre className="text-[11px] leading-4 text-cude-textSecondary whitespace-pre-wrap">
            {JSON.stringify(ds, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
