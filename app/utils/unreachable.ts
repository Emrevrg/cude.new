// Cude.new - unreachable.ts (Cude product surface, 2026)
export function unreachable(message: string): never {
  throw new Error(`Unreachable: ${message}`);
}
