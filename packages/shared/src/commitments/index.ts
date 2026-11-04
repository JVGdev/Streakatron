// Commitments (D31): routines that are never "done", set up however the user wants. Measured as
// done / not done (`check`), an amount with their own unit (`count`) or `minutes`; per `day` or per
// `week`; a day commitment runs every day or on chosen weekdays. "3 times a week" is a week
// commitment measured as `check` with target 3: days with a check count.
//
// Entries are summed per day (`DayTotals`); a check is one entry a day. The rules here say what is
// due today, whether a period is met, and each commitment's own streak. Shared, so the server
// (what counts, D17) and the web app (what Today shows while a write is in flight) agree.

import { addDays, eachDay, startOfWeek, weekdayOf, type DateString } from '../time';

export const COMMITMENT_MEASURES = ['check', 'count', 'minutes'] as const;
export type CommitmentMeasure = (typeof COMMITMENT_MEASURES)[number];

export const COMMITMENT_PERIODS = ['day', 'week'] as const;
export type CommitmentPeriod = (typeof COMMITMENT_PERIODS)[number];

/** Where an entry came from: typed or ticked by hand, or a focus session on the commitment. */
export const ENTRY_SOURCES = ['manual', 'focus'] as const;
export type EntrySource = (typeof ENTRY_SOURCES)[number];

/** A day commitment's weekdays (0 = Sunday … 6 = Saturday); none stored means every day. */
export interface CommitmentSchedule {
  days: number[];
}

export const COMMITMENT_LIMITS = {
  /** Count targets and one entry's amount. */
  count: { min: 1, max: 10_000 },
  /** Minutes targets: a day's, a week's; one entry is at most a day. */
  minutes: { day: 1440, week: 10_080, entry: 1440 },
  /** "N times a week". */
  weekChecks: { min: 1, max: 7 },
  unitLength: 30,
} as const;

export interface CommitmentRules {
  measure: CommitmentMeasure;
  target: number;
  period: CommitmentPeriod;
  schedule: CommitmentSchedule | null;
}

/** What's wrong with a commitment's shape, or null. The server checks it on every write. */
export function commitmentShapeProblem(c: CommitmentRules & { unit?: string | null }) {
  if (!Number.isInteger(c.target) || c.target < 1)
    return 'The target must be a whole number, 1 or more.';
  if (c.measure === 'check') {
    if (c.period === 'day' && c.target !== 1) return 'A daily check has a target of 1.';
    if (c.period === 'week' && c.target > COMMITMENT_LIMITS.weekChecks.max)
      return 'At most 7 times a week.';
  }
  if (c.measure === 'count' && c.target > COMMITMENT_LIMITS.count.max)
    return 'That target is too big.';
  if (c.measure === 'minutes' && c.target > COMMITMENT_LIMITS.minutes[c.period])
    return c.period === 'day' ? 'A day has 1440 minutes.' : 'A week has 10080 minutes.';
  if (c.unit && c.measure !== 'count') return 'Only an amount has a unit.';
  if (c.schedule) {
    if (c.period === 'week') return 'A weekly commitment has no weekdays.';
    const days = c.schedule.days;
    if (!days.length) return 'Pick at least one day.';
    if (
      days.some((d) => !Number.isInteger(d) || d < 0 || d > 6) ||
      new Set(days).size !== days.length
    )
      return 'Weekdays are 0 (Sunday) to 6 (Saturday), each once.';
  }
  return null;
}

/** The stored form of a schedule: sorted, and null for every day (or for a week commitment). */
export function normalizeSchedule(
  period: CommitmentPeriod,
  schedule: CommitmentSchedule | null | undefined,
): CommitmentSchedule | null {
  if (period === 'week' || !schedule) return null;
  const days = [...new Set(schedule.days)].sort((a, b) => a - b);
  return days.length === 7 ? null : { days };
}

// --- Days and periods ------------------------------------------------------------------------

/** Whether the commitment asks for anything on `day` (a week commitment: every day of the week). */
export function isScheduled(c: Pick<CommitmentRules, 'period' | 'schedule'>, day: DateString) {
  return c.period === 'week' || !c.schedule || c.schedule.days.includes(weekdayOf(day));
}

export interface DayRange {
  start: DateString;
  end: DateString;
}

/** The period `day` falls in: that day, or its week. */
export function periodRange(
  c: Pick<CommitmentRules, 'period'>,
  day: DateString,
  weekStart = 1,
): DayRange {
  if (c.period === 'day') return { start: day, end: day };
  const start = startOfWeek(day, weekStart);
  return { start, end: addDays(start, 6) };
}

/** What was logged on each day: the sum of its entries' amounts (a check counts 1). */
export type DayTotals = ReadonlyMap<DateString, number>;

/**
 * Progress in a period: a week of checks counts the days with one; a daily check is 0 or 1; amounts
 * and minutes add up.
 */
export function progressIn(
  c: Pick<CommitmentRules, 'measure' | 'period'>,
  totals: DayTotals,
  range: DayRange,
): number {
  let sum = 0;
  let days = 0;
  for (const [day, amount] of totals) {
    if (day < range.start || day > range.end || amount <= 0) continue;
    sum += amount;
    days++;
  }
  if (c.measure === 'check') return c.period === 'week' ? days : Math.min(1, days);
  return sum;
}

export const isMet = (c: Pick<CommitmentRules, 'target'>, progress: number) => progress >= c.target;

