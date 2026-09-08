// Cude.new - stream-recovery.ts (Cude product surface, 2026)
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('stream-recovery');

export interface StreamRecoveryOptions {
  maxRetries?: number;

  /** How long a gap between chunks may last once the answer has started. */
  timeout?: number;

  /**
   * How long the provider may be silent before the first token arrives.
   *
   * A separate, longer allowance, because silence before the first token is
   * not the same event as silence in the middle of an answer. A reasoning
   * model thinks before it writes and puts nothing on the wire while it does:
   * NVIDIA's Kimi K3 was cut off part-way through building a page, having
   * spent the whole allowance reasoning, and the turn ended with the project's
   * files created and empty.
   *
   * Once tokens are arriving, a long gap does mean something is wrong, and the
   * shorter `timeout` applies from then on.
   */
  firstTokenTimeout?: number;

  onTimeout?: () => void;
  onRecovery?: () => void;
}

export class StreamRecoveryManager {
  private _retryCount = 0;
  private _timeoutHandle: NodeJS.Timeout | null = null;
  private _lastActivity: number = Date.now();
  private _isActive = true;

  /** False until the provider has sent anything at all. */
  private _started = false;

  constructor(private _options: StreamRecoveryOptions = {}) {
    this._options = {
      maxRetries: 3,
      timeout: 30000, // 30 seconds default
      ..._options,
    };
  }

  startMonitoring() {
    this._resetTimeout();
  }

  updateActivity() {
    this._lastActivity = Date.now();
    this._started = true;
    this._resetTimeout();
  }

  /** The allowance that applies right now. */
  private _currentTimeout(): number {
    if (this._started) {
      return this._options.timeout ?? 30000;
    }

    return this._options.firstTokenTimeout ?? this._options.timeout ?? 30000;
  }

  private _resetTimeout() {
    if (this._timeoutHandle) {
      clearTimeout(this._timeoutHandle);
    }

    if (!this._isActive) {
      return;
    }

    this._timeoutHandle = setTimeout(() => {
      if (this._isActive) {
        logger.warn('Stream timeout detected');
        this._handleTimeout();
      }
    }, this._currentTimeout());
  }

  private _handleTimeout() {
    if (this._retryCount >= (this._options.maxRetries || 3)) {
      logger.error('Max retries reached for stream recovery');
      this.stop();

      return;
    }

    this._retryCount++;
    logger.info(`Attempting stream recovery (attempt ${this._retryCount})`);

    if (this._options.onTimeout) {
      this._options.onTimeout();
    }

    // Reset monitoring after recovery attempt
    this._resetTimeout();

    if (this._options.onRecovery) {
      this._options.onRecovery();
    }
  }

  stop() {
    this._isActive = false;

    if (this._timeoutHandle) {
      clearTimeout(this._timeoutHandle);
      this._timeoutHandle = null;
    }
  }

  getStatus() {
    return {
      isActive: this._isActive,
      retryCount: this._retryCount,
      lastActivity: this._lastActivity,
      timeSinceLastActivity: Date.now() - this._lastActivity,
    };
  }
}
