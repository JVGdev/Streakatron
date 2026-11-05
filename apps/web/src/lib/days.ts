// Showing days. A `YYYY-MM-DD` day is formatted at noon UTC, read in UTC, so no local offset can
// turn it into its neighbour.

import { deadlineOf, monthsBetween, type DatePrecision } from '@streakatron/shared/calendar';
import { daysBetween, wallClock } from '@streakatron/shared/time';

const long = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});

/** "Tuesday, November 3" */
export const formatDayLong = (day: string) => long.format(new Date(`${day}T12:00:00Z`));

const short = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const shortYear = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});
const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' });

const atNoon = (day: string) => new Date(`${day}T12:00:00Z`);

/**
 * A day relative to today: "Today", "Tomorrow", "Yesterday", a weekday within the next week,
 * "Nov 12" this year, "Jan 3, 2027" otherwise.
 */
export function formatDayShort(day: string, today: string): string {
  const diff = daysBetween(today, day);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return weekday.format(atNoon(day));
  return day.slice(0, 4) === today.slice(0, 4)
    ? short.format(atNoon(day))
    : shortYear.format(atNoon(day));
}

/** "N days left", "Due today", "N days late". */
export function countdown(day: string, today: string): string {
  const diff = daysBetween(today, day);
  if (diff === 0) return 'Due today';
  if (diff > 0) return `${diff} day${diff === 1 ? '' : 's'} left`;
  return `${-diff} day${diff === -1 ? '' : 's'} late`;
}

/** “1 h 30 min”, “2 h”, “45 min”. */
export const formatMinutes = (m: number) => {
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return h ? (rest ? `${h} h ${rest} min` : `${h} h`) : `${rest} min`;
};

/** When a task reminds, the way the app says days: "Tomorrow at 15:30" (D38). */
export function formatRemindAt(iso: string, timeZone: string, today: string): string {
  const w = wallClock(new Date(iso), timeZone);
  const time = `${String(w.hour).padStart(2, '0')}:${String(w.minute).padStart(2, '0')}`;
  return w.date === today ? `Today at ${time}` : `${formatDayShort(w.date, today)} at ${time}`;
}

// --- Tentative dates (D32, D39) --------------------------------------------------------------

const monthName = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' });
const monthYear = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "~March" (this year), "~March 2027"; the month of a `YYYY-MM-DD`. */
export const formatMonth = (day: string, today: string) =>
  `~${(day.slice(0, 4) === today.slice(0, 4) ? monthName : monthYear).format(atNoon(day))}`;

/** A date as precise as it is: the day ("Tomorrow", "Jul 4"), "~March 2027", or "Date TBD". */
export function formatTentative(
  date: string | null,
  precision: DatePrecision,
  today: string,
): string {
  if (!date || precision === 'tbd') return 'Date TBD';
  return precision === 'month' ? formatMonth(date, today) : formatDayShort(date, today);
}

/** How far off something is, for countdowns: "Today", "Tomorrow", "In 12 days", "In ~4 months". */
export function untilText(date: string | null, precision: DatePrecision, today: string): string {
  if (!date || precision === 'tbd') return 'Date to be decided';
  if (precision === 'month') {
    const m = monthsBetween(today, date);
    if (m < 0) return 'Past';
    if (m === 0) return 'This month';
    return m === 1 ? 'Next month' : `In ~${m} months`;
  }
  const d = daysBetween(today, date);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d < 0) return `${-d} day${d === -1 ? '' : 's'} ago`;
  return `In ${d} days`;
}

/** The big number of a countdown card: "240" days, "~4" months, "TBD". */
export function countdownTile(
  date: string | null,
  precision: DatePrecision,
  today: string,
): { value: string; unit: string } {
  if (!date || precision === 'tbd') return { value: 'TBD', unit: 'date' };
  if (precision === 'month') {
    const m = Math.max(0, monthsBetween(today, date));
    return m === 0
      ? { value: 'This', unit: 'month' }
      : { value: `~${m}`, unit: m === 1 ? 'month' : 'months' };
  }
  const d = Math.max(0, daysBetween(today, date));
  if (d === 0) return { value: 'Today', unit: '' };
  return { value: String(d), unit: d === 1 ? 'day' : 'days' };
}

/** A goal's deadline line: "Jul 4 · 240 days left", "~July 2027 · ~8 months left". */
export function goalDue(
  goal: { dueDate: string | null; duePrecision: 'day' | 'month' },
  today: string,
): { text: string; late: boolean } | null {
  if (!goal.dueDate) return null;
  const end = deadlineOf(goal.dueDate, goal.duePrecision)!;
  const late = end < today;
  if (goal.duePrecision === 'month') {
    const m = monthsBetween(today, goal.dueDate);
    const left = late
      ? 'late'
      : m <= 0
        ? 'this month'
        : m === 1
          ? '~1 month left'
          : `~${m} months left`;
    return { text: `${formatMonth(goal.dueDate, today)} · ${left}`, late };
  }
  return { text: countdown(goal.dueDate, today), late };
}
