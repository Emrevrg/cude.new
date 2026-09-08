/**
 * Cude.new - a scroller that follows new content.
 *
 * The conversation should stay pinned to the newest message while it streams,
 * and stop following the moment the reader scrolls up to look at something.
 * Scrolling back to the bottom resumes.
 *
 * That is the whole contract, and it is about a hundred lines. What it replaces
 * was seven hundred and sixty, including a hand-written spring animation, a
 * velocity model and a scroll-anchoring implementation that fought the
 * browser's own.
 */

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { classNames } from '~/utils/classNames';

interface StickToBottomValue {
  isAtBottom: boolean;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

const StickToBottomContext = createContext<StickToBottomValue | null>(null);

export function useStickToBottomContext(): StickToBottomValue {
  const value = useContext(StickToBottomContext);

  if (!value) {
    throw new Error('useStickToBottomContext must be used inside <StickToBottom>.');
  }

  return value;
}

export interface StickToBottomProps {
  children: React.ReactNode;
  className?: string;
  footer?: React.ReactNode;

  /** How to move when following new content. Defaults to smooth. */
  behavior?: ScrollBehavior;

  /**
   * Whether this is a scroll viewport at all. Defaults to true.
   *
   * Before a conversation starts there is nothing to follow, and being a
   * viewport is actively harmful: as a flex child that can scroll, it is
   * allowed to shrink below its content, so the composer inside it collapses
   * to a sliver. Off, it takes the height its content needs.
   */
  scrollable?: boolean;
}

/**
 * Within this many pixels of the end still counts as the bottom.
 *
 * Fractional scroll positions and sub-pixel layout mean an exact comparison is
 * never true on a real page, which is how "stuck at the bottom" turns into
 * "stopped following for no visible reason".
 */
export const BOTTOM_THRESHOLD = 24;

export interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/** How far the last line is from view. Never negative, despite over-scroll. */
export function distanceFromBottom({ scrollTop, scrollHeight, clientHeight }: ScrollMetrics): number {
  return Math.max(0, scrollHeight - scrollTop - clientHeight);
}

/** Whether the reader is close enough to the end to keep following. */
export function isNearBottom(metrics: ScrollMetrics, threshold = BOTTOM_THRESHOLD): boolean {
  return distanceFromBottom(metrics) <= threshold;
}

function Root({ children, footer, className, behavior = 'smooth', scrollable = true }: StickToBottomProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const [isAtBottom, setIsAtBottom] = useState(true);

  /*
   * Whether to follow. Held in a ref as well as state because the observer
   * below runs outside React's render and needs the current answer, not the
   * one captured when it was created.
   */
  const following = useRef(true);

  const scrollToBottom = useCallback(
    (how: ScrollBehavior = behavior) => {
      const element = scrollRef.current;

      if (!element) {
        return;
      }

      following.current = true;
      setIsAtBottom(true);
      element.scrollTo({ top: element.scrollHeight, behavior: how });
    },
    [behavior],
  );

  const onScroll = useCallback(() => {
    const element = scrollRef.current;

    if (!element) {
      return;
    }

    const atBottom = isNearBottom({
      scrollTop: element.scrollTop,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    });

    following.current = atBottom;
    setIsAtBottom(atBottom);
  }, []);

  // Follow the content as it grows, but only while the reader is at the end.
  useLayoutEffect(() => {
    const element = scrollRef.current;
    const content = contentRef.current;

    if (!element || !content || typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      if (following.current) {
        /*
         * Instant while streaming. A smooth scroll started every time a token
         * lands never finishes, and the view crawls behind the text.
         */
        element.scrollTop = element.scrollHeight;
      }
    });

    observer.observe(content);

    return () => observer.disconnect();
  }, []);

  // Start at the bottom, so opening a conversation shows its newest message.
  useEffect(() => {
    scrollToBottom('auto');
  }, [scrollToBottom]);

  const value = useMemo<StickToBottomValue>(() => ({ isAtBottom, scrollToBottom }), [isAtBottom, scrollToBottom]);

  return (
    <StickToBottomContext.Provider value={value}>
      <div className={classNames(scrollable ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'shrink-0', className)}>
        <div
          ref={scrollRef}
          onScroll={onScroll}
          data-testid="conversation-scroll"
          className={scrollable ? 'min-h-0 flex-1 overflow-y-auto overflow-x-hidden' : ''}
        >
          <div ref={contentRef}>{children}</div>
        </div>
        {footer}
      </div>
    </StickToBottomContext.Provider>
  );
}

function Content({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
}

export const StickToBottom = Object.assign(Root, { Content });