export interface CommitmentDay {
  /** It asks for something today. */
  scheduled: boolean;
  /** Scheduled, not met yet, and still loggable today (a weekly check takes one a day). */
  due: boolean;
  met: boolean;
  /** Progress in the period today is in, toward `target`. */
  progress: number;
  target: number;
  /** Logged today alone. */
  today: number;
  period: DayRange;
}

/** Where a commitment stands on `today`. */
export function commitmentDay(
  c: CommitmentRules,
  totals: DayTotals,
  today: DateString,
  weekStart = 1,
): CommitmentDay {
  const period = periodRange(c, today, weekStart);
  const progress = progressIn(c, totals, period);
  const met = isMet(c, progress);
  const loggedToday = totals.get(today) ?? 0;
  const scheduled = isScheduled(c, today);
  const doneForToday = c.measure === 'check' && loggedToday > 0;
  return {
    scheduled,
    due: scheduled && !met && !doneForToday,
    met,
    progress,
    target: c.target,
    today: loggedToday,
    period,
  };
}

// --- Streaks ---------------------------------------------------------------------------------

export interface CommitmentStreak {
  /** Scheduled days (or weeks) met in a row; the current one adds once it's met. */
  current: number;
  longest: number;
  unit: 'day' | 'week';
}

/**
 * A commitment's own streak, counted from `since` (the day it was made) to `today`:
 * - per day: consecutive scheduled days met; unscheduled days don't break it;
 * - per week: consecutive weeks met.
 * Today (this week) never breaks it: it's still in progress. No freezes (D31).
 */
export function commitmentStreak(
  c: CommitmentRules,
  totals: DayTotals,
  today: DateString,
  since: DateString,
  weekStart = 1,
): CommitmentStreak {
  const first = [since, ...totals.keys()].filter((d) => d <= today).sort()[0] ?? today;
  let current = 0;
  let longest = 0;
  if (c.period === 'day') {
    for (const day of eachDay(first, today)) {
      if (!isScheduled(c, day)) continue;
      if (isMet(c, progressIn(c, totals, { start: day, end: day }))) {
        current++;
        longest = Math.max(longest, current);
      } else if (day !== today) {
        current = 0;
      }
    }
    return { current, longest, unit: 'day' };
  }
  const thisWeek = startOfWeek(today, weekStart);
  for (let week = startOfWeek(first, weekStart); week <= thisWeek; week = addDays(week, 7)) {
    if (isMet(c, progressIn(c, totals, { start: week, end: addDays(week, 6) }))) {
      current++;
      longest = Math.max(longest, current);
    } else if (week !== thisWeek) {
      current = 0;
    }
  }
  return { current, longest, unit: 'week' };
}

/**
 * The last `n` days, oldest first, each scheduled or not and met or not (the sheet's history).
 * Days before `since` (when it was made) asked for nothing.
 */
export function recentDays(
  c: CommitmentRules,
  totals: DayTotals,
  today: DateString,
  n: number,
  since: DateString = addDays(today, -(n - 1)),
) {
  return eachDay(addDays(today, -(n - 1)), today).map((day) => ({
    day,
    scheduled: day >= since && isScheduled(c, day),
    amount: totals.get(day) ?? 0,
    met:
      c.period === 'day'
        ? isMet(c, progressIn(c, totals, { start: day, end: day }))
        : (totals.get(day) ?? 0) > 0,
  }));
}

// --- Words -----------------------------------------------------------------------------------

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function weekdaysText(days: readonly number[], weekStart = 1): string {
  const sorted = [...days].sort((a, b) => ((a - weekStart + 7) % 7) - ((b - weekStart + 7) % 7));
  if (sorted.length === 5 && !sorted.includes(0) && !sorted.includes(6)) return 'weekdays';
  if (sorted.length === 2 && sorted.includes(0) && sorted.includes(6)) return 'weekends';
  return sorted.map((d) => WEEKDAY_SHORT[d]).join(', ');
}

const minutesText = (m: number) => {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
};

/** An amount in the commitment's own terms: "20 cards", "15 min", "1 time". */
export function amountText(c: { measure: CommitmentMeasure; unit?: string | null }, n: number) {
  if (c.measure === 'minutes') return minutesText(n);
  if (c.measure === 'count') return c.unit ? `${n} ${c.unit}` : String(n);
  return n === 1 ? 'once' : `${n} times`;
}

/** What it asks, in a few words: "Every day", "20 cards a day · weekdays", "3 times a week". */
export function targetText(c: CommitmentRules & { unit?: string | null }, weekStart = 1): string {
  const when = c.schedule ? ` · ${weekdaysText(c.schedule.days, weekStart)}` : '';
  if (c.measure === 'check') {
    if (c.period === 'week') return c.target === 1 ? 'Once a week' : `${c.target} times a week`;
    return c.schedule ? `On ${weekdaysText(c.schedule.days, weekStart)}` : 'Every day';
  }
  return `${amountText(c, c.target)} a ${c.period}${when}`;
}

/** Progress toward the target, in a few words: "12/20 cards", "1/3 this week", "10/15 min". */
export function progressText(
  c: CommitmentRules & { unit?: string | null },
  progress: number,
): string {
  if (c.measure === 'check') {
    return c.period === 'week'
      ? `${progress}/${c.target} this week`
      : progress
        ? 'Done'
        : 'Not yet';
  }
  const tail = c.period === 'week' ? ' this week' : '';
  if (c.measure === 'minutes') return `${progress}/${minutesText(c.target)}${tail}`;
  return `${progress}/${c.target}${c.unit ? ` ${c.unit}` : ''}${tail}`;
}
