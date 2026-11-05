// The calendar (4d, D39): when events happen, tentative dates, event reminders and day load.
//
// - An event is on a day (`date`), a month (`precision: 'month'`, "~March 2027", stored as the
//   month's first day) or not dated yet (`'tbd'`, no date). Only day events have a time, repeat
//   or reminder.
// - A repeat is every N days, weeks (on chosen weekdays), months (on the start's day of the
//   month, the last day in shorter months) or years, from the event's date, optionally until a day.
// - Times are wall-clock `HH:MM` in the user's zone, on the calendar date (not the user's day:
//   a 01:00 event on the 5th is on the 5th).

import { minutesOf, type ClockTime } from '../reminders';
import {
  addDays,
  daysBetween,
  startOfWeek,
  wallClock,
  weekdayOf,
  zonedTime,
  type DateString,
} from '../time';

// --- Tentative dates -------------------------------------------------------------------------

export const DATE_PRECISIONS = ['day', 'month', 'tbd'] as const;
export type DatePrecision = (typeof DATE_PRECISIONS)[number];

/** The first day of `day`'s month: how a month-precision date is stored. */
export const monthStart = (day: DateString): DateString => `${day.slice(0, 7)}-01`;

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The last day of `day`'s month. */
export function monthEnd(day: DateString): DateString {
  const [y, m] = day.split('-').map(Number) as [number, number];
  return `${day.slice(0, 7)}-${String(daysInMonth(y, m)).padStart(2, '0')}`;
}

/** The day something tentative is due by: a month-precision date is due at the month's end. */
export function deadlineOf(date: DateString | null, precision: DatePrecision): DateString | null {
  if (!date || precision === 'tbd') return null;
  return precision === 'month' ? monthEnd(date) : date;
}

/** Whole months from `today`'s month to `day`'s (negative when earlier). */
export function monthsBetween(today: DateString, day: DateString): number {
  const [ty, tm] = today.split('-').map(Number) as [number, number];
  const [y, m] = day.split('-').map(Number) as [number, number];
  return (y - ty) * 12 + (m - tm);
}

// --- Repeats ---------------------------------------------------------------------------------

export const REPEAT_UNITS = ['day', 'week', 'month', 'year'] as const;
export type RepeatUnit = (typeof REPEAT_UNITS)[number];

export interface Repeat {
  every: RepeatUnit;
  /** Every 1, 2, 3… units. */
  interval: number;
  /** Weekly repeats: 0 = Sunday … 6 = Saturday, at least one. */
  weekdays?: number[];
  /** The last day it may happen on (included); null or absent: forever. */
  until?: DateString | null;
}

export const REPEAT_LIMITS = { interval: { min: 1, max: 30 } } as const;

/** What's wrong with a repeat starting on `start`, or null. */
export function repeatProblem(r: Repeat, start: DateString): string | null {
  const { min, max } = REPEAT_LIMITS.interval;
  if (!Number.isInteger(r.interval) || r.interval < min || r.interval > max) {
    return `Repeat every ${min} to ${max}.`;
  }
  if (r.every === 'week') {
    if (!r.weekdays?.length) return 'Pick at least one day of the week.';
    if (r.weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6))
      return 'Pick real weekdays.';
  } else if (r.weekdays?.length) {
    return 'Weekdays only go with a weekly repeat.';
  }
  if (r.until && r.until < start) return '“Until” can’t be before the first day.';
  return null;
}

/** Weekdays sorted and unique; dropped for anything but weekly. */
export function normalizeRepeat(r: Repeat): Repeat {
  const out: Repeat = { every: r.every, interval: r.interval, until: r.until ?? null };
  if (r.every === 'week') out.weekdays = [...new Set(r.weekdays ?? [])].sort((a, b) => a - b);
  return out;
}

function ymd(day: DateString) {
  return day.split('-').map(Number) as [number, number, number];
}

const dayOf = (y: number, m: number, d: number): DateString =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/**
 * The days an event happens on in [`from`, `to`] (both included), in order. Without a repeat,
 * its date if it's in range.
 */
