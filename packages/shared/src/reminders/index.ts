// Reminders (D31, D32, D38): when a commitment's reminder fires during the user's day, and the
// small pieces the server's reminder job and the web app's reminder control share.
//
// - A commitment reminder is off (null), `once` at a time, or `repeat` from a time every N minutes
//   until a time. Times are wall-clock `HH:MM` in the user's time zone, read inside the user's
//   day: with a day start of 4, 01:00 is the night after (D17). Nothing fires past the day's end.
// - The job runs every minute and sends the latest slot that is due, once (the server keeps what it
//   sent). A slot missed by more than the grace (the server was off) is skipped, not sent late.
// - Snooze pushes the next reminder an hour out; slots in that hour are skipped.

import { addDays, userDayRange, zonedTime, type DateString, type DaySettings } from '../time';

/** A time on the clock, `HH:MM` (24 h). */
export type ClockTime = string;
export const CLOCK_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const isClockTime = (s: unknown): s is ClockTime =>
  typeof s === 'string' && CLOCK_RE.test(s);

/** Minutes since midnight. */
export function minutesOf(t: ClockTime): number {
  if (!isClockTime(t)) throw new RangeError(`not an HH:MM time: ${JSON.stringify(t)}`);
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
}

export function clockOf(minutes: number): ClockTime {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export type CommitmentReminder =
  | { kind: 'once'; at: ClockTime }
  | { kind: 'repeat'; from: ClockTime; everyMinutes: number; until: ClockTime };

export const REMINDER_LIMITS = { everyMinutes: { min: 15, max: 720 } } as const;

/** The "every" choices the control offers. */
export const REPEAT_CHOICES = [30, 60, 120, 180, 240, 360] as const;

/** Snooze, from a notification or the app. */
export const SNOOZE_MINUTES = 60;

/** How late a missed reminder may still go out (the server was off at the time). */
export const REMINDER_GRACE_MS = {
  commitment: 60 * 60_000,
  task: 12 * 60 * 60_000,
  focus: 10 * 60_000,
  streak: 60 * 60_000,
} as const;

/** The common case the control starts from (the use case's Duolingo). */
export const DEFAULT_REPEAT: CommitmentReminder = {
  kind: 'repeat',
  from: '10:00',
  everyMinutes: 180,
  until: '22:00',
};

/** What's wrong with a reminder, or null. */
export function reminderProblem(r: CommitmentReminder): string | null {
  if (r.kind === 'once') return isClockTime(r.at) ? null : 'Pick a time.';
  if (!isClockTime(r.from) || !isClockTime(r.until)) return 'Pick the times.';
  const { min, max } = REMINDER_LIMITS.everyMinutes;
  if (!Number.isInteger(r.everyMinutes) || r.everyMinutes < min || r.everyMinutes > max) {
    return `Repeat every ${min} minutes to 12 hours.`;
  }
  if (minutesOf(r.until) <= minutesOf(r.from)) return '“Until” has to be later than “from”.';
  return null;
}

/** The clock times a reminder fires at, in order. */
export function reminderTimes(r: CommitmentReminder): ClockTime[] {
  if (r.kind === 'once') return [r.at];
  const out: ClockTime[] = [];
  const end = minutesOf(r.until);
  for (let m = minutesOf(r.from); m <= end; m += r.everyMinutes) out.push(clockOf(m));
  return out;
}

/**
 * The instant `time` falls on in the user's `day`: on that date, or the next one for a time before
 * the day-start hour (01:00 with a day start of 4 is still that day's night).
 */
export function clockInstant(day: DateString, time: ClockTime, s: DaySettings): Date {
  const m = minutesOf(time);
  const date = m < s.dayStartHour * 60 ? addDays(day, 1) : day;
  return zonedTime(date, Math.floor(m / 60), s.timeZone, m % 60);
}

/** When a reminder fires during the user's `day`, in order, never past the day's end. */
export function reminderSlots(r: CommitmentReminder, day: DateString, s: DaySettings): Date[] {
  const { start, end } = userDayRange(day, s);
  return reminderTimes(r)
    .map((t) => clockInstant(day, t, s))
    .filter((at) => at >= start && at < end)
    .sort((a, b) => a.getTime() - b.getTime());
}

/** The latest of `slots` at or before `now`, if it isn't older than `graceMs`. */
export function latestDue(slots: readonly Date[], now: Date, graceMs: number): Date | null {
  let best: Date | null = null;
  for (const at of slots) {
    if (at <= now && now.getTime() - at.getTime() <= graceMs && (!best || at > best)) best = at;
  }
  return best;
}

/**
 * The reminder a commitment owes at `now` on the user's `day`, or null. `remindAgainAt` is a
 * snooze: nothing before it, then one reminder at it; the slots it covered are skipped.
 */
export function commitmentReminderDue(
  c: { reminder: CommitmentReminder | null; remindAgainAt: Date | null },
  day: DateString,
  s: DaySettings,
  now: Date,
): Date | null {
  if (!c.reminder) return null;
  const snooze = c.remindAgainAt;
  if (snooze && snooze > now) return null;
  const { start, end } = userDayRange(day, s);
  const slots = reminderSlots(c.reminder, day, s).filter(
    (at) => !snooze || at > snooze || at.getTime() <= snooze.getTime() - SNOOZE_MINUTES * 60_000,
  );
  if (snooze && snooze >= start && snooze < end) slots.push(snooze);
  return latestDue(slots, now, REMINDER_GRACE_MS.commitment);
}

/** "3 h", "30 min", "1 h 30 min". */
export function formatEvery(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** "At 10:00" / "10:00–22:00, every 3 h". */
export function describeReminder(r: CommitmentReminder | null): string {
  if (!r) return 'No reminder';
  if (r.kind === 'once') return `At ${r.at}`;
  return `${r.from}–${r.until}, every ${formatEvery(r.everyMinutes)}`;
}

// --- Notification settings -------------------------------------------------------------------

export interface NotificationSettings {
  /** A push when a focus session's planned time is up (the tab may be closed). */
  focusEnded: boolean;
  /** Opt-in evening nudge when the streak is alive and today isn't active yet; null is off. */
  streakNudgeAt: ClockTime | null;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  focusEnded: true,
  streakNudgeAt: null,
};
