/**
 * Cude.new - Design Review
 *
 * The approval surface. It shows what the interface will look like before the
 * Builder spends effort implementing it, rendered from the project's real
 * design tokens and surface plan.
 *
 * This is a product surface, not an inspector: the preview gets the space, the
 * specification sits beside it, and the two decisions the user has to make —
 * approve, or ask for changes — are always visible.
 */

import { useMemo, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  approveDesignAndBuild,
  designContractStore,
  designReviewPlatformStore,
  designReviewSurfaceStore,
  designRevisionSummaryStore,
  requestDesignChanges,
} from '~/lib/stores/cude';
import { renderSurfacePreview } from '~/lib/cude/designPreview';
import { analyzeComposition } from '~/lib/cude/visualQA';
import { classNames } from '~/utils/classNames';

function EmptyState() {
  return (
    <div className="p-6 rounded-lg border border-cude-borderColor bg-cude-background-depth-1">
      <div className="text-[11px] tracking-widest font-semibold text-cude-textTertiary mb-2">DESIGN REVIEW</div>
      <p className="text-sm text-cude-textSecondary max-w-md leading-relaxed">
        Once the Design Director has proposed an interface, it appears here for your approval. Implementation does not
        begin until you approve it.
      </p>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] tracking-widest font-semibold text-cude-textTertiary">{label}</div>
      <div className="text-xs text-cude-textPrimary mt-0.5 capitalize">{value}</div>
    </div>
  );
}