export function occurrences(
  start: DateString,
  repeat: Repeat | null | undefined,
  from: DateString,
  to: DateString,
): DateString[] {
  if (!repeat) return start >= from && start <= to ? [start] : [];
  const end = repeat.until && repeat.until < to ? repeat.until : to;
  if (end < from || start > end) return [];
  const out: DateString[] = [];
  const n = repeat.interval;

  if (repeat.every === 'day') {
    const skip = Math.max(0, Math.ceil(daysBetween(start, from) / n));
    for (let d = addDays(start, skip * n); d <= end; d = addDays(d, n)) out.push(d);
  } else if (repeat.every === 'week') {
    const anchor = startOfWeek(start, 1);
    const days = new Set(repeat.weekdays ?? [weekdayOf(start)]);
    for (let d = from > start ? from : start; d <= end; d = addDays(d, 1)) {
      const week = Math.floor(daysBetween(anchor, d) / 7);
      if (week % n === 0 && days.has(weekdayOf(d))) out.push(d);
    }
  } else {
    const [y0, m0, d0] = ymd(start);
    const step = repeat.every === 'month' ? n : n * 12;
    const [fy, fm] = ymd(from);
    // Skip whole periods before `from`.
    const behind = (fy - y0) * 12 + (fm - m0);
    for (let k = Math.max(0, Math.floor(behind / step) - 1); ; k++) {
      const months = m0 - 1 + k * step;
      const y = y0 + Math.floor(months / 12);
      const m = (months % 12) + 1;
      const d = dayOf(y, m, Math.min(d0, daysInMonth(y, m)));
      if (d > end) break;
      if (d >= from) out.push(d);
    }
  }
  return out;
}

