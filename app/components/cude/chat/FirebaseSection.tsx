/*
 * Cude.new - Firebase, as a section of the database surface.
 *
 * Asks for a different thing than Supabase does, and the difference is real:
 * Firebase has no token that lists your projects, so this takes the web config
 * the console prints. The reasoning is in ~/lib/cude/state/firebaseProject.
 */
import { useCallback, useState } from 'react';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import { firebaseProject } from '~/lib/cude/state/firebaseProject';

const PLACEHOLDER = `const firebaseConfig = {
  apiKey: "…",
  authDomain: "your-app.firebaseapp.com",
  projectId: "your-app",
};`;

export function FirebaseSection() {
  const state = useStore(firebaseProject.state);
  const ready = useStore(firebaseProject.ready);

  const [pasted, setPasted] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const save = useCallback(() => {
    const result = firebaseProject.connect(pasted);

    if (!result.ok) {
      setProblem(result.problem ?? 'Could not read that config.');
      return;
    }

    setProblem(null);
    setPasted('');
  }, [pasted]);

  if (ready && state.config) {
    return (
      <div>
        <div className="rounded-lg border border-cude-borderColor bg-cude-background-depth-2 p-3">
          <p className="text-sm text-cude-textPrimary">{state.config.projectId}</p>
          <p className="mt-0.5 text-[11px] text-cude-textTertiary">{state.config.authDomain}</p>
        </div>

        <p className="mt-3 text-[11px] text-cude-textTertiary">
          Generated projects get these as VITE_FIREBASE_* variables. Disconnecting forgets them here; your Firebase
          project is untouched.
        </p>

        <button
          type="button"
          onClick={() => firebaseProject.disconnect()}
          className="mt-3 rounded-lg px-3 py-1.5 text-sm text-cude-textSecondary transition-colors hover:bg-cude-background-depth-3"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[11px] text-cude-textTertiary">
        Paste the config from your Firebase console — Project settings, then your web app.
      </p>

      <textarea
        value={pasted}
        onChange={(event) => {
          setPasted(event.target.value);
          setProblem(null);
        }}
        rows={7}
        spellCheck={false}
        placeholder={PLACEHOLDER}
        className={classNames(
          'mt-2 w-full resize-none rounded-lg px-3 py-2 font-mono text-xs',
          'bg-cude-background-depth-2 text-cude-textPrimary placeholder:text-cude-textTertiary',
          'border border-cude-borderColor focus:outline-none focus:ring-1 focus:ring-cude-borderColorActive',
        )}
      />

      {problem && (
        <p className="mt-2 text-sm text-cude-item-contentDanger" role="alert">
          {problem}
        </p>
      )}

      <p className="mt-2 text-[11px] text-cude-textTertiary">
        These values are public — a Firebase web config ships in every Firebase app. Security rules on the project are
        what protect the data.
      </p>

      <button
        type="button"
        onClick={save}
        disabled={pasted.trim().length === 0}
        className={classNames(
          'mt-3 rounded-lg px-4 py-1.5 text-sm transition-colors',
          'bg-cude-item-backgroundAccent text-cude-item-contentAccent',
          'disabled:cursor-not-allowed disabled:opacity-40',
        )}
      >
        Connect
      </button>
    </div>
  );
}
