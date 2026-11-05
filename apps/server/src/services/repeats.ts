// Recurring tasks (4e, D43): a series holds the rule, each occurrence is its own task.
//
// - Completing the newest occurrence makes the next one at once.
// - A schedule also makes its occurrence on its own day while the newest one isn't done (the
//   `repeats` job); only the latest missed day, so nothing piles up. The earlier one stays open and
//   overdue; the new one says so (`earlierOpen` in the task view) and offers to skip it.
// - Reopening the occurrence whose completion made the next one takes that one back while it's
//   untouched, so "Undo" on a completion leaves nothing behind.

import { newId } from '@streakatron/shared/ids';
import {
  dueScheduleDay,
  firstSeriesDay,
  nextSeriesDay,
  normalizeTaskRepeat,
  seriesDateField,
  shiftedDates,
  taskRepeatProblem,
  type TaskRepeat,
} from '@streakatron/shared/repeats';
import { addDays, userDay, wallClock, zonedTime } from '@streakatron/shared/time';
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { goals, links, taskSeries, tasks, userSettings } from '../db/schema';
import { edgeOrder, invalid, type Tx } from './common';
import { daySettings } from './game';
import { writeLinks } from './links';
import { inColumn, landingColumn, projectColumns } from './tasks';

type TaskRow = typeof tasks.$inferSelect;
type SeriesRow = typeof taskSeries.$inferSelect;

/**
 * Set, change or stop (`null`) a task's repeat. Returns the task columns to write: a new series'
 * id and day, and the date it lands on when the task had none.
 */
export async function applyRepeat(
  tx: Tx,
  userId: string,
  task: TaskRow,
  repeat: TaskRepeat | null,
): Promise<Partial<TaskRow>> {
  if (repeat === null) {
    if (task.seriesId) {
      await tx
        .update(taskSeries)
        .set({ stoppedAt: new Date() })
        .where(and(eq(taskSeries.id, task.seriesId), isNull(taskSeries.stoppedAt)));
    }
    return {};
  }
  if (task.parentTaskId) {
    throw invalid('invalid_repeat', 'Subtasks don’t repeat. Repeat the task they belong to.');
  }
  const rule = normalizeTaskRepeat(repeat);

  if (task.seriesId) {
    const [series] = await tx
      .select()
      .from(taskSeries)
      .where(and(eq(taskSeries.id, task.seriesId), eq(taskSeries.userId, userId)));
    if (series) {
      // The rule now counts from this occurrence's day.
      const start =
        (series.dateField === 'due' ? task.dueDate : task.scheduledDate) ?? task.seriesDate!;
      const problem = taskRepeatProblem(rule, start);
      if (problem) throw invalid('invalid_repeat', problem);
      await tx
        .update(taskSeries)
        .set({ repeat: rule, startDate: start, stoppedAt: null })
        .where(eq(taskSeries.id, series.id));
      return {};
    }
  }

  const field = seriesDateField(task);
  const date = field === 'due' ? task.dueDate : task.scheduledDate;
  const today = userDay(new Date(), await daySettings(tx, userId));
  const first = firstSeriesDay(rule, date, today);
  const problem = taskRepeatProblem(rule, first);
  if (problem) throw invalid('invalid_repeat', problem);

  const id = newId('taskSeries');
  await tx
    .insert(taskSeries)
    .values({ id, userId, repeat: rule, startDate: first, dateField: field });
  const values: Partial<TaskRow> = { seriesId: id, seriesDate: first };
  if (!date) values[field === 'due' ? 'dueDate' : 'scheduledDate'] = first;
  return values;
}

/** The newest occurrence of a series (deleted ones count: a deleted day isn't made again). */
async function newestOf(tx: Tx, seriesId: string) {
  const [row] = await tx
    .select()
    .from(tasks)
    .where(eq(tasks.seriesId, seriesId))
    .orderBy(desc(tasks.seriesDate))
    .limit(1);
  return row;
}

/**
 * Make the occurrence for `day` from `source` (title, notes, effort, project, goal, spotlight,
 * subtasks; dates and reminder moved by as many days). Nothing when that day already has one.
 */
