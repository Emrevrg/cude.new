import { PROJECT_TYPE_CONFIGS, type ProjectType } from '~/lib/cude/platform';

interface Props {
  value: ProjectType;
  onChange: (v: ProjectType) => void;
  compact?: boolean;
}

const ORDER: ProjectType[] = [
  'auto',
  'web',
  'fullstack',
  'pwa',
  'android',
  'mobile',
  'desktop',
  'browser-extension',
  'vscode-extension',
  'backend',
];

export function PlatformSelector({ value, onChange, compact }: Props) {
  return (
    <div
      className={`flex flex-wrap gap-1.5 ${compact ? '' : 'p-1 bg-cude-background-depth-2 border border-cude-borderColor rounded-lg'}`}
    >
      {ORDER.map((id) => {
        const cfg = PROJECT_TYPE_CONFIGS[id];
        const active = value === id;

        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={`px-2.5 py-1 text-[11px] tracking-wide font-medium rounded-md border transition-colors ${
              active
                ? 'bg-cude-button-primary-background text-cude-button-primary-text border-transparent'
                : 'bg-transparent text-cude-textSecondary border-cude-borderColor hover:text-cude-textPrimary hover:border-cude-textTertiary'
            }`}
            title={cfg.description}
          >
            {cfg.shortLabel}
          </button>
        );
      })}
    </div>
  );
}

export function PlatformBadge({ type }: { type: ProjectType }) {
  const cfg = PROJECT_TYPE_CONFIGS[type];
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-cude-borderColor bg-cude-background-depth-2 text-[11px] font-medium tracking-wide text-cude-textSecondary">
      <span className={cfg.icon + ' text-[13px]'} />
      {cfg.shortLabel}
    </span>
  );
}
