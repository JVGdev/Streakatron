// Days, as the user counts them. The one place that answers "which day does this count for".
//
// - A day is a `YYYY-MM-DD` string. Arithmetic on days never goes through a local-time `Date`:
//   days are read at noon UTC, so no offset (up to ±14 h) can push one onto its neighbour
//   (Quire's SH-7).
// - The user's day comes from their stored time zone and day-start hour (D17): with a day start of
//   4, 01:30 on Tuesday still counts for Monday.
// - Weekdays use the JS numbering: 0 = Sunday … 6 = Saturday. Weeks start on Monday (1) by default.

/** A calendar day, `YYYY-MM-DD`. */
export type DateString = string;

export interface DaySettings {
  /** IANA time zone, e.g. `America/Sao_Paulo`. */
  timeZone: string;
  /** Hour (0–23) at which the user's day starts; earlier hours count for the day before. */
  dayStartHour: number;
}

const DAY_MS = 86_400_000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Whether `s` is a real calendar day written as `YYYY-MM-DD` (rejects `2026-02-30`). */
export function isDateString(s: unknown): s is DateString {
  if (typeof s !== 'string') return false;
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const [, y, mo, d] = m.map(Number) as [number, number, number, number];
  const t = new Date(Date.UTC(y, mo - 1, d, 12));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

function assertDate(s: string): void {
  if (!isDateString(s)) throw new RangeError(`not a YYYY-MM-DD day: ${JSON.stringify(s)}`);
}

const noonUtc = (day: DateString) => Date.parse(`${day}T12:00:00Z`);
const fromMs = (ms: number): DateString => new Date(ms).toISOString().slice(0, 10);

/** The day `n` days after `day` (before it, for a negative `n`). */
export function addDays(day: DateString, n: number): DateString {
  assertDate(day);
  return fromMs(noonUtc(day) + n * DAY_MS);
}

/** Whole days from `a` to `b` (`2026-09-28` → `2026-10-02` is 4; negative when `b` is earlier). */
export function daysBetween(a: DateString, b: DateString): number {
  assertDate(a);
  assertDate(b);
  return Math.round((noonUtc(b) - noonUtc(a)) / DAY_MS);
}

/** Every day from `from` to `to`, both included (empty when `to` is before `from`). */
export function eachDay(from: DateString, to: DateString): DateString[] {
  const n = daysBetween(from, to);
  const days: DateString[] = [];
  for (let i = 0; i <= n; i++) days.push(addDays(from, i));
  return days;
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(day: DateString): number {
  assertDate(day);
  return new Date(noonUtc(day)).getUTCDay();
}

/** The first day of the week `day` is in, for weeks starting on `weekStart` (default Monday). */
export function startOfWeek(day: DateString, weekStart = 1): DateString {
  if (!Number.isInteger(weekStart) || weekStart < 0 || weekStart > 6) {
    throw new RangeError(`weekStart must be 0–6, got ${weekStart}`);
  }
  return addDays(day, -((weekdayOf(day) - weekStart + 7) % 7));
}

// --- Time zones ------------------------------------------------------------------------------

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Whether the runtime knows `timeZone` as an IANA zone. */
export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== 'string' || timeZone === '') return false;
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

export interface WallClock {
  date: DateString;
  hour: number;
  minute: number;
  second: number;
}

/** What a clock in `timeZone` shows at `instant`. */
export function wallClock(instant: Date, timeZone: string): WallClock {
  const parts: Record<string, string> = {};
  for (const p of formatter(timeZone).formatToParts(instant)) parts[p.type] = p.value;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Offset of `timeZone` from UTC at `instant`, in ms (São Paulo: −3 h → −10 800 000). */
export function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const w = wallClock(instant, timeZone);
  const [y, mo, d] = w.date.split('-').map(Number) as [number, number, number];
  const asUtc = Date.UTC(y, mo - 1, d, w.hour, w.minute, w.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The instant a clock in `timeZone` shows `day` at `hour`:`minute`. A time skipped by a DST jump
 * resolves to the moment after the jump; a time that happens twice resolves to the first one.
 */
export function zonedTime(day: DateString, hour: number, timeZone: string, minute = 0): Date {
  assertDate(day);
  const [y, mo, d] = day.split('-').map(Number) as [number, number, number];
  const wall = Date.UTC(y, mo - 1, d, hour, minute);
  const first = wall - timeZoneOffsetMs(new Date(wall), timeZone);
  const second = wall - timeZoneOffsetMs(new Date(first), timeZone);
  if (second === first) return new Date(first);
  const third = wall - timeZoneOffsetMs(new Date(second), timeZone);
  // Settles on `second` unless the wall time doesn't exist (DST gap); then take the later instant.
  return new Date(third === second ? second : Math.max(first, second));
}

/** The user's day at `instant`: their wall-clock date, minus one before the day-start hour. */
export function userDay(instant: Date, settings: DaySettings): DateString {
  const w = wallClock(instant, settings.timeZone);
  return w.hour < settings.dayStartHour ? addDays(w.date, -1) : w.date;
}

/** When the user's `day` begins and ends: `[start, end)`. */
export function userDayRange(day: DateString, settings: DaySettings): { start: Date; end: Date } {
  return {
    start: zonedTime(day, settings.dayStartHour, settings.timeZone),
    end: zonedTime(addDays(day, 1), settings.dayStartHour, settings.timeZone),
  };
}
