// Recurring tasks (4e, D43). A repeating task is a series of occurrences, each its own task.
//
// - **On a schedule**: the calendar's repeat rule (D39), anchored on the series' start day. The next
//   occurrence comes when the newest one is completed, or on its own day when it isn't.
// - **After done**: N days, weeks or months after the day the newest occurrence is completed.
//
// Every function works on `YYYY-MM-DD` days only.

import {
  describeRepeat,
  normalizeRepeat,
  occurrences,
  repeatProblem,
  daysInMonth,
  type Repeat,
} from '../calendar';
import { addDays, daysBetween, type DateString } from '../time';

export const AFTER_DONE_UNITS = ['day', 'week', 'month'] as const;
export type AfterDoneUnit = (typeof AFTER_DONE_UNITS)[number];

export type TaskRepeat =
  ({ kind: 'schedule' } & Repeat) | { kind: 'after_done'; every: AfterDoneUnit; interval: number };

/** Which of the task's dates is the occurrence's day. */
export const SERIES_DATE_FIELDS = ['due', 'scheduled'] as const;
export type SeriesDateField = (typeof SERIES_DATE_FIELDS)[number];

export const AFTER_DONE_LIMITS = { interval: { min: 1, max: 90 } } as const;

/** The calendar rule of a schedule repeat. */
export function ruleOf(r: TaskRepeat & { kind: 'schedule' }): Repeat {
  const { kind: _, ...rule } = r;
  return rule;
}

/** What's wrong with a repeat whose series starts on `start`, or null. */
export function taskRepeatProblem(r: TaskRepeat, start: DateString): string | null {
  if (r.kind === 'schedule') return repeatProblem(ruleOf(r), start);
  const { min, max } = AFTER_DONE_LIMITS.interval;
  if (!Number.isInteger(r.interval) || r.interval < min || r.interval > max) {
    return `Repeat ${min} to ${max} ${r.every}s after.`;
  }
  return null;
}

export function normalizeTaskRepeat(r: TaskRepeat): TaskRepeat {
  if (r.kind === 'after_done') return { kind: 'after_done', every: r.every, interval: r.interval };
  return { kind: 'schedule', ...normalizeRepeat(ruleOf(r)) };
}

/** `day` plus `n` months, on the same day of the month (the last day in shorter months). */
export function addMonths(day: DateString, n: number): DateString {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const months = m - 1 + n;
  const year = y + Math.floor(months / 12);
  const month = (((months % 12) + 12) % 12) + 1;
  const dd = Math.min(d, daysInMonth(year, month));
  return `${year}-${String(month).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

/**
 * The first occurrence's day of a new series: `day` (the task's date) when it has one, else the
 * first day at or after `today` the schedule happens on (today for "after done").
 */
export function firstSeriesDay(r: TaskRepeat, day: DateString | null, today: DateString) {
  if (day) return day;
  if (r.kind === 'after_done' || r.every !== 'week') return today;
  return occurrences(today, ruleOf(r), today, addDays(today, 7 * r.interval))[0] ?? today;
}

/** The first schedule day after `after`, or null when the repeat is over (`until`). */
export function scheduleDayAfter(
  r: TaskRepeat & { kind: 'schedule' },
  start: DateString,
  after: DateString,
): DateString | null {
  const from = addDays(after, 1);
  const span = { day: 1, week: 7, month: 31, year: 366 }[r.every] * r.interval + 7;
  return occurrences(start, ruleOf(r), from, addDays(from, span))[0] ?? null;
}

/**
 * The day the next occurrence is for, when the newest one (on `newest`) is completed on `doneDay`.
 * Null when a schedule is over.
 */
export function nextSeriesDay(
  r: TaskRepeat,
  start: DateString,
  newest: DateString,
  doneDay: DateString,
): DateString | null {
  if (r.kind === 'schedule') return scheduleDayAfter(r, start, newest);
  if (r.every === 'month') return addMonths(doneDay, r.interval);
  return addDays(doneDay, r.interval * (r.every === 'week' ? 7 : 1));
}

/**
 * The occurrence a schedule owes on `today` while its newest one (on `newest`) isn't done: the
 * latest schedule day in (`newest`, `today`], or null. Only the latest: missed days don't pile up.
 */
export function dueScheduleDay(
  r: TaskRepeat,
  start: DateString,
  newest: DateString,
  today: DateString,
): DateString | null {
  if (r.kind !== 'schedule' || today <= newest) return null;
  return occurrences(start, ruleOf(r), addDays(newest, 1), today).at(-1) ?? null;
}

/** The schedule's days in [`from`, `to`] after `newest` (the calendar's faint chips ahead). */
export function daysAhead(
  r: TaskRepeat,
  start: DateString,
  newest: DateString,
  from: DateString,
  to: DateString,
): DateString[] {
  if (r.kind !== 'schedule') return [];
  const after = addDays(newest, 1);
  return occurrences(start, ruleOf(r), from > after ? from : after, to);
}

/** "Every week on Fri", "Every month on the 5th", "2 days after it's done". */
export function describeTaskRepeat(r: TaskRepeat | null | undefined, start: DateString): string {
  if (!r) return 'Doesn’t repeat';
  if (r.kind === 'schedule') return describeRepeat(ruleOf(r), start);
  const unit = r.interval === 1 ? `1 ${r.every}` : `${r.interval} ${r.every}s`;
  return `${unit} after it’s done`;
}

/** The task's date that holds the occurrence's day. */
export function seriesDateField(t: {
  dueDate: DateString | null;
  scheduledDate: DateString | null;
}): SeriesDateField {
  return t.dueDate || !t.scheduledDate ? 'due' : 'scheduled';
}

/**
 * The dates of the next occurrence: the series' field on `day`, the other date (when the source
 * had one) moved by as many days.
 */
export function shiftedDates(
  source: { dueDate: DateString | null; scheduledDate: DateString | null },
  field: SeriesDateField,
  sourceDay: DateString,
  day: DateString,
): { dueDate: DateString | null; scheduledDate: DateString | null; shift: number } {
  const shift = daysBetween(sourceDay, day);
  const move = (d: DateString | null) => (d ? addDays(d, shift) : null);
  return field === 'due'
    ? { dueDate: day, scheduledDate: move(source.scheduledDate), shift }
    : { scheduledDate: day, dueDate: move(source.dueDate), shift };
}

/** About how many times a week a schedule comes ("after done" has no fixed days: 0). */
export function timesPerWeek(r: TaskRepeat): number {
  if (r.kind !== 'schedule') return 0;
  switch (r.every) {
    case 'day':
      return 7 / r.interval;
    case 'week':
      return (r.weekdays?.length ?? 1) / r.interval;
    case 'month':
      return 12 / 52 / r.interval;
    case 'year':
      return 1 / 52 / r.interval;
  }
}

/** Busier than this a week, a schedule's days ahead stay off the month grid (they'd fill it). */
export const MONTH_GRID_MAX_PER_WEEK = 3;
