// Cude.new - mobile.ts (Cude product surface, 2026)
export function isMobile() {
  // we use sm: as the breakpoint for mobile. It's currently set to 640px
  return globalThis.innerWidth < 640;
}
