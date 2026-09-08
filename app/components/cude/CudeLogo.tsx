/**
 * Cude.new - brand lockup and mark.
 *
 * The artwork is a metallic silver rendering: it reads on a dark surface, but
 * on a light one the wordmark washes out to near-invisible. That was first
 * handled with a CSS `filter` swap, which failed in practice — the filter was
 * transitioned, and a transition that never receives a start frame leaves the
 * computed value stuck at the identity filter, so the logo stayed washed out.
 *
 * Both variants are therefore pre-rendered and the theme picks one. No filter,
 * no transition, nothing to get stuck: whichever image is not for the active
 * theme is simply not displayed.
 */

import { classNames } from '~/utils/classNames';

interface BrandImageProps {
  /** Asset without the variant suffix, e.g. "/cude-lockup". */
  base: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  width?: number;
  height?: number;
}

function BrandImage({ base, alt, className, style, width, height }: BrandImageProps) {
  const common = { alt, width, height, style, draggable: false as const };

  return (
    <>
      <img {...common} src={`${base}.png`} className={classNames('cude-brand-dark', className)} />
      <img {...common} src={`${base}-light.png`} className={classNames('cude-brand-light', className)} />
    </>
  );
}

/** Full lockup: mark + "cude.new" wordmark. Used in the header. */
export function CudeLogo({ height = 26, className }: { height?: number; className?: string }) {
  return (
    <span className={classNames('inline-flex items-center select-none', className)}>
      <BrandImage base="/cude-lockup" alt="Cude.new" height={height} style={{ height }} className="w-auto shrink-0" />
    </span>
  );
}

/** Mark only, for tight spaces. */
export function CudeIcon({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <BrandImage
      base="/cude-mark"
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={classNames('shrink-0', className)}
    />
  );
}
