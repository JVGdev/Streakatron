// The contribution heatmap's shape (plan.md §4.7): weeks as columns from the user's week start, and
// a level per day. Active days are level 1 and up, darker with more focus.

import { addDays, eachDay, startOfWeek, type DateString } from '@streakatron/shared/time';

export interface HeatDay {
  date: string;
  xp: number;
  tasks: number;
  minutes: number;
  active: boolean;
}

/** 0: not active · 1: active, no focus · 2: under 30 min · 3: under 90 · 4: 90 min or more. */
export function heatLevel(day: HeatDay | undefined): 0 | 1 | 2 | 3 | 4 {
  if (!day?.active) return 0;
  if (day.minutes >= 90) return 4;
  if (day.minutes >= 30) return 3;
  if (day.minutes > 0) return 2;
  return 1;
}

export const HEAT_LEVEL_LABEL = [
  'Not active',
  'Active, no focus',
  'Under 30 min of focus',
  '30–89 min of focus',
  '90+ min of focus',
] as const;

/**
 * Columns of 7 days (null before `from` and after `to`), the first starting on the week start
 * of `from`.
 */
export function heatWeeks(
  from: DateString,
  to: DateString,
  weekStart: number,
): (DateString | null)[][] {
  const weeks: (DateString | null)[][] = [];
  for (let w = startOfWeek(from, weekStart); w <= to; w = addDays(w, 7)) {
    weeks.push(eachDay(w, addDays(w, 6)).map((d) => (d < from || d > to ? null : d)));
  }
  return weeks;
}
