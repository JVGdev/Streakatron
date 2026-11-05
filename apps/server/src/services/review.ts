// The weekly review (D45): what the review page shows for a week, the review row that holds the
// reflection, finishing it (50 XP once a week), and "Keep parked" for a parked project.
//
// The week is `reviewWeekOf(today)`: the week ending today on its last day, the week that just
// ended in the first two days of the next, the week so far otherwise.

import type { RichDoc } from '@streakatron/shared/rich';
import { textFromDoc } from '@streakatron/shared/rich';
import { newId } from '@streakatron/shared/ids';
import { reviewOffered, reviewWeekOf } from '@streakatron/shared/structure';
import { addDays, userDay } from '@streakatron/shared/time';
import { and, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { activity, goals, projects, tasks, userSettings, weeklyReviews } from '../db/schema';
import { HttpError } from '../http/errors';
import { conflict, notFound, type Conn } from './common';
import { activeDayWhere, logActivity } from './game';
import { goalViews } from './goals';
import { ownedProject } from './projects';

async function settingsOf(conn: Conn, userId: string) {
  const [row] = await conn
    .select({
      timeZone: userSettings.timezone,
      dayStartHour: userSettings.dayStartHour,
      weekStart: userSettings.weekStart,
      weeklyTarget: userSettings.weeklyActiveDayTarget,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId));
  if (!row) throw new HttpError(500, 'missing_settings', 'Your settings are missing.');
  return row;
}

const reviewView = ({ userId: _, ...r }: typeof weeklyReviews.$inferSelect) => r;

async function reviewOf(conn: Conn, userId: string, weekStart: string) {
  const [row] = await conn
    .select()
    .from(weeklyReviews)
    .where(and(eq(weeklyReviews.userId, userId), eq(weeklyReviews.weekStart, weekStart)));
  return row ?? null;
}

/** Whether Today offers the review now (its days, not done yet), and for which week. */
export async function reviewStatus(userId: string) {
  const s = await settingsOf(db, userId);
  const today = userDay(new Date(), s);
  const weekStart = reviewWeekOf(today, s.weekStart);
  const review = await reviewOf(db, userId, weekStart);
  const done = !!review?.completedAt;
  return { today, weekStart, done, offered: !done && reviewOffered(today, s.weekStart) };
}

/** Everything the review's summary step shows about a week, and the projects that stalled. */
export async function weekReview(userId: string) {
  const s = await settingsOf(db, userId);
  const today = userDay(new Date(), s);
  const start = reviewWeekOf(today, s.weekStart);
  const end = addDays(start, 6);
  const inWeek = and(
    eq(activity.userId, userId),
    gte(activity.localDate, start),
    lte(activity.localDate, end),
  );

  const [days] = await db
    .select({ n: sql<number>`count(distinct ${activity.localDate})::int` })
    .from(activity)
    .where(and(inWeek, activeDayWhere()));
  const [xp] = await db
    .select({ n: sql<number>`coalesce(sum(${activity.xp}), 0)::int` })
    .from(activity)
    .where(inWeek);
  const [met] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(activity)
    .where(and(inWeek, eq(activity.type, 'commitment_met')));

  // Tasks done this week that are still done (a reopened one isn't), newest first.
  const done = await db
    .selectDistinctOn([tasks.id], {
      id: tasks.id,
      title: tasks.title,
      projectId: tasks.projectId,
      at: activity.occurredAt,
    })
    .from(activity)
    .innerJoin(tasks, eq(tasks.id, activity.entityId))
    .where(
      and(
        inWeek,
        eq(activity.type, 'task_completed'),
        isNull(tasks.parentTaskId),
        isNull(tasks.deletedAt),
        sql`${tasks.completedAt} is not null`,
      ),
    )
    .orderBy(tasks.id, desc(activity.occurredAt));
  done.sort((a, b) => b.at.getTime() - a.at.getTime());

  const focus = await db
    .select({
      projectId: sql<string | null>`${activity.payload}->>'projectId'`,
      minutes: sql<number>`coalesce(sum((${activity.payload}->>'minutes')::int), 0)::int`,
    })
    .from(activity)
    .where(and(inWeek, eq(activity.type, 'focus_completed')))
    .groupBy(sql`${activity.payload}->>'projectId'`);

  // Active projects where nothing was done (no task completed, no focus) this week.
  const worked = new Set(
    (
      await db
        .selectDistinct({ id: sql<string>`${activity.payload}->>'projectId'` })
        .from(activity)
        .where(
          and(
            inWeek,
            inArray(activity.type, ['task_completed', 'focus_completed']),
            sql`${activity.payload}->>'projectId' is not null`,
          ),
        )
    ).map((r) => r.id),
  );
  const active = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.userId, userId), eq(projects.status, 'active')));
  const stalled = active.map((p) => p.id).filter((id) => !worked.has(id));

  const openGoals = active.length
    ? await db
        .select()
        .from(goals)
        .where(
          and(
            eq(goals.userId, userId),
            isNull(goals.deletedAt),
            eq(goals.status, 'open'),
            inArray(
              goals.projectId,
              active.map((p) => p.id),
            ),
          ),
        )
    : [];

  const review = await reviewOf(db, userId, start);
  return {
    today,
    week: { start, end },
    review: review ? reviewView(review) : null,
    summary: {
      activeDays: days?.n ?? 0,
      weeklyTarget: s.weeklyTarget,
      xp: xp?.n ?? 0,
      commitmentsMet: met?.n ?? 0,
      tasksDone: done.map(({ at: _, ...t }) => t),
      focus: focus.sort((a, b) => b.minutes - a.minutes),
    },
    stalled,
    goals: await goalViews(db, userId, openGoals),
  };
}

