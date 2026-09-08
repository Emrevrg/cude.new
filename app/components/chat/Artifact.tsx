import { memo, useState } from 'react';
import { useStore } from '@nanostores/react';
import { workbenchStore, type ArtifactState } from '~/lib/stores/workbench';
import { WORK_DIR } from '~/utils/constants';

export function openArtifactInWorkbench(value: unknown) {
  if (typeof value !== 'string') {
    return;
  }

  const filePath = value;
  workbenchStore.showWorkbench.set(true);
  workbenchStore.currentView.set('code');
  workbenchStore.setSelectedFile(filePath.startsWith('/') ? filePath : WORK_DIR + '/' + filePath);
}
export const Artifact = memo(({ messageId, artifactId }: { messageId: string; artifactId: string }) => {
  const artifacts = useStore(workbenchStore.artifacts);
  const artifact = artifacts[workbenchStore.artifactKey(messageId, artifactId)];

  return artifact ? <InlineActivity artifact={artifact} /> : null;
});

function InlineActivity({ artifact }: { artifact: ArtifactState }) {
  const states = useStore(artifact.runner.actions);
  const [expanded, setExpanded] = useState(false);
  const actions = Object.entries(states);
  const active = actions.filter(([, a]) => a.status === 'running' || a.status === 'pending');
  const visible = expanded ? actions : active.length ? active : actions.slice(-3);
  const files = new Set(actions.filter(([, a]) => a.type === 'file').map(([, a]) => a.filePath));

  return (
    <div className="my-3 min-w-0 text-xs text-cude-textSecondary" data-testid="inline-activity">
      {visible.map(([id, a]) => (
        <div key={id} className="flex min-w-0 items-start gap-2 py-1.5">
          <span
            aria-hidden="true"
            className={
              a.status === 'running'
                ? 'i-svg-spinners:90-ring-with-bg shrink-0'
                : a.type === 'file'
                  ? 'i-ph:file-code shrink-0'
                  : 'i-ph:terminal-window shrink-0'
            }
          />
          {a.type === 'file' ? (
            <button
              className="min-w-0 break-all text-left hover:underline"
              onClick={() => openArtifactInWorkbench(a.filePath || '')}
            >
              {a.filePath}
            </button>
          ) : (
            <code className="min-w-0 whitespace-pre-wrap break-all">{a.content || a.type}</code>
          )}
          <span className="ml-auto shrink-0 text-cude-textTertiary">{a.status}</span>
        </div>
      ))}
      <button
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className="mt-2 text-cude-textSecondary hover:underline"
      >
        {expanded ? 'Collapse activity' : actions.length + ' actions · ' + files.size + ' files'}
      </button>
    </div>
  );
}
