/**
 * Cude.new - preview sessions.
 *
 * Tracks the servers running in the workspace and what the preview surface
 * should show. A preview can appear without Cude starting it — a dev server
 * launched from the terminal, or by the Builder's `start` action — so this
 * observes the runtime rather than owning process lifecycle.
 *
 * Reloading a preview goes through `refresh`, which changes a token the iframe
 * key is derived from. That is deliberate: reaching into a cross-origin iframe
 * to call `location.reload()` is blocked by the sandbox, and weakening the
 * sandbox to make it work would be trading isolation for convenience.
 */

import { atom } from 'nanostores';
import type { CudeRuntime, PreviewChange } from '~/lib/cude/runtime/types';

export interface PreviewInfo {
  port: number;

  /** True once the server is actually serving. */
  ready: boolean;
  baseUrl: string;

  /** Bumped to force the preview surface to remount the frame. */
  refreshToken: number;
}

/** Stable identifier for a preview, derived from its URL. */
export function previewIdFromUrl(url: string): string | null {
  try {
    const { hostname } = new URL(url);

    /*
     * Workspace previews are served from a per-port subdomain. The leading
     * label identifies the preview; anything else is not one of ours.
     */
    const [first] = hostname.split('.');

    return first && first !== hostname ? first : null;
  } catch {
    return null;
  }
}

export class PreviewService {
  readonly previews = atom<PreviewInfo[]>([]);

  private _unwatch: (() => void) | null = null;
  private _disposed = false;

  /** Start tracking previews on this runtime. */
  attachRuntime(runtime: CudeRuntime): void {
    if (this._disposed) {
      return;
    }

    this._unwatch?.();
    this._unwatch = runtime.watchPreviews((change) => this.apply(change));
  }

  /**
   * Apply a runtime preview change.
   *
   * Exposed so the behaviour is testable directly, without timing.
   */
  apply(change: PreviewChange): void {
    if (this._disposed) {
      return;
    }

    const current = this.previews.get();

    if (change.kind === 'closed') {
      const next = current.filter((preview) => preview.port !== change.port);

      if (next.length !== current.length) {
        this.previews.set(next);
      }

      return;
    }

    const existing = current.find((preview) => preview.port === change.port);

    if (existing) {
      if (existing.baseUrl === change.url && existing.ready) {
        return;
      }

      this.previews.set(
        current.map((preview) =>
          preview.port === change.port ? { ...preview, baseUrl: change.url, ready: true } : preview,
        ),
      );

      return;
    }

    this.previews.set(
      [...current, { port: change.port, baseUrl: change.url, ready: true, refreshToken: 0 }].sort(
        (a, b) => a.port - b.port,
      ),
    );
  }

  get(port: number): PreviewInfo | undefined {
    return this.previews.get().find((preview) => preview.port === port);
  }

  /**
   * Ask the preview surface to reload one preview.
   *
   * Bumping the token rather than touching the frame keeps the iframe sandbox
   * intact.
   */
  refresh(port: number): boolean {
    const current = this.previews.get();
    const target = current.find((preview) => preview.port === port);

    if (!target) {
      return false;
    }

    this.previews.set(
      current.map((preview) =>
        preview.port === port ? { ...preview, refreshToken: preview.refreshToken + 1 } : preview,
      ),
    );

    return true;
  }

  /** Reload every preview. */
  refreshAll(): void {
    this.previews.set(this.previews.get().map((preview) => ({ ...preview, refreshToken: preview.refreshToken + 1 })));
  }

  /** Stop tracking and clear. Safe to call twice. */
  dispose(): void {
    this._unwatch?.();
    this._unwatch = null;
    this.previews.set([]);
    this._disposed = true;
  }
}
