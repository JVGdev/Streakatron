// The calendar page's arithmetic (D39): which days a month or week view shows, and what goes on
// each day — events (all day first, then by time), open tasks on their scheduled and due days, and
// the day's load (open tasks by effort plus timed events).

import { dayLoad, type DayLoad } from '@streakatron/shared/calendar';
import { addDays, eachDay, startOfWeek } from '@streakatron/shared/time';

/** The weeks a month view shows: whole weeks from the one with the 1st to the one with the last. */
export function monthGrid(anchor: string, weekStart: number) {
  const first = `${anchor.slice(0, 7)}-01`;
  const [y, m] = first.split('-').map(Number) as [number, number];
  const last = `${anchor.slice(0, 7)}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
  const from = startOfWeek(first, weekStart);
  const to = addDays(startOfWeek(last, weekStart), 6);
  const days = eachDay(from, to);
  const weeks: string[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return { from, to, weeks };
}

export function weekDays(anchor: string, weekStart: number) {
  const from = startOfWeek(anchor, weekStart);
  return { from, to: addDays(from, 6), days: eachDay(from, addDays(from, 6)) };
}

export interface PlacedTask<T> {
  task: T;
  /** Its scheduled day (or a "follow up" for waiting tasks). */
  planned: boolean;
  /** Its due day. */
  due: boolean;
}

/** Open tasks on the days of their scheduled and due dates (one entry when they're the same day). */
export function placeTasks<T extends { dueDate: string | null; scheduledDate: string | null }>(
  tasks: readonly T[],
  from: string,
  to: string,
): Map<string, PlacedTask<T>[]> {
  const out = new Map<string, PlacedTask<T>[]>();
  const put = (day: string, p: PlacedTask<T>) => {
    if (day < from || day > to) return;
    out.set(day, [...(out.get(day) ?? []), p]);
  };
  for (const task of tasks) {
    const s = task.scheduledDate;
    const d = task.dueDate;
    if (s && s === d) put(s, { task, planned: true, due: true });
    else {
      if (s) put(s, { task, planned: true, due: false });
      if (d) put(d, { task, planned: false, due: true });
    }
  }
  return out;
}

interface Timed {
  startTime: string | null;
  durationMinutes: number | null;
  days: string[];
}

/** Events by day: all day first, then by start time. */
export function placeEvents<E extends Timed>(events: readonly E[]): Map<string, E[]> {
  const out = new Map<string, E[]>();
  for (const e of events) for (const d of e.days) out.set(d, [...(out.get(d) ?? []), e]);
  for (const list of out.values()) {
    list.sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
  }
  return out;
}

/** A day's load: open tasks planned that day (their scheduled day, else their due day). */
export function loadOf(
  tasks: readonly PlacedTask<{ effort: 'S' | 'M' | 'L' | null; scheduledDate: string | null }>[],
  events: readonly Timed[],
): DayLoad {
  const planned = tasks
    .filter((p) => p.planned || !p.task.scheduledDate)
    .map((p) => ({ effort: p.task.effort }));
  const minutes = events.reduce((sum, e) => sum + (e.startTime ? (e.durationMinutes ?? 0) : 0), 0);
  return dayLoad(planned, minutes);
}
