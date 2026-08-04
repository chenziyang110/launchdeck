import { STORAGE_KEY } from '../data/seed.js';
import { createSeedState } from '../data/seed.js';
import { normalizeState } from './habits.js';

function getDefaultStorage() {
  return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
}

export function loadState(storage = getDefaultStorage()) {
  if (!storage) {
    return createSeedState();
  }

  try {
    const saved = storage.getItem(STORAGE_KEY);
    return saved ? normalizeState(JSON.parse(saved)) : createSeedState();
  } catch {
    return createSeedState();
  }
}

export function saveState(state, storage = getDefaultStorage()) {
  if (!storage) {
    return false;
  }

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