export function DesignReviewPanel() {
  const contract = useStore(designContractStore);
  const activePlatform = useStore(designReviewPlatformStore);
  const activeSurfaceId = useStore(designReviewSurfaceStore);
  const revisionSummary = useStore(designRevisionSummaryStore);

  const [feedback, setFeedback] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const [showSpec, setShowSpec] = useState(false);

  const design = contract && activePlatform ? contract.platformDesigns[activePlatform] : undefined;
  const surface = design?.surfaces.find((s) => s.id === activeSurfaceId) ?? design?.surfaces[0];

  const previewHtml = useMemo(
    () => (contract && design && surface ? renderSurfacePreview(design, surface, contract.designSystem) : ''),
    [contract, design, surface],
  );

  const findings = useMemo(() => (contract ? analyzeComposition(contract) : []), [contract]);

  if (!contract || !design || !surface) {
    return <EmptyState />;
  }

  const approved = contract.status === 'approved';

  /** Desktop and web proposals are wider than the panel and get scaled to fit. */
  const isWide = design.viewport.width > 900;
  const surfaceFindings = findings.filter((f) => f.platform === design.platform && f.surface === surface.name);

  return (
    <div className="flex flex-col gap-3">
      {/* Header: what this is, and the decision. */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[11px] tracking-widest font-semibold text-cude-textTertiary">DESIGN REVIEW</span>
        <span className="text-[11px] text-cude-textTertiary">
          {contract.productName} · revision {contract.revision}
        </span>

        <span
          className={classNames(
            'text-[10px] tracking-widest px-2 py-0.5 rounded border font-medium',
            approved
              ? 'bg-cude-textPrimary text-cude-background-depth-1 border-cude-textPrimary'
              : 'border-amber-500 text-amber-400',
          )}
        >
          {approved ? 'APPROVED' : 'WAITING FOR APPROVAL'}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowFeedback((v) => !v)}
            className="h-7 px-2.5 rounded-md border border-cude-borderColor text-xs text-cude-textSecondary hover:text-cude-textPrimary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cude-textTertiary"
          >
            Request changes
          </button>
          <button
            onClick={approveDesignAndBuild}
            disabled={approved}
            className={classNames(
              'h-7 px-3 rounded-md border text-xs font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cude-textTertiary',
              approved
                ? 'border-cude-borderColor text-cude-textTertiary cursor-not-allowed'
                : 'bg-cude-textPrimary text-cude-background-depth-1 border-cude-textPrimary',
            )}
          >
            {approved ? 'Approved' : 'Approve & Build'}
          </button>
        </div>
      </div>

      {/* Platform tabs — one product, several platform experiences. */}
      {contract.platforms.length > 1 && (
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {contract.platforms.map((platform) => (
            <button
              key={platform}
              onClick={() => {
                designReviewPlatformStore.set(platform);
                designReviewSurfaceStore.set(contract.platformDesigns[platform]?.surfaces[0]?.id ?? null);
              }}
              className={classNames(
                'shrink-0 h-7 px-2.5 rounded-md border text-[11px] tracking-widest font-medium',
                platform === activePlatform
                  ? 'bg-cude-textPrimary text-cude-background-depth-1 border-cude-textPrimary'
                  : 'border-cude-borderColor text-cude-textSecondary hover:text-cude-textPrimary',
              )}
            >
              {platform.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {revisionSummary.length > 0 && (
        <div className="px-3 py-2 rounded-md border border-cude-borderColor bg-cude-background-depth-2">
          <div className="text-[10px] tracking-widest font-semibold text-cude-textTertiary mb-1">
            REVISION {contract.revision} APPLIED
          </div>
          <ul className="space-y-0.5">
            {revisionSummary.map((line) => (
              <li key={line} className="text-[11px] text-cude-textSecondary flex gap-2">
                <span className="text-cude-textTertiary">·</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showFeedback && (
        <div className="p-3 rounded-md border border-cude-borderColor bg-cude-background-depth-1">
          <label htmlFor="design-feedback" className="text-[10px] tracking-widest font-semibold text-cude-textTertiary">
            WHAT SHOULD CHANGE?
          </label>
          <textarea
            id="design-feedback"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={2}
            placeholder="e.g. keep the structure but make it denser and remove decorative elements"
            className="mt-1.5 w-full rounded-md border border-cude-borderColor bg-cude-background-depth-2 px-2.5 py-2 text-xs text-cude-textPrimary placeholder:text-cude-textTertiary resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cude-textTertiary"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => {
                requestDesignChanges(feedback, activePlatform ?? undefined);
                setFeedback('');
                setShowFeedback(false);
              }}
              disabled={!feedback.trim()}
              className="h-7 px-3 rounded-md border border-cude-textPrimary bg-cude-textPrimary text-cude-background-depth-1 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Apply revision
            </button>
            <span className="text-[11px] text-cude-textTertiary">
              Architecture and the product graph are preserved. The Builder stays paused.
            </span>
          </div>
        </div>
      )}

      {/* Surface switcher + preview. The preview gets the room. */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px] items-start">
        <div className="min-w-0">
          <div className="flex items-center gap-1 mb-2 overflow-x-auto no-scrollbar">
            {design.surfaces.map((s) => (
              <button
                key={s.id}
                onClick={() => designReviewSurfaceStore.set(s.id)}
                className={classNames(
                  'shrink-0 h-6 px-2 rounded text-[11px] border',
                  s.id === surface.id
                    ? 'border-cude-textTertiary text-cude-textPrimary bg-cude-background-depth-2'
                    : 'border-transparent text-cude-textTertiary hover:text-cude-textSecondary',
                )}
              >
                {s.name}
              </button>
            ))}
            <span className="ml-auto shrink-0 text-[10px] text-cude-textTertiary tabular-nums">
              {design.viewport.width}×{design.viewport.height}
            </span>
          </div>

          {/*
           * The frame is sized to the proposal, and the container to the frame,
           * so a 400px popup is presented at its real size instead of floating
           * in an oversized panel.
           */}
          <div
            className="rounded-lg border border-cude-borderColor bg-cude-background-depth-2 p-3 flex justify-center mx-auto"
            style={{ maxWidth: isWide ? '100%' : design.viewport.width + 26 }}
          >
            <iframe
              title={`${design.platform} ${surface.name} preview`}
              srcDoc={previewHtml}
              sandbox=""
              className="bg-cude-background-depth-1 rounded border border-cude-borderColor"
              style={{
                width: design.viewport.width,
                height: design.viewport.height,
                maxWidth: '100%',

                // Desktop and web proposals are wider than the panel; scale to fit.
                transform: isWide ? 'scale(0.62)' : 'none',
                transformOrigin: 'top center',
                marginBottom: isWide ? -design.viewport.height * 0.38 : 0,
              }}
            />
          </div>

          <p className="mt-2 text-[11px] text-cude-textTertiary">{surface.purpose}</p>
        </div>

        {/* Specification beside the preview, not instead of it. */}
        <div className="flex flex-col gap-3 min-w-0">
          <div className="grid grid-cols-2 gap-3">
            <Meta label="PLATFORM" value={design.platform} />
            <Meta label="DENSITY" value={design.density} />
            <Meta label="NAVIGATION" value={design.navigation} />
            <Meta label="INPUT" value={design.inputModel} />
          </div>

          <div>
            <div className="text-[10px] tracking-widest font-semibold text-cude-textTertiary mb-1.5">
              PLATFORM ADAPTATION
            </div>
            <ul className="space-y-0.5">
              {design.adaptationNotes.map((note) => (
                <li key={note} className="text-[11px] text-cude-textSecondary flex gap-2">
                  <span className="text-cude-textTertiary">·</span>
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="text-[10px] tracking-widest font-semibold text-cude-textTertiary mb-1.5">REGIONS</div>
            <div className="rounded-md border border-cude-borderColor divide-y divide-cude-borderColor overflow-hidden">
              {surface.regions.map((r) => (
                <div key={r.id} className="flex items-center gap-2 px-2.5 py-1.5 text-[11px]">
                  <span className="text-cude-textPrimary truncate flex-1">{r.label}</span>
                  <span className="text-cude-textTertiary shrink-0 tabular-nums">{r.items}</span>
                </div>
              ))}
            </div>
          </div>

          {surfaceFindings.length > 0 && (
            <div>
              <div className="text-[10px] tracking-widest font-semibold text-cude-textTertiary mb-1.5">COMPOSITION</div>
              <ul className="space-y-1">
                {surfaceFindings.map((f) => (
                  <li key={f.code + f.surface} className="text-[11px] text-amber-400">
                    {f.code.replace(/_/g, ' ')}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            onClick={() => setShowSpec((v) => !v)}
            className="self-start text-[11px] text-cude-textTertiary hover:text-cude-textSecondary"
          >
            {showSpec ? 'Hide component rules' : 'Component rules'}
          </button>

          {showSpec && (
            <ul className="space-y-1">
              {contract.componentRules.map((rule) => (
                <li key={rule.component} className="text-[11px] text-cude-textSecondary">
                  <span className="text-cude-textPrimary">{rule.component}</span> — {rule.rule}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
