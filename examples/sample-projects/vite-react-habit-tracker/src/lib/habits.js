import { createSeedState } from '../data/seed.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateToUtcKey(dateKey) {
  if (!DATE_PATTERN.test(dateKey)) {
    throw new Error(`Invalid date key: ${dateKey}`);
  }

  const [year, month, day] = dateKey.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function shiftDate(dateKey, days) {
  const shifted = new Date(dateToUtcKey(dateKey));
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

export function isCompleted(habit, dateKey) {
  return habit.completedDates.includes(dateKey);
}

export function toggleCompletion(state, habitId, dateKey) {
  const habit = state.habits.find((candidate) => candidate.id === habitId);
  if (!habit) {
    return state;
  }

  const completed = isCompleted(habit, dateKey);
  const completedDates = completed
    ? habit.completedDates.filter((value) => value !== dateKey)
    : [...habit.completedDates, dateKey].sort();

  return {
    ...state,
    habits: state.habits.map((candidate) =>
      candidate.id === habitId ? { ...candidate, completedDates } : candidate
    )
  };
}

export function addHabit(state, name, color = '#5bb8a5') {
  const cleanName = name.trim();
  if (!cleanName) {
    return state;
  }

  const baseId = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'habit';
  const existingIds = new Set(state.habits.map((habit) => habit.id));
  let id = baseId;
  let suffix = 2;
  while (existingIds.has(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }

  return {
    ...state,
    habits: [
      ...state.habits,
      {
        id,
        name: cleanName,
        detail: 'A habit you chose for yourself',
        color,
        targetPerWeek: 4,
        completedDates: []
      }
    ]
  };
}

export function calculateStreak(habit, dateKey) {
  let streak = 0;
  let cursor = dateKey;

  while (isCompleted(habit, cursor)) {
    streak += 1;
    cursor = shiftDate(cursor, -1);
  }

  return streak;
}

export function getTodayProgress(state, dateKey) {
  const completed = state.habits.filter((habit) => isCompleted(habit, dateKey)).length;
  const total = state.habits.length;

  return {
    completed,
    total,
    percentage: total === 0 ? 0 : Math.round((completed / total) * 100)
  };
}

export function normalizeState(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.habits)) {
    return createSeedState();
  }

  const habits = value.habits.filter(
    (habit) =>
      habit &&
      typeof habit.id === 'string' &&
      typeof habit.name === 'string' &&
      Array.isArray(habit.completedDates)
  );

  return habits.length > 0
    ? {
        version: 1,
        habits: habits.map((habit) => ({
          id: habit.id,
          name: habit.name,
          detail: typeof habit.detail === 'string' ? habit.detail : 'A habit you chose for yourself',
          color: typeof habit.color === 'string' ? habit.color : '#5bb8a5',
          targetPerWeek: Number.isInteger(habit.targetPerWeek) ? habit.targetPerWeek : 4,
          completedDates: habit.completedDates.filter((date) => typeof date === 'string')
        }))
      }
    : createSeedState();
}
