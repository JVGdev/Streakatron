// Time goals (D31; "commitment goals" before): focus minutes on a project per week or month, counted
// from focus sessions on the project or on its commitments. Progress and pace for the goals panel.

import { addDays, daysBetween, startOfWeek, type DateString } from '../time';
import type { GoalPeriod } from './index';

/** The week or month `today` is in, as the user counts weeks. */
export function goalPeriodRange(period: GoalPeriod, today: DateString, weekStart = 1) {
  if (period === 'week') {
    const start = startOfWeek(today, weekStart);
    return { start, end: addDays(start, 6) };
  }
  const start = `${today.slice(0, 7)}-01`;
  const [y, m] = today.split('-').map(Number) as [number, number];
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return { start, end: addDays(next, -1) };
}

export interface TimeGoalProgress {
  start: DateString;
  end: DateString;
  minutes: number;
  target: number;
  met: boolean;
  /** Days left in the period, today included. */
  daysLeft: number;
  /** Minutes a day still needed to make it (0 once met). */
  perDay: number;
}

/** Where a time goal stands: `minutes` focused in its period so far. */
export function timeGoalProgress(
  goal: { targetMinutes: number; period: GoalPeriod },
  minutes: number,
  today: DateString,
  weekStart = 1,
): TimeGoalProgress {
  const { start, end } = goalPeriodRange(goal.period, today, weekStart);
  const daysLeft = daysBetween(today, end) + 1;
  const remaining = Math.max(0, goal.targetMinutes - minutes);
  return {
    start,
    end,
    minutes,
    target: goal.targetMinutes,
    met: remaining === 0,
    daysLeft,
    perDay: remaining === 0 ? 0 : Math.ceil(remaining / daysLeft),
  };
}
