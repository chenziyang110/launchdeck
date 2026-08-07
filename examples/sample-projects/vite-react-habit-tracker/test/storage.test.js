import { describe, expect, it } from 'vitest';
import { STORAGE_KEY, createSeedState } from '../src/data/seed.js';
import { loadState, saveState } from '../src/lib/storage.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
}

describe('browser persistence', () => {
  it('round-trips the state through the native storage shape', () => {
    const storage = memoryStorage();
    const state = createSeedState();

    expect(saveState(state, storage)).toBe(true);
    expect(storage.getItem(STORAGE_KEY)).toContain('morning-walk');
    expect(loadState(storage)).toEqual(state);
  });

  it('falls back to deterministic seed data when saved data is corrupt', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, '{not-json');

    expect(loadState(storage)).toEqual(createSeedState());
  });
});
