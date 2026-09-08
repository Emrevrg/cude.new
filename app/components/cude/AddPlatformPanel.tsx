/**
 * Cude.new - Product & Add Platform
 *
 * The simple outside of the multi-platform promise. The user sees which
 * platforms their product has, picks another, reads a short summary of what
 * gets reused, and approves. Everything underneath — stack intelligence,
 * contract reuse, design adaptation — is Cude's problem, not theirs.
 *
 * The Product Graph remains the expert view of the same state.
 */

import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { addPlatformToCurrentProduct, architectureStore, designContractStore, pipelineStore } from '~/lib/stores/cude';
import { ProjectOverview } from './ProjectOverview';
import { availableTargets, planAddPlatform, type AddPlatformPlan } from '~/lib/cude/addPlatform';
import { getSharedServices } from '~/lib/cude/productGraph';
import type { ProjectType } from '~/lib/cude/platform';
import { classNames } from '~/utils/classNames';

const PLATFORM_LABELS: Partial<Record<ProjectType, string>> = {
  web: 'Web',
  android: 'Android',
  ios: 'iOS',
  desktop: 'Desktop',
  'browser-extension': 'Browser Extension',
  'vscode-extension': 'VS Code Extension',
  backend: 'Backend',
};

function EmptyState() {
  return (
    <div className="p-6 rounded-lg border border-cude-borderColor bg-cude-background-depth-1">
      <div className="text-[11px] tracking-widest font-semibold text-cude-textTertiary mb-2">PRODUCT</div>
      <p className="text-sm text-cude-textSecondary max-w-md leading-relaxed">
        Once a product exists, its platforms appear here and you can extend it to another one — reusing the same
        account, data and identity.
      </p>
    </div>
  );
}

function PlanColumn({ title, items, tone }: { title: string; items: string[]; tone: 'reuse' | 'adapt' | 'create' }) {
  if (items.length === 0) {
    return null;
  }

  const marker = tone === 'reuse' ? '✓' : tone === 'adapt' ? '→' : '+';

  return (
    <div className="min-w-0">
      <div className="text-[10px] tracking-widest font-semibold text-cude-textTertiary mb-1.5">{title}</div>
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item} className="text-[11px] text-cude-textSecondary flex gap-2">
            <span className="text-cude-textTertiary shrink-0 w-2">{marker}</span>
            <span className="truncate">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AddPlatformPanel() {
  const architecture = useStore(architectureStore);
  const contract = useStore(designContractStore);
  const pipeline = useStore(pipelineStore);

  const [selected, setSelected] = useState<ProjectType | null>(null);
  const [plan, setPlan] = useState<AddPlatformPlan | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  if (!architecture) {
    return (
      <div className="space-y-3">
        <ProjectOverview />
        <EmptyState />
      </div>
    );
  }

  const existing = architecture.requirements.targetPlatforms;
  const candidates = availableTargets(architecture);
  const shared = getSharedServices(architecture.productGraph).filter((n) => n.type !== 'design');

  const choose = (platform: ProjectType) => {
    setSelected(platform);
    setPlan(planAddPlatform(architecture, platform));
    setAdded(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <ProjectOverview />
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[11px] tracking-widest font-semibold text-cude-textTertiary">PRODUCT</span>
        <span className="text-[11px] text-cude-textTertiary">{architecture.productName}</span>
      </div>

      {/* Current product family state, without needing the graph. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="text-[10px] tracking-widest font-semibold text-cude-textTertiary mb-1.5">PLATFORMS</div>
          <div className="flex flex-col gap-1">
            {existing.map((platform) => {
              const isApprovedDesign = contract?.platformDesigns[platform] && contract.status === 'approved';
              const state =
                pipeline.status === 'design_review' && !isApprovedDesign
                  ? 'Design review'
                  : pipeline.status === 'building'
                    ? 'Building'
                    : pipeline.status === 'verified'
                      ? 'Verified'
                      : pipeline.status === 'failed'
                        ? 'Failed'
                        : 'Planned';

              return (
                <div
                  key={platform}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-cude-borderColor bg-cude-background-depth-2"
                >
                  <span className="text-xs text-cude-textPrimary truncate flex-1">
                    {PLATFORM_LABELS[platform] ?? platform}
                  </span>
                  <span className="text-[10px] tracking-wide text-cude-textTertiary shrink-0">{state}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div className="text-[10px] tracking-widest font-semibold text-cude-textTertiary mb-1.5">SHARED</div>
          {shared.length === 0 ? (
            <p className="text-[11px] text-cude-textTertiary">
              This product has no shared services yet — none were required.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {shared.map((node) => (
                <span
                  key={node.id}
                  className="px-2 py-0.5 rounded border border-dashed border-cude-borderColor text-[10px] text-cude-textSecondary"
                >
                  {node.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add platform */}
      <div>
        <div className="text-[10px] tracking-widest font-semibold text-cude-textTertiary mb-1.5">+ ADD PLATFORM</div>
        {candidates.length === 0 ? (
          <p className="text-[11px] text-cude-textTertiary">Every supported target is already part of this product.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {candidates.map((platform) => (
              <button
                key={platform}
                onClick={() => choose(platform)}
                className={classNames(
                  'h-7 px-2.5 rounded-md border text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cude-textTertiary',
                  selected === platform
                    ? 'bg-cude-textPrimary text-cude-background-depth-1 border-cude-textPrimary'
                    : 'border-cude-borderColor text-cude-textSecondary hover:text-cude-textPrimary',
                )}
              >
                {PLATFORM_LABELS[platform] ?? platform}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Impact summary, before anything is built. */}
      {plan && selected && (
        <div className="rounded-lg border border-cude-borderColor bg-cude-background-depth-1 p-4 flex flex-col gap-3">
          <div className="text-[11px] tracking-widest font-semibold text-cude-textPrimary">
            ADDING {(PLATFORM_LABELS[selected] ?? selected).toUpperCase()}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <PlanColumn title="REUSE" items={plan.reuse} tone="reuse" />
            <PlanColumn title="ADAPT" items={plan.adapt} tone="adapt" />
            <PlanColumn title="NEW" items={plan.create} tone="create" />
          </div>

          <div className="text-[11px] text-cude-textTertiary">
            Preserved: {plan.preservedTargets.map((p) => PLATFORM_LABELS[p] ?? p).join(', ')}
          </div>

          {plan.contractImpact.required && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5">
              <div className="text-[10px] tracking-widest font-semibold text-amber-400 mb-1">
                SHARED CONTRACT CHANGE REQUIRED
              </div>
              <ol className="space-y-0.5 list-decimal list-inside">
                {plan.contractImpact.migrationSteps.map((step) => (
                  <li key={step} className="text-[11px] text-cude-textSecondary">
                    {step}
                  </li>
                ))}
              </ol>
              <p className="text-[11px] text-cude-textTertiary mt-1">{plan.contractImpact.note}</p>
            </div>
          )}

          {added ? (
            <p className="text-[11px] text-cude-textSecondary">
              {added} added. Its design proposal is waiting in Design Review — existing platforms are untouched.
            </p>
          ) : (
            <button
              onClick={() => {
                const result = addPlatformToCurrentProduct(selected);

                if (result) {
                  setAdded(PLATFORM_LABELS[selected] ?? selected);
                  setPlan(null);
                }
              }}
              className="self-start h-7 px-3 rounded-md border border-cude-textPrimary bg-cude-textPrimary text-cude-background-depth-1 text-xs font-medium"
            >
              Add & design
            </button>
          )}
        </div>
      )}
    </div>
  );
}
