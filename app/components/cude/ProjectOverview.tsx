/**
 * Cude.new - Project overview the person can read and, when needed, copy.
 *
 * Lives in the Product panel rather than a panel of its own: "what is this
 * project" and "what else can ship alongside it" answer one question. The
 * file stats come straight from the workspace FileMap and are cheap to keep.
 */
import { memo, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import { architectureStore } from '~/lib/stores/cude';
import { preFlight } from '~/lib/cude/preflight';

export const ProjectOverview = memo(() => {
  const files = useStore(workbenchStore.files);
  const architecture = useStore(architectureStore);
  const targets = architecture ? Object.keys(architecture.stackDecisions) : [];
  const report = useMemo(() => preFlight(files), [files]);
  const primary = targets[0]?.toUpperCase() ?? '—';

  return (
    <div className="rounded-lg border border-cude-borderColor bg-cude-background-depth-1 p-4 space-y-3">
      <div className="text-[11px] tracking-widest font-semibold text-cude-textTertiary">PROJECT</div>
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-xs text-cude-textTertiary">Files</div>
          <div className="font-medium text-cude-textPrimary">{report.files}</div>
        </div>
        <div>
          <div className="text-xs text-cude-textTertiary">Bytes</div>
          <div className="font-medium text-cude-textPrimary">{(report.bytes / 1024).toFixed(1)}KB</div>
        </div>
        <div>
          <div className="text-xs text-cude-textTertiary">Primary</div>
          <div className="font-medium text-cude-textPrimary">{primary}</div>
        </div>
      </div>
      {targets.length > 1 && <div className="text-xs text-cude-textSecondary">Targets: {targets.join(' + ')}</div>}
      {report.issues.length > 0 && (
        <div className="space-y-1">
          {report.issues.slice(0, 3).map((issue, index) => (
            <div
              key={index}
              className={issue.level === 'warning' ? 'text-xs text-amber-600' : 'text-xs text-cude-textSecondary'}
            >
              {issue.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

ProjectOverview.displayName = 'ProjectOverview';