/** The week's review row, made on the first step (the reflection saves into it). */
export async function startReview(userId: string) {
  const s = await settingsOf(db, userId);
  const weekStart = reviewWeekOf(userDay(new Date(), s), s.weekStart);
  await db
    .insert(weeklyReviews)
    .values({ id: newId('weeklyReview'), userId, weekStart })
    .onConflictDoNothing();
  return reviewView((await reviewOf(db, userId, weekStart))!);
}

async function ownedReview(conn: Conn, userId: string, id: string) {
  const [row] = await conn
    .select()
    .from(weeklyReviews)
    .where(and(eq(weeklyReviews.id, id), eq(weeklyReviews.userId, userId)));
  if (!row) throw notFound('review');
  return row;
}

const reflectionColumns = (doc: RichDoc | null | undefined) =>
  doc === undefined ? {} : { reflection: doc, reflectionText: doc ? textFromDoc(doc) : '' };

export async function saveReview(userId: string, id: string, reflection: RichDoc | null) {
  await ownedReview(db, userId, id);
  const [row] = await db
    .update(weeklyReviews)
    .set(reflectionColumns(reflection))
    .where(eq(weeklyReviews.id, id))
    .returning();
  return reviewView(row!);
}

/** Finish it: done for the week, its XP (once per week, D15). Finishing again changes nothing. */
export async function finishReview(userId: string, id: string, reflection?: RichDoc | null) {
  return db.transaction(async (tx) => {
    const review = await ownedReview(tx, userId, id);
    const [row] = await tx
      .update(weeklyReviews)
      .set({ ...reflectionColumns(reflection), completedAt: review.completedAt ?? new Date() })
      .where(eq(weeklyReviews.id, id))
      .returning();
    if (!review.completedAt) {
      await logActivity(tx, userId, [
        { type: 'review_completed', entityId: id, payload: { week: review.weekStart } },
      ]);
    }
    return reviewView(row!);
  });
}

/** "Keep parked": a parked project looked at and left as it is (counts as revisited, D45). */
export async function keepParked(userId: string, projectId: string) {
  const project = await ownedProject(db, userId, projectId);
  if (project.status !== 'parked') throw conflict('not_parked', 'That project isn’t parked.');
  await db.update(projects).set({ reviewedAt: new Date() }).where(eq(projects.id, projectId));
  return { id: projectId };
}
