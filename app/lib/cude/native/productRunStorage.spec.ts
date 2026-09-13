import { describe, expect, it } from 'vitest';
import { createProductRun, productRunReducer } from './productRun';
import { loadProductRun, productRunStorageKey, saveProductRun, type ProductRunStorage } from './productRunStorage';

function memoryStorage(): ProductRunStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();

  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
  };
}

describe('Cude product-run persistence', () => {
  it('round-trips a valid run', () => {
    const storage = memoryStorage();
    const state = productRunReducer(createProductRun('run-1'), {
      type: 'SUBMIT_BRIEF',
      brief: { outcome: 'Ship a field app', audience: 'inspectors', constraints: ['offline'] },
    });

    expect(saveProductRun(storage, state)).toBe(true);
    expect(loadProductRun(storage, 'run-1')).toEqual(state);
  });

  it('ignores malformed, stale, and cross-run data', () => {
    const storage = memoryStorage();
    storage.values.set(productRunStorageKey('broken'), '{nope');
    storage.values.set(productRunStorageKey('other'), JSON.stringify(createProductRun('wrong-id')));

    expect(loadProductRun(storage, 'broken')).toEqual(createProductRun('broken'));
    expect(loadProductRun(storage, 'other')).toEqual(createProductRun('other'));
  });

  it('survives storage failures', () => {
    const storage: ProductRunStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };

    const state = createProductRun('private');
    expect(loadProductRun(storage, 'private')).toEqual(state);
    expect(saveProductRun(storage, state)).toBe(false);
  });
});
