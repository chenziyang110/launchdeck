export const STORAGE_KEY = 'daymark.habits.v1';
export const SEED_DATE = '2026-01-01';

export const DEFAULT_HABITS = Object.freeze([
  Object.freeze({
    id: 'morning-walk',
    name: 'Morning walk',
    detail: 'Start the day outside',
    color: '#e8796f',
    targetPerWeek: 5,
    completedDates: Object.freeze(['2025-12-30', '2025-12-31', SEED_DATE])
  }),
  Object.freeze({
    id: 'read-pages',
    name: 'Read 20 pages',
    detail: 'Make room for a good story',
    color: '#7c8cf2',
    targetPerWeek: 4,
    completedDates: Object.freeze(['2025-12-29', '2025-12-31'])
  }),
  Object.freeze({
    id: 'evening-stretch',
    name: 'Evening stretch',
    detail: 'Leave the day a little looser',
    color: '#e9b949',
    targetPerWeek: 6,
    completedDates: Object.freeze(['2025-12-28', '2025-12-29', '2025-12-30'])
  })
]);

export function createSeedState() {
  return {
    version: 1,
    habits: DEFAULT_HABITS.map((habit) => ({
      ...habit,
      completedDates: [...habit.completedDates]
    }))
  };
}
