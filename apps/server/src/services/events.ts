// Calendar events (D39) and the calendar itself: what happens between two days — events with the
// days they fall on, the open tasks' dates come from the task lists, done tasks, and per day the
// focus minutes and commitments met (from the activity log).

import {
  monthStart,
  normalizeRepeat,
  occurrences,
  type Repeat,
} from '@streakatron/shared/calendar';
import { newId } from '@streakatron/shared/ids';
import {
  eventShapeProblem,
  type CalendarQuery,
  type EventCreate,
  type EventPatch,
} from '@streakatron/shared/schemas';
import { and, asc, between, eq, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { activity, events, tasks } from '../db/schema';
import { defined, invalid, notFound, richColumns, type Conn } from './common';
import { writeLinks } from './links';
import { ownedProject } from './projects';
import { selectViews } from './tasks';

type EventRow = typeof events.$inferSelect;

export const eventView = ({ userId: _, deletedAt: __, ...e }: EventRow) => e;
export type EventView = ReturnType<typeof eventView>;

type Shape = Pick<
  EventRow,
  'date' | 'precision' | 'startTime' | 'durationMinutes' | 'repeat' | 'reminderMinutes'
>;

/**
 * The stored form: a month is its first day; a month or TBD has no time, repeat or reminder
 * (switching to one drops them rather than failing); weekdays sorted.
 */
function normalize<T extends Shape>(e: T): T {
  const out = { ...e };
  if (out.precision === 'tbd') out.date = null;
  if (out.precision === 'month' && out.date) out.date = monthStart(out.date);
  if (out.precision !== 'day') {
    Object.assign(out, {
      startTime: null,
      durationMinutes: null,
      repeat: null,
      reminderMinutes: null,
    });
  }
  if (!out.startTime) out.durationMinutes = null;
  if (out.repeat) out.repeat = normalizeRepeat(out.repeat as Repeat);
  return out;
}

function check(e: Shape) {
  const problem = eventShapeProblem(e);
  if (problem) throw invalid('invalid_event', problem);
}

async function ownedEvent(conn: Conn, userId: string, id: string, { deleted = false } = {}) {
  const [row] = await conn
    .select()
    .from(events)
    .where(and(eq(events.id, id), eq(events.userId, userId)));
  if (!row || (row.deletedAt !== null) !== deleted) throw notFound('event');
  return row;
}

export async function createEvent(userId: string, input: EventCreate) {
  return db.transaction(async (tx) => {
    if (input.projectId) await ownedProject(tx, userId, input.projectId);
    const shape = normalize({
      date: input.date ?? null,
      precision: input.precision ?? 'day',
      startTime: input.startTime ?? null,
      durationMinutes: input.durationMinutes ?? null,
      repeat: input.repeat ?? null,
      reminderMinutes: input.reminderMinutes ?? null,
    });
    check(shape);
    const id = newId('event');
    const [row] = await tx
      .insert(events)
      .values({
        id,
        userId,
        projectId: input.projectId ?? null,
        title: input.title,
        ...shape,
        ...richColumns(input.description),
      })
      .returning();
    await writeLinks(tx, userId, id, input.description);
    return eventView(row!);
  });
}

export async function getEvent(userId: string, id: string) {
  return eventView(await ownedEvent(db, userId, id));
}

export async function updateEvent(userId: string, id: string, patch: EventPatch) {
  return db.transaction(async (tx) => {
    const event = await ownedEvent(tx, userId, id);
    if (patch.projectId) await ownedProject(tx, userId, patch.projectId);
    const { description, ...rest } = patch;
    const next = normalize({ ...event, ...defined(rest) });
    check(next);
    const [row] = await tx
      .update(events)
      .set({
        ...defined(rest),
        date: next.date,
        precision: next.precision,
        startTime: next.startTime,
        durationMinutes: next.durationMinutes,
        repeat: next.repeat,
        reminderMinutes: next.reminderMinutes,
        ...richColumns(description),
      })
      .where(eq(events.id, id))
      .returning();
    await writeLinks(tx, userId, id, description);
    return eventView(row!);
  });
}

/** Soft delete (undo, purged after 30 days). */
export async function deleteEvent(userId: string, id: string) {
  await ownedEvent(db, userId, id);
  const deletedAt = new Date();
  await db.update(events).set({ deletedAt }).where(eq(events.id, id));
  return { id, deletedAt };
}

export async function restoreEvent(userId: string, id: string) {
  await ownedEvent(db, userId, id, { deleted: true });
  const [row] = await db
    .update(events)
    .set({ deletedAt: null })
    .where(and(eq(events.id, id), isNotNull(events.deletedAt)))
    .returning();
  return eventView(row!);
}

/** A project's events (its page's "Dates"), dated first. */
export async function listProjectEvents(userId: string, projectId: string) {
  await ownedProject(db, userId, projectId);
  const rows = await db
    .select()
    .from(events)
    .where(
      and(eq(events.userId, userId), eq(events.projectId, projectId), isNull(events.deletedAt)),
    )
    .orderBy(sql`${events.date} asc nulls last`, asc(events.startTime), asc(events.createdAt));
  return rows.map(eventView);
}

/**
 * The calendar from `from` to `to`: day events with the days they fall on in range, months that
 * overlap it, every TBD event; done tasks dated in range (open ones come from the task lists);
 * per day, focus minutes and the commitments met.
 */
export async function getCalendar(userId: string, { from, to }: CalendarQuery) {
  const rows = await db
    .select()
    .from(events)
    .where(
      and(
        eq(events.userId, userId),
        isNull(events.deletedAt),
        or(
          // One-off and repeating day events (repeats end in JS, by `until`).
          and(eq(events.precision, 'day'), lte(events.date, to)),
          and(eq(events.precision, 'month'), between(events.date, monthStart(from), to)),
          eq(events.precision, 'tbd'),
        ),
      ),
    )
    .orderBy(asc(events.startTime), asc(events.createdAt));
  const out = [];
  for (const row of rows) {
    const e = eventView(row);
    if (e.precision === 'day') {
      const days = occurrences(e.date!, e.repeat, from, to);
      if (days.length) out.push({ ...e, days });
    } else out.push({ ...e, days: [] });
  }

  const done = await selectViews(
    db,
    and(
      eq(tasks.userId, userId),
      isNull(tasks.deletedAt),
      isNull(tasks.parentTaskId),
      isNotNull(tasks.completedAt),
      or(between(tasks.dueDate, from, to), between(tasks.scheduledDate, from, to)),
    ),
  );

  const log = await db
    .select({
      date: activity.localDate,
      type: activity.type,
      entityId: activity.entityId,
      minutes: sql<number>`coalesce((${activity.payload}->>'minutes')::int, 0)`,
    })
    .from(activity)
    .where(
      and(
        eq(activity.userId, userId),
        inArray(activity.type, ['focus_completed', 'commitment_met']),
        between(activity.localDate, from, to),
      ),
    );
  const days = new Map<
    string,
    { focusMinutes: number; sessions: number; commitmentsMet: string[] }
  >();
  for (const a of log) {
    const d = days.get(a.date) ?? { focusMinutes: 0, sessions: 0, commitmentsMet: [] };
    if (a.type === 'focus_completed') {
      d.focusMinutes += a.minutes;
      d.sessions++;
    } else if (a.entityId) {
      // Logged under `cmt_…:<period start>`.
      const id = a.entityId.split(':')[0]!;
      if (!d.commitmentsMet.includes(id)) d.commitmentsMet.push(id);
    }
    days.set(a.date, d);
  }

  return {
    events: out,
    doneTasks: done,
    days: Object.fromEntries(days),
  };
}
export type Calendar = Awaited<ReturnType<typeof getCalendar>>;
