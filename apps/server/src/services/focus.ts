// Focus sessions (plan.md §4.4, D29). The server keeps the timer's state (start, pauses, end), so a
// session survives reloads; the shared rules decide what it counts. One open session per user.
//
// A running session that reaches its cap (plan + overtime allowance) is finished "lazily": by the
// next request that touches it, dated when it reached the cap, so its XP and active day land on the
// right day however late anyone looks.

import {
  autoFinishAt,
  creditedMinutes,
  focusCounts,
  isPastCap,
  OPEN_FOCUS_STATUSES,
} from '@streakatron/shared/focus';
import { newId } from '@streakatron/shared/ids';
import type { FocusPatch, FocusStart } from '@streakatron/shared/schemas';
import { userDay, userDayRange } from '@streakatron/shared/time';
import { and, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { focusSessions, projects, tasks, userSettings } from '../db/schema';
import { conflict, notFound, type Conn, type Tx } from './common';
import { logActivity } from './game';

type SessionRow = typeof focusSessions.$inferSelect;

// --- Views -----------------------------------------------------------------------------------

/** A session as the client sees it, with the task and project it's on (when they still exist). */
async function sessionView(conn: Conn, userId: string, id: string) {
  const [row] = await conn
    .select({
      id: focusSessions.id,
      status: focusSessions.status,
      plannedMinutes: focusSessions.plannedMinutes,
      breakMinutes: focusSessions.breakMinutes,
      startedAt: focusSessions.startedAt,
      pausedMs: focusSessions.pausedMs,
      pausedAt: focusSessions.pausedAt,
      endedAt: focusSessions.endedAt,
      minutes: focusSessions.minutes,
      note: focusSessions.note,
      taskId: tasks.id,
      taskTitle: tasks.title,
      taskCompletedAt: tasks.completedAt,
      projectId: projects.id,
      projectTitle: projects.title,
      projectColor: projects.color,
      projectIcon: projects.icon,
    })
    .from(focusSessions)
    .leftJoin(tasks, and(eq(tasks.id, focusSessions.taskId), isNull(tasks.deletedAt)))
    .leftJoin(projects, eq(projects.id, focusSessions.projectId))
    .where(and(eq(focusSessions.id, id), eq(focusSessions.userId, userId)));
  if (!row) throw notFound('focus session');
  const {
    taskId,
    taskTitle,
    taskCompletedAt,
    projectId,
    projectTitle,
    projectColor,
    projectIcon,
    ...s
  } = row;
  return {
    ...s,
    task: taskId ? { id: taskId, title: taskTitle!, completedAt: taskCompletedAt } : null,
    project: projectId
      ? { id: projectId, title: projectTitle!, color: projectColor!, icon: projectIcon! }
      : null,
  };
}
export type FocusSessionView = Awaited<ReturnType<typeof sessionView>>;

// --- Lookups ---------------------------------------------------------------------------------

/**
 * The open session, locked for the transaction. One that reached its cap is finished first and
 * `ended` is set: the caller answers the new state rather than failing, which would roll it back.
 */
async function openSession(
  tx: Tx,
  userId: string,
  now: Date,
): Promise<{ open?: SessionRow; ended?: true }> {
  const [row] = await tx
    .select()
    .from(focusSessions)
    .where(
      and(
        eq(focusSessions.userId, userId),
        inArray(focusSessions.status, [...OPEN_FOCUS_STATUSES]),
      ),
    )
    .for('update');
  if (row && isPastCap(row, now)) {
    await complete(tx, userId, row, autoFinishAt(row)!);
    return { ended: true };
  }
  return { open: row };
}

const noSession = () => conflict('no_focus', 'No focus session is going right now.');

/** End a session as completed at `endedAt`, crediting its minutes (and XP from 10 minutes). */
async function complete(tx: Tx, userId: string, row: SessionRow, endedAt: Date) {
  const pausedMs = row.pausedAt
    ? row.pausedMs + Math.max(0, endedAt.getTime() - row.pausedAt.getTime())
    : row.pausedMs;
  const ended = { ...row, pausedMs, pausedAt: null, endedAt };
  const minutes = creditedMinutes(ended, endedAt);
  await tx
    .update(focusSessions)
    .set({ status: 'completed', pausedMs, pausedAt: null, endedAt, minutes })
    .where(eq(focusSessions.id, row.id));
  if (focusCounts(minutes)) {
    await logActivity(tx, userId, [
      {
        type: 'focus_completed',
        entityId: row.id,
        payload: { minutes, projectId: row.projectId },
        occurredAt: endedAt,
      },
    ]);
  }
}

/** Minutes focused today (completed sessions that ended today) and how many sessions. */
async function focusToday(conn: Conn, userId: string, now: Date) {
  const [settings] = await conn
    .select({ timeZone: userSettings.timezone, dayStartHour: userSettings.dayStartHour })
    .from(userSettings)
    .where(eq(userSettings.userId, userId));
  const day = userDayRange(userDay(now, settings!), settings!);
  const [row] = await conn
    .select({
      minutes: sql<number>`coalesce(sum(${focusSessions.minutes}), 0)::int`,
      sessions: sql<number>`count(*)::int`,
    })
    .from(focusSessions)
    .where(
      and(
        eq(focusSessions.userId, userId),
        eq(focusSessions.status, 'completed'),
        gte(focusSessions.endedAt, day.start),
        sql`${focusSessions.endedAt} < ${day.end}`,
      ),
    );
  return { minutes: row?.minutes ?? 0, sessions: row?.sessions ?? 0 };
}

/** The session that ended last (completed or abandoned), for the finish card after a reload. */
async function lastEnded(conn: Conn, userId: string) {
  const [row] = await conn
    .select({ id: focusSessions.id })
    .from(focusSessions)
    .where(
      and(
        eq(focusSessions.userId, userId),
        inArray(focusSessions.status, ['completed', 'abandoned']),
      ),
    )
    // By start: sessions never overlap, and an auto-finished one is dated back to its cap.
    .orderBy(desc(focusSessions.startedAt))
    .limit(1);
  return row ? sessionView(conn, userId, row.id) : null;
}

// --- Reads and writes ------------------------------------------------------------------------

/**
 * The timer's state: the open session (or null), the one that ended last, today's focus, and the
 * server's clock (the client times against it). Finishes a session that reached its cap.
 */
export async function currentFocus(userId: string, now = new Date()) {
  return db.transaction(async (tx) => {
    await openSession(tx, userId, now);
    return answer(tx, userId, now);
  });
}
export type CurrentFocus = Awaited<ReturnType<typeof currentFocus>>;

/** Every write answers the same shape as `currentFocus`, so the client replaces its cache. */
async function answer(tx: Tx, userId: string, now: Date) {
  const [open] = await tx
    .select({ id: focusSessions.id })
    .from(focusSessions)
    .where(
      and(
        eq(focusSessions.userId, userId),
        inArray(focusSessions.status, [...OPEN_FOCUS_STATUSES]),
      ),
    );
  return {
    session: open ? await sessionView(tx, userId, open.id) : null,
    last: await lastEnded(tx, userId),
    today: await focusToday(tx, userId, now),
    now: now.toISOString(),
  };
}

export async function startFocus(userId: string, input: FocusStart, now = new Date()) {
  return db.transaction(async (tx) => {
    // Serialize starts per user, so two at once get the 409 below rather than the unique index.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'focus:' + userId}))`);
    const { open } = await openSession(tx, userId, now);
    if (open) {
      throw conflict('focus_open', 'A focus session is already going. Finish it first.', {
        sessionId: open.id,
      });
    }
    let taskId: string | null = null;
    let projectId: string | null = null;
    if (input.taskId) {
      const [task] = await tx
        .select({ id: tasks.id, projectId: tasks.projectId })
        .from(tasks)
        .where(and(eq(tasks.id, input.taskId), eq(tasks.userId, userId), isNull(tasks.deletedAt)));
      if (!task) throw notFound('task');
      taskId = task.id;
      projectId = task.projectId;
    } else if (input.projectId) {
      const [project] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, input.projectId), eq(projects.userId, userId)));
      if (!project) throw notFound('project');
      projectId = project.id;
    }
    await tx.insert(focusSessions).values({
      id: newId('focusSession'),
      userId,
      taskId,
      projectId,
      status: 'running',
      plannedMinutes: input.focusMinutes,
      breakMinutes: input.breakMinutes,
      startedAt: now,
    });
    return answer(tx, userId, now);
  });
}

