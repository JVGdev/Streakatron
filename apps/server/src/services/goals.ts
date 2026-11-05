// Goals of a project: outcomes (optionally with a deadline) and time goals (focus minutes per week
// or month, D31). A time goal's progress is the focus on its project in the current period:
// sessions on the project, its tasks or its commitments (all carry the project), from the log.

import type { GoalCreate, GoalPatch } from '@streakatron/shared/schemas';
import { goalShapeProblem } from '@streakatron/shared/schemas';
import { monthStart } from '@streakatron/shared/calendar';
import { newId } from '@streakatron/shared/ids';
import { goalPeriodRange, timeGoalProgress } from '@streakatron/shared/structure';
import { userDay } from '@streakatron/shared/time';
import { and, asc, between, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { activity, goals } from '../db/schema';
import {
  defined,
  edgeOrder,
  invalid,
  notFound,
  richColumns,
  type Conn,
  inTx,
  type Tx,
} from './common';
import { daySettings } from './game';
import { writeLinks } from './links';
import { ownedProject } from './projects';

type GoalRow = typeof goals.$inferSelect;

/** A month deadline is stored as the month's first day (D39). */
const dueOf = (dueDate: string | null, precision: 'day' | 'month') =>
  dueDate && precision === 'month' ? monthStart(dueDate) : dueDate;

/** Goals as the API returns them: the row, and a time goal's progress this period. */
export async function goalViews(conn: Conn, userId: string, rows: GoalRow[]) {
  const timed = rows.filter((g) => g.kind === 'time' && g.targetMinutes && g.period);
  const s = timed.length ? await daySettings(conn, userId) : null;
  const today = s ? userDay(new Date(), s) : '';
  const out = [];
  for (const { userId: _, deletedAt: __, ...g } of rows) {
    let progress = null;
    if (s && g.kind === 'time' && g.targetMinutes && g.period) {
      const range = goalPeriodRange(g.period, today, s.weekStart);
      const [row] = await conn
        .select({ m: sql<number>`coalesce(sum((${activity.payload}->>'minutes')::int), 0)::int` })
        .from(activity)
        .where(
          and(
            eq(activity.userId, userId),
            eq(activity.type, 'focus_completed'),
            sql`${activity.payload}->>'projectId' = ${g.projectId}`,
            between(activity.localDate, range.start, range.end),
          ),
        );
      progress = timeGoalProgress(
        { targetMinutes: g.targetMinutes, period: g.period },
        row?.m ?? 0,
        today,
        s.weekStart,
      );
    }
    out.push({ ...g, progress });
  }
  return out;
}

const view = async (conn: Conn, userId: string, row: GoalRow) =>
  (await goalViews(conn, userId, [row]))[0]!;

export async function listGoals(conn: Conn, userId: string, projectId: string) {
  const rows = await conn
    .select()
    .from(goals)
    .where(and(eq(goals.userId, userId), eq(goals.projectId, projectId), isNull(goals.deletedAt)))
    .orderBy(asc(goals.sortOrder), asc(goals.createdAt));
  return goalViews(conn, userId, rows);
}

async function ownedGoal(conn: Conn, userId: string, id: string, { deleted = false } = {}) {
  const [row] = await conn
    .select()
    .from(goals)
    .where(and(eq(goals.id, id), eq(goals.userId, userId)));
  if (!row || (row.deletedAt !== null) !== deleted) throw notFound('goal');
  return row;
}

export async function createGoal(userId: string, input: GoalCreate, inside?: Tx) {
  return inTx(inside, async (tx) => {
    await ownedProject(tx, userId, input.projectId);
    const outcome = input.kind === 'outcome';
    const id = newId('goal');
    const [row] = await tx
      .insert(goals)
      .values({
        id,
        userId,
        projectId: input.projectId,
        title: input.title,
        kind: input.kind,
        targetMinutes: outcome ? null : (input.targetMinutes ?? null),
        period: outcome ? null : (input.period ?? null),
        dueDate: dueOf(input.dueDate ?? null, input.duePrecision ?? 'day'),
        duePrecision: input.duePrecision ?? 'day',
        sortOrder: await edgeOrder(
          tx,
          goals,
          and(eq(goals.projectId, input.projectId), isNull(goals.deletedAt)),
          'bottom',
        ),
        ...richColumns(input.description),
      })
      .returning();
    await writeLinks(tx, userId, id, input.description);
    return view(tx, userId, row!);
  });
}

/** One goal (the goal sheet). */
export async function getGoal(userId: string, id: string) {
  return view(db, userId, await ownedGoal(db, userId, id));
}

export async function updateGoal(userId: string, id: string, patch: GoalPatch) {
  return db.transaction(async (tx) => {
    const goal = await ownedGoal(tx, userId, id);
    const { description, ...rest } = patch;
    const next = { ...goal, ...defined(rest) };
    // An outcome has no target; switching kinds drops it rather than failing.
    if (next.kind === 'outcome') Object.assign(next, { targetMinutes: null, period: null });
    const problem = goalShapeProblem(next);
    if (problem) throw invalid('invalid_goal', problem);
    const [row] = await tx
      .update(goals)
      .set({
        ...defined(rest),
        targetMinutes: next.targetMinutes,
        period: next.period,
        dueDate: dueOf(next.dueDate, next.duePrecision),
        ...richColumns(description),
      })
      .where(eq(goals.id, id))
      .returning();
    await writeLinks(tx, userId, id, description);
    return view(tx, userId, row!);
  });
}

/** Soft delete; tasks keep pointing at it so an undo restores everything. */
export async function deleteGoal(userId: string, id: string) {
  await ownedGoal(db, userId, id);
  const deletedAt = new Date();
  await db.update(goals).set({ deletedAt }).where(eq(goals.id, id));
  return { id, deletedAt };
}

export async function restoreGoal(userId: string, id: string) {
  await ownedGoal(db, userId, id, { deleted: true });
  const [row] = await db
    .update(goals)
    .set({ deletedAt: null })
    .where(and(eq(goals.id, id), isNotNull(goals.deletedAt)))
    .returning();
  return view(db, userId, row!);
}
