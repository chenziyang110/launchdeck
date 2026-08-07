import { describe, expect, it } from 'vitest';
import { createSeedState, SEED_DATE } from '../src/data/seed.js';
import {
  addHabit,
  calculateStreak,
  getTodayProgress,
  toggleCompletion
} from '../src/lib/habits.js';

describe('habit state', () => {
  it('starts with the same deterministic seed every time', () => {
    const first = createSeedState();
    const second = createSeedState();

    expect(first).toEqual(second);
    expect(first.habits.map((habit) => habit.id)).toEqual([
      'morning-walk',
      'read-pages',
      'evening-stretch'
    ]);
    expect(first.habits[0].completedDates).toContain(SEED_DATE);
  });

  it('toggles one completion without mutating the previous state', () => {
    const initial = createSeedState();
    const updated = toggleCompletion(initial, 'read-pages', SEED_DATE);

    expect(updated).not.toBe(initial);
    expect(updated.habits[1].completedDates).toContain(SEED_DATE);
    expect(initial.habits[1].completedDates).not.toContain(SEED_DATE);
    expect(toggleCompletion(updated, 'read-pages', SEED_DATE)).toEqual(initial);
  });

  it('calculates a consecutive streak from the requested date', () => {
    const state = createSeedState();
    const habit = state.habits[0];

    expect(calculateStreak(habit, '2025-12-31')).toBe(2);
    expect(calculateStreak(habit, SEED_DATE)).toBe(3);
  });

  it('adds a clean, unique habit id and reports progress', () => {
    const state = createSeedState();
    const updated = addHabit(state, 'Drink water');

    expect(updated.habits.at(-1).id).toBe('drink-water');
    expect(getTodayProgress(updated, SEED_DATE)).toMatchObject({ completed: 1, total: 4, percentage: 25 });
  });
});
