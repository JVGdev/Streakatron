// Number goals (D45): a target with a unit ("40 lessons"), reached by a number typed in and,
// optionally, a commitment feeding it. With a deadline: the pace still needed, and whether it's
// behind a straight line from the goal's start to its deadline.

import { monthEnd } from '../calendar';
import { daysBetween, type DateString } from '../time';

export const NUMBER_GOAL_LIMITS = {
  target: { min: 1, max: 1_000_000 },
  unitLength: 30,
} as const;

/** Up to two weeks left the pace is a day's; further out, a week's. */
const DAILY_PACE_DAYS = 14;

export interface NumberGoalProgress {
  /** Where it stands: typed in + fed by its commitment. */
  current: number;
  /** The part its commitment fed. */
  fed: number;
  target: number;
  met: boolean;
  /** Days left until the deadline, today included (null: no deadline; 0: past it). */
  daysLeft: number | null;
  late: boolean;
  /** What's still needed each day or week to make it by the deadline (null: no deadline or met). */
  pace: { per: 'day' | 'week'; amount: number } | null;
  /** How far behind a straight line from the start to the deadline (0: on pace or ahead). */
  behind: number;
}

export interface NumberGoalLike {
  targetCount: number;
  dueDate: DateString | null;
  duePrecision: 'day' | 'month';
}

/** A number goal's progress on `today`; `start` is the day it was set up. */
export function numberGoalProgress(
  goal: NumberGoalLike,
  typed: number,
  fed: number,
  start: DateString,
  today: DateString,
): NumberGoalProgress {
  const current = Math.max(0, typed + fed);
  const target = goal.targetCount;
  const remaining = Math.max(0, target - current);
  const met = remaining === 0;
  const end = goal.dueDate
    ? goal.duePrecision === 'month'
      ? monthEnd(goal.dueDate)
      : goal.dueDate
    : null;
  if (!end) {
    return { current, fed, target, met, daysLeft: null, late: false, pace: null, behind: 0 };
  }
  const late = end < today;
  const daysLeft = late ? 0 : daysBetween(today, end) + 1;
  let pace: NumberGoalProgress['pace'] = null;
  if (!met && !late) {
    pace =
      daysLeft <= DAILY_PACE_DAYS
        ? { per: 'day', amount: Math.ceil(remaining / daysLeft) }
        : { per: 'week', amount: Math.ceil(remaining / (daysLeft / 7)) };
  }
  // The straight line: nothing on the start day, the target on the deadline.
  const total = Math.max(1, daysBetween(start, end));
  const elapsed = Math.min(total, Math.max(0, daysBetween(start, today)));
  const expected = Math.floor((target * elapsed) / total);
  const behind = met ? 0 : Math.max(0, expected - current);
  return { current, fed, target, met, daysLeft, late, pace, behind };
}
