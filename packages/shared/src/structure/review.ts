// The weekly review (D45): which week it looks at, and when Today offers it. Offered from the
// week's last day until it's done, or until two days into the next week (then it reviews the week
// that ended). Started on another day, it reviews the week so far.

import { addDays, daysBetween, startOfWeek, type DateString } from '../time';

/** Days into the next week the review of the past one is still offered. */
export const REVIEW_GRACE_DAYS = 2;

/** The week (its first day) a review started on `today` looks at. */
export function reviewWeekOf(today: DateString, weekStart: number): DateString {
  const start = startOfWeek(today, weekStart);
  return daysBetween(start, today) < REVIEW_GRACE_DAYS ? addDays(start, -7) : start;
}

/** Whether Today offers the review of `week` (unless it's done): its last day, or the grace days. */
export function reviewOffered(today: DateString, weekStart: number): boolean {
  const day = daysBetween(startOfWeek(today, weekStart), today);
  return day === 6 || day < REVIEW_GRACE_DAYS;
}