async function makeOccurrence(
  tx: Tx,
  userId: string,
  series: SeriesRow,
  source: TaskRow,
  day: string,
  followsTaskId: string | null,
) {
  const s = await daySettings(tx, userId);
  const { dueDate, scheduledDate, shift } = shiftedDates(
    source,
    series.dateField,
    source.seriesDate ?? day,
    day,
  );
  let remindAt: Date | null = null;
  if (source.remindAt) {
    const at = wallClock(source.remindAt, s.timeZone);
    remindAt = zonedTime(addDays(at.date, shift), at.hour, s.timeZone, at.minute);
  }

  let columnId: string | null = null;
  let scope = and(
    eq(tasks.userId, userId),
    isNull(tasks.projectId),
    isNull(tasks.deletedAt),
    isNull(tasks.parentTaskId),
  );
  if (source.projectId) {
    const column = landingColumn(await projectColumns(tx, source.projectId), false);
    columnId = column.id;
    scope = inColumn(column.id);
  }
  let goalId = source.goalId;
  if (goalId) {
    const [goal] = await tx
      .select({ id: goals.id })
      .from(goals)
      .where(and(eq(goals.id, goalId), isNull(goals.deletedAt), eq(goals.status, 'open')));
    if (!goal) goalId = null;
  }

  const id = newId('task');
  const [made] = await tx
    .insert(tasks)
    .values({
      id,
      userId,
      projectId: source.projectId,
      columnId,
      goalId,
      title: source.title,
      description: source.description,
      descriptionText: source.descriptionText,
      effort: source.effort,
      dueDate,
      scheduledDate,
      remindAt,
      spotlightedAt: source.spotlightedAt,
      seriesId: series.id,
      seriesDate: day,
      followsTaskId,
      sortOrder: await edgeOrder(tx, tasks, scope, 'bottom'),
    })
    .onConflictDoNothing()
    .returning({ id: tasks.id });
  if (!made) return null;

  // The spotlight moves on with the series (one place in it, not two).
  if (source.spotlightedAt) {
    await tx.update(tasks).set({ spotlightedAt: null }).where(eq(tasks.id, source.id));
  }
  await writeLinks(tx, userId, id, source.description);

  const subtasks = await tx
    .select()
    .from(tasks)
    .where(and(eq(tasks.parentTaskId, source.id), isNull(tasks.deletedAt)))
    .orderBy(asc(tasks.sortOrder));
  if (subtasks.length) {
    const copies = subtasks.map((t) => ({
      id: newId('task'),
      userId,
      projectId: source.projectId,
      parentTaskId: id,
      title: t.title,
      description: t.description,
      descriptionText: t.descriptionText,
      effort: t.effort,
      sortOrder: t.sortOrder,
    }));
    await tx.insert(tasks).values(copies);
    for (const [i, t] of subtasks.entries()) {
      await writeLinks(tx, userId, copies[i]!.id, t.description);
    }
  }
  return id;
}

/** Tasks just completed: the newest occurrence of a running series makes the next one. */
export async function advanceSeries(tx: Tx, userId: string, ids: string[]) {
  if (!ids.length) return;
  const done = await tx
    .select()
    .from(tasks)
    .where(and(inArray(tasks.id, ids), isNotNull(tasks.seriesId), isNull(tasks.parentTaskId)));
  if (!done.length) return;
  const today = userDay(new Date(), await daySettings(tx, userId));
  for (const task of done) {
    const [series] = await tx
      .select()
      .from(taskSeries)
      .where(and(eq(taskSeries.id, task.seriesId!), isNull(taskSeries.stoppedAt)))
      .for('update');
    if (!series) continue;
    const newest = await newestOf(tx, series.id);
    if (!newest || newest.id !== task.id) continue;
    const day = nextSeriesDay(series.repeat, series.startDate, task.seriesDate!, today);
    if (day) await makeOccurrence(tx, userId, series, task, day, task.id);
  }
}

/**
 * Tasks just reopened: the occurrence each one's completion made goes again while it's untouched
 * (open, never edited, no subtask done), and the spotlight comes back.
 */
export async function retractNext(tx: Tx, userId: string, ids: string[]) {
  if (!ids.length) return;
  const made = await tx
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        inArray(tasks.followsTaskId, ids),
        isNull(tasks.completedAt),
        isNull(tasks.deletedAt),
        sql`${tasks.updatedAt} = ${tasks.createdAt}`,
        sql`not exists (select 1 from tasks s where s.parent_task_id = ${tasks.id} and s.completed_at is not null)`,
      ),
    );
  for (const next of made) {
    await tx.delete(links).where(eq(links.sourceId, next.id));
    await tx.delete(tasks).where(eq(tasks.parentTaskId, next.id));
    await tx.delete(tasks).where(eq(tasks.id, next.id));
    if (next.spotlightedAt && next.followsTaskId) {
      await tx
        .update(tasks)
        .set({ spotlightedAt: next.spotlightedAt })
        .where(eq(tasks.id, next.followsTaskId));
    }
  }
}

/**
 * The job: every running schedule whose next day has come while its newest occurrence isn't done
 * gets that day's occurrence. Returns how many were made.
 */
export async function runRepeats(now = new Date()) {
  const running = await db
    .select({
      series: taskSeries,
      timeZone: userSettings.timezone,
      dayStartHour: userSettings.dayStartHour,
    })
    .from(taskSeries)
    .innerJoin(userSettings, eq(userSettings.userId, taskSeries.userId))
    .where(and(isNull(taskSeries.stoppedAt), sql`${taskSeries.repeat}->>'kind' = 'schedule'`));
  let made = 0;
  for (const { series, ...s } of running) {
    const today = userDay(now, s);
    made += await db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(taskSeries)
        .where(and(eq(taskSeries.id, series.id), isNull(taskSeries.stoppedAt)))
        .for('update');
      if (!locked) return 0;
      const newest = await newestOf(tx, locked.id);
      if (!newest) {
        // Every occurrence is gone (purged): nothing left to repeat.
        await tx.update(taskSeries).set({ stoppedAt: now }).where(eq(taskSeries.id, locked.id));
        return 0;
      }
      const day = dueScheduleDay(locked.repeat, locked.startDate, newest.seriesDate!, today);
      if (!day) return 0;
      return (await makeOccurrence(tx, locked.userId, locked, newest, day, null)) ? 1 : 0;
    });
  }
  return made;
}