export async function pauseFocus(userId: string, now = new Date()) {
  return db.transaction(async (tx) => {
    const { open, ended } = await openSession(tx, userId, now);
    if (ended) return answer(tx, userId, now);
    if (!open) throw noSession();
    if (open.status === 'running') {
      await tx
        .update(focusSessions)
        .set({ status: 'paused', pausedAt: now })
        .where(eq(focusSessions.id, open.id));
    }
    return answer(tx, userId, now);
  });
}

export async function resumeFocus(userId: string, now = new Date()) {
  return db.transaction(async (tx) => {
    const { open, ended } = await openSession(tx, userId, now);
    if (ended) return answer(tx, userId, now);
    if (!open) throw noSession();
    if (open.status === 'paused' && open.pausedAt) {
      await tx
        .update(focusSessions)
        .set({
          status: 'running',
          pausedAt: null,
          pausedMs: open.pausedMs + Math.max(0, now.getTime() - open.pausedAt.getTime()),
        })
        .where(eq(focusSessions.id, open.id));
    }
    return answer(tx, userId, now);
  });
}

/** Finish now. A session that already reached its cap was finished then, and that stands. */
export async function finishFocus(userId: string, now = new Date()) {
  return db.transaction(async (tx) => {
    const { open, ended } = await openSession(tx, userId, now);
    if (ended) return answer(tx, userId, now);
    if (!open) throw noSession();
    await complete(tx, userId, open, now);
    return answer(tx, userId, now);
  });
}

/** Stop without counting anything. */
export async function abandonFocus(userId: string, now = new Date()) {
  return db.transaction(async (tx) => {
    const { open, ended } = await openSession(tx, userId, now);
    if (ended) return answer(tx, userId, now);
    if (!open) throw noSession();
    const pausedMs = open.pausedAt
      ? open.pausedMs + Math.max(0, now.getTime() - open.pausedAt.getTime())
      : open.pausedMs;
    await tx
      .update(focusSessions)
      .set({ status: 'abandoned', endedAt: now, pausedAt: null, pausedMs })
      .where(eq(focusSessions.id, open.id));
    return answer(tx, userId, now);
  });
}

/** The note on a session (any status). */
export async function updateFocus(userId: string, id: string, patch: FocusPatch) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: focusSessions.id })
      .from(focusSessions)
      .where(and(eq(focusSessions.id, id), eq(focusSessions.userId, userId)))
      .for('update');
    if (!row) throw notFound('focus session');
    await tx
      .update(focusSessions)
      .set({ note: patch.note || null })
      .where(eq(focusSessions.id, id));
    return sessionView(tx, userId, id);
  });
}
