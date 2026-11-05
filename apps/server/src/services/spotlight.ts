// Spotlight (D33): up to SPOTLIGHT_MAX tasks, goals and events the user features at the top of
// Today (events and dated goals count down there, D39). A row is spotlighted while `spotlighted_at`
// is set; it shows while the task is open (the goal open, the event not over) and its project
// active, so completing, achieving, dropping, deleting, parking or the day passing takes it off
// without touching the flag (an undo brings it back).

import type { SpotlightInput } from '@streakatron/shared/schemas';
import { monthEnd, nextOccurrence } from '@streakatron/shared/calendar';
import { SPOTLIGHT_MAX } from '@streakatron/shared/structure';
import { isId } from '@streakatron/shared/ids';
import { userDay, type DateString } from '@streakatron/shared/time';
import { and, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { events, goals, projects, tasks, userSettings } from '../db/schema';
import { conflict, invalid, notFound, type Conn } from './common';
import { eventView } from './events';
import { daySettings } from './game';
import { goalViews } from './goals';

export interface SpotlightRef {
  kind: 'task' | 'goal' | 'event';
  id: string;
  title: string;
  spotlightedAt: Date;
}

/** Whether an event still has something to count down to on `today`. */
export function eventAhead(
  e: Pick<typeof events.$inferSelect, 'date' | 'precision' | 'repeat'>,
  today: DateString,
) {
  if (e.precision === 'tbd' || !e.date) return true;
  if (e.precision === 'month') return monthEnd(e.date) >= today;
  return nextOccurrence(e.date, e.repeat, today) !== null;
}

const today = async (conn: Conn, userId: string) =>
  userDay(new Date(), await daySettings(conn, userId));

async function spotlightedEvents(conn: Conn, userId: string) {
  return conn
    .select({ event: events })
    .from(events)
    .leftJoin(projects, eq(projects.id, events.projectId))
    .where(
      and(
        eq(events.userId, userId),
        isNotNull(events.spotlightedAt),
        isNull(events.deletedAt),
        or(isNull(events.projectId), eq(projects.status, 'active')),
      ),
    );
}

/** What shows in the spotlight now, oldest first. */
async function visible(conn: Conn, userId: string): Promise<SpotlightRef[]> {
  const ts = await conn
    .select({ id: tasks.id, title: tasks.title, spotlightedAt: tasks.spotlightedAt })
    .from(tasks)
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .where(
      and(
        eq(tasks.userId, userId),
        isNotNull(tasks.spotlightedAt),
        isNull(tasks.completedAt),
        isNull(tasks.deletedAt),
        or(isNull(tasks.projectId), eq(projects.status, 'active')),
      ),
    );
  const gs = await conn
    .select({ id: goals.id, title: goals.title, spotlightedAt: goals.spotlightedAt })
    .from(goals)
    .innerJoin(projects, eq(projects.id, goals.projectId))
    .where(
      and(
        eq(goals.userId, userId),
        isNotNull(goals.spotlightedAt),
        eq(goals.status, 'open'),
        isNull(goals.deletedAt),
        eq(projects.status, 'active'),
      ),
    );
  const day = await today(conn, userId);
  const es = (await spotlightedEvents(conn, userId))
    .map((r) => r.event)
    .filter((e) => eventAhead(e, day));
  return [
    ...ts.map((t) => ({ kind: 'task' as const, ...t, spotlightedAt: t.spotlightedAt! })),
    ...gs.map((g) => ({ kind: 'goal' as const, ...g, spotlightedAt: g.spotlightedAt! })),
    ...es.map((e) => ({
      kind: 'event' as const,
      id: e.id,
      title: e.title,
      spotlightedAt: e.spotlightedAt!,
    })),
  ].sort((a, b) => a.spotlightedAt.getTime() - b.spotlightedAt.getTime());
}

/**
 * Today's spotlight, oldest first: tasks by id (the web app has them in its task lists), goals in
 * full, with their progress and task counts, and events in full, since Today doesn't load those.
 */
export async function getSpotlight(userId: string) {
  const refs = await visible(db, userId);
  const goalIds = refs.filter((r) => r.kind === 'goal').map((r) => r.id);
  const eventIds = new Set(refs.filter((r) => r.kind === 'event').map((r) => r.id));
  const views = goalIds.length
    ? await goalViews(db, userId, await db.select().from(goals).where(inArray(goals.id, goalIds)))
    : [];
  const counts = goalIds.length
    ? await db
        .select({
          goalId: tasks.goalId,
          open: sql<number>`count(*) filter (where ${tasks.completedAt} is null)::int`,
          done: sql<number>`count(*) filter (where ${tasks.completedAt} is not null)::int`,
        })
        .from(tasks)
        .where(
          and(inArray(tasks.goalId, goalIds), isNull(tasks.deletedAt), isNull(tasks.parentTaskId)),
        )
        .groupBy(tasks.goalId)
    : [];
  const evs = eventIds.size
    ? (await spotlightedEvents(db, userId)).map((r) => r.event).filter((e) => eventIds.has(e.id))
    : [];
  return {
    items: refs.map((r) => {
      if (r.kind === 'event') {
        const e = evs.find((x) => x.id === r.id)!;
        return { kind: 'event' as const, id: r.id, goal: null, event: eventView(e) };
      }
      const goal = views.find((g) => g.id === r.id);
      if (r.kind === 'task' || !goal) {
        return { kind: 'task' as const, id: r.id, goal: null, event: null };
      }
      const c = counts.find((x) => x.goalId === r.id);
      return {
        kind: 'goal' as const,
        id: r.id,
        goal: { ...goal, tasks: { open: c?.open ?? 0, done: c?.done ?? 0 } },
        event: null,
      };
    }),
  };
}
export type Spotlight = Awaited<ReturnType<typeof getSpotlight>>;

/** The task, goal or event, checked: this user's and not deleted. */
async function target(conn: Conn, userId: string, id: string) {
  if (isId(id, 'event')) {
    const [e] = await conn
      .select({ event: events, projectStatus: projects.status, projectTitle: projects.title })
      .from(events)
      .leftJoin(projects, eq(projects.id, events.projectId))
      .where(and(eq(events.id, id), eq(events.userId, userId)));
    if (!e || e.event.deletedAt) throw notFound('event');
    return {
      kind: 'event' as const,
      title: e.event.title,
      closed: !eventAhead(e.event, await today(conn, userId)),
      projectStatus: e.projectStatus,
      projectTitle: e.projectTitle,
    };
  }
  if (isId(id, 'task')) {
    const [t] = await conn
      .select({
        title: tasks.title,
        closed: sql<boolean>`${tasks.completedAt} is not null`,
        deletedAt: tasks.deletedAt,
        projectStatus: projects.status,
        projectTitle: projects.title,
      })
      .from(tasks)
      .leftJoin(projects, eq(projects.id, tasks.projectId))
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
    if (!t || t.deletedAt) throw notFound('task');
    return { kind: 'task' as const, ...t };
  }
  const [g] = await conn
    .select({
      title: goals.title,
      closed: sql<boolean>`${goals.status} <> 'open'`,
      deletedAt: goals.deletedAt,
      projectStatus: projects.status,
      projectTitle: projects.title,
    })
    .from(goals)
    .innerJoin(projects, eq(projects.id, goals.projectId))
    .where(and(eq(goals.id, id), eq(goals.userId, userId)));
  if (!g || g.deletedAt) throw notFound('goal');
  return { kind: 'goal' as const, ...g };
}

async function setFlag(conn: Conn, id: string, at: Date | null) {
  if (isId(id, 'task')) await conn.update(tasks).set({ spotlightedAt: at }).where(eq(tasks.id, id));
  else if (isId(id, 'event')) {
    await conn.update(events).set({ spotlightedAt: at }).where(eq(events.id, id));
  } else await conn.update(goals).set({ spotlightedAt: at }).where(eq(goals.id, id));
}

/**
 * Feature a task or goal (`on`) or take it off. A full spotlight answers 409 `spotlight_full`
 * listing what's in it; the client asks which one to drop and sends it as `replace`.
 */
export async function setSpotlight(userId: string, input: SpotlightInput) {
  return db.transaction(async (tx) => {
    // One spotlight change at a time per user, so two can't both take the last place.
    await tx
      .select({ userId: userSettings.userId })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .for('update');
    const t = await target(tx, userId, input.id);
    if (!input.on) {
      await setFlag(tx, input.id, null);
      return { items: await visible(tx, userId) };
    }

    if (t.closed) {
      throw invalid(
        'spotlight_closed',
        t.kind === 'task'
          ? 'That task is already done.'
          : t.kind === 'event'
            ? 'That event is over.'
            : 'That goal isn’t open anymore.',
      );
    }
    if (t.projectStatus && t.projectStatus !== 'active') {
      throw invalid(
        'spotlight_resting',
        `“${t.projectTitle}” is ${t.projectStatus}. Its ${t.kind}s show on Today once it’s active again.`,
      );
    }
    let items = await visible(tx, userId);
    if (items.some((i) => i.id === input.id)) return { items };
    if (input.replace && items.some((i) => i.id === input.replace)) {
      await setFlag(tx, input.replace, null);
      items = items.filter((i) => i.id !== input.replace);
    }
    if (items.length >= SPOTLIGHT_MAX) {
      throw conflict(
        'spotlight_full',
        `The spotlight holds ${SPOTLIGHT_MAX}. Take one off to add “${t.title}”.`,
        { items },
      );
    }
    await setFlag(tx, input.id, new Date());
    return { items: await visible(tx, userId) };
  });
}
