import { PRODUCT_RUN_STAGES, createProductRun, type ProductRunState } from './productRun';

export interface ProductRunStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function productRunStorageKey(runId: string): string {
  return `cude.product-run.${runId}`;
}

export function loadProductRun(storage: ProductRunStorage, runId: string): ProductRunState {
  const fallback = createProductRun(runId);

  try {
    const raw = storage.getItem(productRunStorageKey(runId));

    if (!raw) {
      return fallback;
    }

    const value: unknown = JSON.parse(raw);

    return isProductRunState(value, runId) ? value : fallback;
  } catch {
    return fallback;
  }
}

export function saveProductRun(storage: ProductRunStorage, state: ProductRunState): boolean {
  try {
    storage.setItem(productRunStorageKey(state.id), JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

function isProductRunState(value: unknown, expectedId: string): value is ProductRunState {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<ProductRunState>;

  return (
    candidate.id === expectedId &&
    typeof candidate.stage === 'string' &&
    PRODUCT_RUN_STAGES.includes(candidate.stage as ProductRunState['stage']) &&
    Array.isArray(candidate.builds) &&
    Array.isArray(candidate.evidence) &&
    Array.isArray(candidate.events) &&
    Number.isInteger(candidate.architectureRevisions) &&
    Number.isInteger(candidate.designRevisions)
  );
}
