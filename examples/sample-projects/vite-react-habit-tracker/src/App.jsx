import { useEffect, useMemo, useState } from 'react';
import {
  addHabit,
  calculateStreak,
  getLocalDateKey,
  getTodayProgress,
  isCompleted,
  toggleCompletion
} from './lib/habits.js';
import { loadState, saveState } from './lib/storage.js';

const FILTERS = [
  { id: 'all', label: 'All habits' },
  { id: 'open', label: 'To do' },
  { id: 'done', label: 'Completed' }
];

function formatToday(date = new Date()) {
  return new Intl.DateTimeFormat('en', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  }).format(date);
}

function HabitCard({ habit, today, onToggle }) {
  const completed = isCompleted(habit, today);
  const streak = calculateStreak(habit, today);

  return (
    <article className={`habit-card${completed ? ' is-complete' : ''}`}>
      <div className="habit-mark" style={{ '--habit-color': habit.color }} aria-hidden="true">
        {completed ? '✓' : '·'}
      </div>
      <div className="habit-copy">
        <h3>{habit.name}</h3>
        <p>{habit.detail}</p>
      </div>
      <div className="habit-meta">
        <span className="streak">{streak} day{streak === 1 ? '' : 's'}</span>
        <button
          className="check-button"
          type="button"
          aria-pressed={completed}
          onClick={() => onToggle(habit.id)}
        >
          {completed ? 'Done for today' : 'Mark complete'}
        </button>
      </div>
    </article>
  );
}

export default function App() {
  const today = useMemo(() => getLocalDateKey(), []);
  const [state, setState] = useState(() => loadState());
  const [filter, setFilter] = useState('all');
  const [newHabit, setNewHabit] = useState('');
  const progress = getTodayProgress(state, today);

  useEffect(() => {
    saveState(state);
  }, [state]);

  const visibleHabits = state.habits.filter((habit) => {
    if (filter === 'done') return isCompleted(habit, today);
    if (filter === 'open') return !isCompleted(habit, today);
    return true;
  });

  function handleAdd(event) {
    event.preventDefault();
    if (!newHabit.trim()) return;
    setState((current) => addHabit(current, newHabit));
    setNewHabit('');
  }

  function handleToggle(habitId) {
    setState((current) => toggleCompletion(current, habitId, today));
  }

  return (
    <main className="app-shell">
      <section className="hero" aria-labelledby="page-title">
        <div className="eyebrow"><span className="eyebrow-dot" /> Daymark</div>
        <div className="hero-content">
          <div>
            <p className="date-label">{formatToday()}</p>
            <h1 id="page-title">Small steps,<br /><em>kept visible.</em></h1>
            <p className="intro">A gentle place to keep the promises you make to yourself.</p>
          </div>
          <div className="progress-orbit" aria-label={`${progress.percentage}% of habits completed today`}>
            <div className="progress-ring" style={{ '--progress': `${progress.percentage * 3.6}deg` }}>
              <div className="progress-center">
                <strong>{progress.completed}/{progress.total}</strong>
                <span>today</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="tracker-panel" aria-labelledby="habits-heading">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">Your rhythm</p>
            <h2 id="habits-heading">Daily habits</h2>
          </div>
          <span className="habit-count">{state.habits.length} habits</span>
        </div>

        <form className="add-form" onSubmit={handleAdd}>
          <label className="sr-only" htmlFor="new-habit">Add a habit</label>
          <input
            id="new-habit"
            value={newHabit}
            onChange={(event) => setNewHabit(event.target.value)}
            placeholder="Add a habit you want to keep..."
            maxLength={80}
          />
          <button type="submit" aria-label="Add habit">+</button>
        </form>

        <div className="filter-row" role="group" aria-label="Filter habits">
          {FILTERS.map((option) => (
            <button
              className={filter === option.id ? 'filter-button is-active' : 'filter-button'}
              type="button"
              key={option.id}
              onClick={() => setFilter(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="habit-list">
          {visibleHabits.length > 0 ? (
            visibleHabits.map((habit) => (
              <HabitCard key={habit.id} habit={habit} today={today} onToggle={handleToggle} />
            ))
          ) : (
            <div className="empty-state">Nothing here yet. Try another view or add a habit above.</div>
          )}
        </div>

        <footer className="panel-footer">
          <span className="save-status"><span className="save-dot" /> Saved locally in this browser</span>
          <span>Keep going, gently.</span>
        </footer>
      </section>
    </main>
  );
}
