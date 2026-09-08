/**
 * Cude.new - Architecture Decision UI
 *
 * Shows the real stack decision for every target: what was selected, the short
 * reason, the alternatives it beat, and the tradeoffs. Overriding a stack writes
 * back to the architecture store, so the button is a genuine state change.
 */

import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { architectureStore, overrideStackForTarget } from '~/lib/stores/cude';
import { decisionScoreTable, type StackCandidate, type StackDecision } from '~/lib/cude/stackIntelligence';
import { classNames } from '~/utils/classNames';

function EmptyState() {
  return (
    <div className="p-6 rounded-lg border border-cude-borderColor bg-cude-background-depth-1">
      <div className="text-[11px] tracking-widest font-semibold text-cude-textTertiary mb-2">ARCHITECTURE</div>
      <div className="text-sm text-cude-textSecondary max-w-md leading-relaxed">
        Stack decisions appear here once the Product Analyst has read your request. Cude scores candidate stacks per
        target against your stated priorities rather than applying a fixed mapping.
      </div>
    </div>
  );
}

function confidenceLabel(confidence: number): string {
  if (confidence >= 0.8) {
    return 'HIGH';
  }

  if (confidence >= 0.6) {
    return 'MEDIUM';
  }

  return 'LOW';
}

function ScoreBar({ value }: { value: number }) {
  return (
    <div className="h-1 w-full rounded-full bg-cude-background-depth-3 overflow-hidden">
      <div className="h-full bg-cude-textSecondary" style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}

function CandidateRow({
  candidate,
  isSelected,
  onSelect,
}: {
  candidate: StackCandidate;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      className={classNames(
        'flex items-center gap-3 px-3 py-2 rounded-md border text-xs',
        isSelected
          ? 'border-cude-textTertiary bg-cude-background-depth-2'
          : 'border-transparent hover:border-cude-borderColor',
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={classNames(
              'font-medium truncate',
              candidate.rejected ? 'text-cude-textTertiary line-through' : 'text-cude-textPrimary',
            )}
          >
            {candidate.name}
          </span>
          {candidate.rejected && (
            <span className="px-1.5 py-0.5 rounded border border-cude-borderColor text-[10px] tracking-wide text-cude-textTertiary">
              EXCLUDED
            </span>
          )}
        </div>
        <div className="text-[11px] text-cude-textTertiary truncate">
          {candidate.rejected
            ? candidate.rejectionReasons.join('; ')
            : `${candidate.memoryMB} MB · ${candidate.startupMs} ms · ${candidate.bundleSize} bundle`}
        </div>
      </div>

      {!candidate.rejected && (
        <span className="text-[11px] tabular-nums text-cude-textSecondary">{candidate.totalScore.toFixed(2)}</span>
      )}

      {!isSelected && (
        <button
          onClick={onSelect}
          className="px-2 py-1 rounded border border-cude-borderColor text-[10px] tracking-widest text-cude-textSecondary hover:text-cude-textPrimary hover:border-cude-textTertiary"
        >
          USE
        </button>
      )}
    </div>
  );
}

function StackDecisionCard({
  platform,
  decision,
  expanded,
  onToggle,
  onOverride,
}: {
  platform: string;
  decision: StackDecision;
  expanded: boolean;
  onToggle: () => void;
  onOverride: (stackId: string) => void;
}) {
  const scoreTable = decisionScoreTable(decision).slice(0, 5);

  return (
    <div className="rounded-lg border border-cude-borderColor bg-cude-background-depth-1 overflow-hidden">
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className={classNames(
          'w-full text-left px-4 py-3 hover:bg-cude-background-depth-2 transition-colors',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-cude-textTertiary',
        )}
      >
        {/* Scan order: target -> selected stack -> why -> confidence. */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] tracking-widest font-semibold text-cude-textTertiary">
            {platform.toUpperCase()}
          </span>
          <span className="ml-auto text-[10px] tracking-widest text-cude-textTertiary">
            {confidenceLabel(decision.confidence)} CONFIDENCE
          </span>
          <span
            className={classNames(
              'i-ph:caret-down text-sm text-cude-textTertiary transition-transform',
              expanded ? 'rotate-180' : '',
            )}
          />
        </div>

        <div className="mt-1.5 flex items-baseline gap-2 flex-wrap">
          <span className="text-base font-medium text-cude-textPrimary">{decision.selected.name}</span>
          <span className="text-[11px] text-cude-textTertiary">
            {decision.selected.language} · {decision.selected.framework}
          </span>
        </div>

        {/* A decision the user dictated is stated as such, not presented as a score. */}
        {decision.appliedConstraints.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {decision.appliedConstraints.map((constraint) => (
              <span
                key={constraint}
                className="px-1.5 py-0.5 rounded border border-cude-textTertiary text-[10px] tracking-wide text-cude-textSecondary"
              >
                USER CONSTRAINT · {constraint.toUpperCase()}
              </span>
            ))}
          </div>
        )}

        {decision.reasons.length > 0 && (
          <ul className="mt-2 space-y-0.5">
            {decision.reasons.slice(0, 3).map((reason) => (
              <li key={reason} className="text-xs text-cude-textSecondary flex gap-2">
                <span className="text-cude-textTertiary shrink-0">·</span>
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        )}

        {decision.alternatives.length > 0 && (
          <div className="mt-2 text-[11px] text-cude-textTertiary">
            <span className="tracking-wide">ALTERNATIVES</span>{' '}
            <span className="text-cude-textSecondary">{decision.alternatives.map((a) => a.name).join(' · ')}</span>
          </div>
        )}
      </button>

      {decision.conflicts.length > 0 && (
        <div className="px-4 py-2 border-t border-cude-borderColor bg-cude-background-depth-2">
          {decision.conflicts.map((conflict) => (
            <p key={conflict.message} className="text-xs text-cude-textSecondary">
              <span className="i-ph:warning-circle inline-block align-text-bottom mr-1" />
              {conflict.message}
            </p>
          ))}
        </div>
      )}

      {expanded && (
        <div className="border-t border-cude-borderColor">
          {decision.selected.drawbacks.length > 0 && (
            <div className="px-4 py-3 border-b border-cude-borderColor">
              <div className="text-[11px] tracking-widest font-semibold text-cude-textTertiary mb-1.5">TRADEOFFS</div>
              <ul className="space-y-0.5">
                {decision.selected.drawbacks.map((drawback) => (
                  <li key={drawback} className="text-xs text-cude-textSecondary flex gap-2">
                    <span className="text-cude-textTertiary">•</span>
                    <span>{drawback}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="px-4 py-3 border-b border-cude-borderColor">
            <div className="text-[11px] tracking-widest font-semibold text-cude-textTertiary mb-2">WHAT DROVE THIS</div>
            <div className="space-y-2">
              {scoreTable.map((row) => (
                <div key={row.dimension}>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-cude-textSecondary">{row.dimension}</span>
                    <span className="text-cude-textTertiary tabular-nums">weight {row.weight.toFixed(2)}</span>
                  </div>
                  <ScoreBar value={row.score} />
                </div>
              ))}
            </div>
          </div>

          <div className="px-4 py-3">
            <div className="text-[11px] tracking-widest font-semibold text-cude-textTertiary mb-2">CHANGE STACK</div>
            <div className="space-y-1">
              {decision.candidates.map((candidate) => (
                <CandidateRow
                  key={candidate.id}
                  candidate={candidate}
                  isSelected={candidate.id === decision.selected.id}
                  onSelect={() => onOverride(candidate.id)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ArchitectureDecisionPanel({ className }: { className?: string }) {
  const architecture = useStore(architectureStore);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!architecture || Object.keys(architecture.stackDecisions).length === 0) {
    return <EmptyState />;
  }

  const entries = Object.entries(architecture.stackDecisions);

  return (
    <div className={classNames('flex flex-col gap-3', className)}>
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] tracking-widest font-semibold text-cude-textTertiary">ARCHITECTURE</span>
        <span className="text-[11px] text-cude-textTertiary">
          {entries.length} {entries.length === 1 ? 'target' : 'targets'} · {architecture.productName}
        </span>
      </div>

      {architecture.requirements.forbiddenLanguages.length > 0 ||
      architecture.requirements.preferredLanguages.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {architecture.requirements.preferredLanguages.map((lang) => (
            <span
              key={`p-${lang}`}
              className="px-2 py-0.5 rounded border border-cude-borderColor text-[10px] tracking-wide text-cude-textSecondary"
            >
              REQUIRED · {lang.toUpperCase()}
            </span>
          ))}
          {architecture.requirements.forbiddenLanguages.map((lang) => (
            <span
              key={`f-${lang}`}
              className="px-2 py-0.5 rounded border border-cude-borderColor text-[10px] tracking-wide text-cude-textTertiary"
            >
              EXCLUDED · {lang.toUpperCase()}
            </span>
          ))}
        </div>
      ) : null}

      {entries.map(([platform, decision]) => (
        <StackDecisionCard
          key={platform}
          platform={platform}
          decision={decision}
          expanded={expanded === platform}
          onToggle={() => setExpanded(expanded === platform ? null : platform)}
          onOverride={(stackId) => overrideStackForTarget(platform, stackId)}
        />
      ))}
    </div>
  );
}