/** The first day at or after `today` the event happens on, or null when it's over. */
export function nextOccurrence(
  start: DateString,
  repeat: Repeat | null | undefined,
  today: DateString,
): DateString | null {
  if (!repeat) return start >= today ? start : null;
  const from = start > today ? start : today;
  const span = { day: 1, week: 7, month: 31, year: 366 }[repeat.every] * repeat.interval;
  return occurrences(start, repeat, from, addDays(from, span))[0] ?? null;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${s}`;
};

const list = (words: string[]) =>
  words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;

/** "Every week on Mon and Wed", "Every 2 days", "Every month on the 5th", "…, until Dec 20". */
export function describeRepeat(r: Repeat | null | undefined, start: DateString): string {
  if (!r) return 'Doesn’t repeat';
  const [, m, d] = ymd(start);
  const unit = r.interval === 1 ? `every ${r.every}` : `every ${r.interval} ${r.every}s`;
  let text = unit.charAt(0).toUpperCase() + unit.slice(1);
  if (r.every === 'week') {
    const days = r.weekdays ?? [weekdayOf(start)];
    text += days.length === 7 ? ', every day' : ` on ${list(days.map((w) => WEEKDAYS[w]!))}`;
  }
  if (r.every === 'month') text += ` on the ${ordinal(d)}`;
  if (r.every === 'year') text += ` on ${MONTHS[m - 1]} ${d}`;
  if (r.until) {
    const [uy, um, ud] = ymd(r.until);
    text += `, until ${MONTHS[um - 1]} ${ud}, ${uy}`;
  }
  return text;
}

// --- Times -----------------------------------------------------------------------------------

export const EVENT_LIMITS = { durationMinutes: { min: 5, max: 24 * 60 } } as const;
export const DEFAULT_EVENT_DURATION = 60;

/** "19:00–20:30" (wraps past midnight: "23:00–00:30"). */
export function timeRange(start: ClockTime, durationMinutes: number | null): string {
  if (!durationMinutes) return start;
  const end = (minutesOf(start) + durationMinutes) % 1440;
  const h = String(Math.floor(end / 60)).padStart(2, '0');
  const m = String(end % 60).padStart(2, '0');
  return `${start}–${h}:${m}`;
}

/** The instant a day event starts (all-day ones: midnight), in `timeZone`. */
export function eventStartAt(day: DateString, startTime: ClockTime | null, timeZone: string): Date {
  const m = startTime ? minutesOf(startTime) : 0;
  return zonedTime(day, Math.floor(m / 60), timeZone, m % 60);
}

// --- Event reminders -------------------------------------------------------------------------

/** All-day events remind at this time (on the day, or days before). */
export const ALL_DAY_REMINDER_TIME: ClockTime = '09:00';

/** What the reminder control offers, in minutes before. */
export const EVENT_REMINDER_CHOICES = {
  timed: [0, 5, 10, 15, 30, 60, 120, 1440],
  allDay: [0, 1440, 2 * 1440, 7 * 1440],
} as const;
export const EVENT_REMINDER_MAX = 28 * 1440;

/** How late a missed event reminder may still go out (the server was off at the time). */
export const EVENT_REMINDER_GRACE_MS = 30 * 60_000;

/** When an event on `day` reminds, `minutesBefore` its start (all-day: before 09:00 that day). */
export function eventReminderAt(
  day: DateString,
  startTime: ClockTime | null,
  minutesBefore: number,
  timeZone: string,
): Date {
  const m = minutesOf(startTime ?? ALL_DAY_REMINDER_TIME);
  const anchor = zonedTime(day, Math.floor(m / 60), timeZone, m % 60);
  return new Date(anchor.getTime() - minutesBefore * 60_000);
}

export interface RemindableEvent {
  date: DateString | null;
  precision: DatePrecision;
  startTime: ClockTime | null;
  repeat: Repeat | null;
  reminderMinutes: number | null;
}

/**
 * The reminder an event owes at `now`, or null: the latest occurrence whose reminder time has come
 * within the grace. A timed event's reminder is never sent once it has started (except "at start").
 */
export function eventReminderDue(
  e: RemindableEvent,
  now: Date,
  timeZone: string,
): { at: Date; day: DateString } | null {
  if (e.reminderMinutes === null || !e.date || e.precision !== 'day') return null;
  const today = wallClock(now, timeZone).date;
  const ahead = Math.ceil(e.reminderMinutes / 1440) + 1;
  let best: { at: Date; day: DateString } | null = null;
  for (const day of occurrences(e.date, e.repeat, addDays(today, -1), addDays(today, ahead))) {
    const at = eventReminderAt(day, e.startTime, e.reminderMinutes, timeZone);
    if (at > now || now.getTime() - at.getTime() > EVENT_REMINDER_GRACE_MS) continue;
    if (e.startTime && e.reminderMinutes > 0 && now >= eventStartAt(day, e.startTime, timeZone)) {
      continue;
    }
    if (!best || at > best.at) best = { at, day };
  }
  return best;
}

/** "15 min before", "At start", "1 day before" · all-day: "On the day at 09:00", "2 days before". */
export function describeEventReminder(minutes: number | null, allDay: boolean): string {
  if (minutes === null) return 'No reminder';
  if (allDay) {
    if (minutes === 0) return `On the day at ${ALL_DAY_REMINDER_TIME}`;
    const days = minutes / 1440;
    if (Number.isInteger(days)) {
      if (days === 7) return `A week before at ${ALL_DAY_REMINDER_TIME}`;
      return `${days === 1 ? 'The day' : `${days} days`} before at ${ALL_DAY_REMINDER_TIME}`;
    }
  }
  if (minutes === 0) return 'At start';
  if (minutes % 1440 === 0) {
    const d = minutes / 1440;
    return `${d} day${d === 1 ? '' : 's'} before`;
  }
  if (minutes % 60 === 0) return `${minutes / 60} h before`;
  return `${minutes} min before`;
}

// --- Day load --------------------------------------------------------------------------------

/** How much a task weighs on a day, by effort (unsized tasks count as small). */
export const EFFORT_POINTS = { S: 1, M: 2, L: 3 } as const;

export type DayLoadLevel = 'free' | 'light' | 'busy' | 'full';

export interface DayLoad {
  tasks: number;
  eventMinutes: number;
  /** Task points plus an hour of events per point. */
  points: number;
  level: DayLoadLevel;
}

/** How much is planned on a day (D32): its open tasks by effort, and its timed events. */
export function dayLoad(
  tasks: readonly { effort: keyof typeof EFFORT_POINTS | null }[],
  eventMinutes: number,
): DayLoad {
  const points =
    tasks.reduce((sum, t) => sum + (t.effort ? EFFORT_POINTS[t.effort] : 1), 0) +
    Math.round((eventMinutes / 60) * 2) / 2;
  const level: DayLoadLevel =
    points === 0 ? 'free' : points <= 3 ? 'light' : points <= 6 ? 'busy' : 'full';
  return { tasks: tasks.length, eventMinutes, points, level };
}
