// Quests on the server (plan.md §5, D10, D16, D30). Boards are planned by the shared rules from
// what the server gathers (`gatherInput`), made on the day's (and week's) first look, and evaluated
// against the activity log and the structure:
//
// - after writes, only the open quests that kind of change can affect (`withGame` with `touches`);
// - fully when the board is viewed.
//
// A completion logs `quest_completed` (its XP, once per quest) and a quest event for the UI; a make
// quest spawns its follow-up; a quick quest makes room for the next (3 rewarded a day); finishing
// every daily quest logs the board bonus. Rows are never deleted: their statuses are the fit stats.

import { newId } from '@streakatron/shared/ids';
import {
  followupTarget,
  missingGoalParts,
  missingTaskParts,
  partsFilled,
  planDaily,
  planQuick,
  planReroll,
  planWeekly,
  questHint,
  questTitle,
  QUESTS,
  type BoardInput,
  type DetailPart,
  type QuestSpec,
  type QuestTemplate,
  type QuestType,
} from '@streakatron/shared/quests';
import { monthEnd } from '@streakatron/shared/calendar';
import { focusList, type TaskStatus } from '@streakatron/shared/structure';
import {
  addDays,
  daysBetween,
  startOfWeek,
  userDay,
  type DateString,
} from '@streakatron/shared/time';
import { and, asc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { db } from '../db/client';
import {
  activity,
  boardColumns,
  focusSessions,
  goals,
  projects,
  questInstances,
  tasks,
  userSettings,
} from '../db/schema';
import { HttpError } from '../http/errors';
import { todayCommitments } from './commitments';
import { conflict, notFound, type Tx } from './common';
import { activeDaySql, activeDayWhere, logActivity, noteGameEvent, type Touch } from './game';
import { goalViews } from './goals';
import { notesOnBoard } from './notes';
import { projectViews } from './projects';

type QuestRow = typeof questInstances.$inferSelect;

/** The kinds of change each template can be moved by (incremental evaluation). */
const TRIGGERS: Record<QuestTemplate, readonly Touch[]> = {
  top_item: ['task'],
  next_action: ['task'],
  stale_project: ['task', 'project'],
  tasks_n: ['task'],
  large_task: ['task'],
  focus_sessions: ['focus'],
  focus_today: ['focus'],
  triage: ['task'],
  pin_next: ['project', 'task'],
  effort: ['task'],
  focus_note: ['focus'],
  log_commitment: ['commitment', 'focus'],
  sort_notes: ['note'],
  commitments_due: ['commitment', 'focus', 'project'],
  add_task: ['task', 'project'],
  add_goal: ['goal', 'project'],
  subtasks: ['task'],
  task_details: ['task', 'goal'],
  goal_details: ['goal', 'task'],
  week_target: ['task', 'focus', 'commitment'],
  week_projects: ['task', 'focus', 'project'],
  week_focus: ['focus'],
  weekly_review: ['review'],
  revisit_parked: ['project'],
  goal_tasks: ['task', 'goal'],
  time_goal: ['focus', 'goal'],
  number_goal: ['goal', 'commitment', 'focus'],
  comeback: ['task', 'focus', 'commitment'],
};

const DAILY_BOARD_TYPES: QuestType[] = ['daily', 'time', 'make', 'quick', 'comeback'];
const WEEKLY_BOARD_TYPES: QuestType[] = ['weekly', 'review', 'project'];

// --- Settings and days -----------------------------------------------------------------------

async function questSettingsOf(tx: Tx, userId: string) {
  const [row] = await tx
    .select({
      timeZone: userSettings.timezone,
      dayStartHour: userSettings.dayStartHour,
      weekStart: userSettings.weekStart,
      weeklyTarget: userSettings.weeklyActiveDayTarget,
      quest: userSettings.questSettings,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId));
  if (!row) throw new HttpError(500, 'missing_settings', 'Your settings are missing.');
  return row;
}
type QuestSettingsRow = Awaited<ReturnType<typeof questSettingsOf>>;

const lock = (tx: Tx, userId: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'quests:' + userId}))`);

const rowsOf = <T>(res: { rows: unknown[] }) => res.rows as T[];

// --- Gathering what a board is planned from --------------------------------------------------

async function gatherInput(
  tx: Tx,
  userId: string,
  s: QuestSettingsRow,
  today: DateString,
): Promise<BoardInput> {
  const from = addDays(today, -QUESTS.history.days);
  const weekStart = startOfWeek(today, s.weekStart);
  const [last] = rowsOf<{ day: string | null }>(
    await tx.execute(
      sql`select max(local_date)::text as day from activity where user_id = ${userId} and ${activeDaySql()} and local_date <= ${today}`,
    ),
  );
  const idleDays = last?.day ? daysBetween(last.day, today) : null;

  const perDay = rowsOf<{ day: string; tasks: number; minutes: number }>(
    await tx.execute(sql`
      select local_date::text as day,
        count(distinct entity_id) filter (
          where type = 'task_completed' and coalesce((payload->>'subtask')::boolean, false) = false
        )::int as tasks,
        coalesce(sum((payload->>'minutes')::int) filter (where type = 'focus_completed'), 0)::int as minutes
      from activity
      where user_id = ${userId} and type in ('task_completed', 'focus_completed')
        and local_date >= ${[from, addDays(weekStart, -28)].sort()[0]!}
        and local_date < ${today}
      group by local_date`),
  );
  const recent = perDay.filter((d) => d.day >= from);
  const weeks = new Map<string, number>();
  for (const d of perDay) {
    const w = startOfWeek(d.day, s.weekStart);
    if (w < weekStart && w >= addDays(weekStart, -28))
      weeks.set(w, (weeks.get(w) ?? 0) + d.minutes);
  }

  // When each project and task was last worked on or offered: the "waiting time".
  const touched = new Map(
    rowsOf<{ id: string; day: string }>(
      await tx.execute(sql`
        select payload->>'projectId' as id, max(local_date)::text as day from activity
        where user_id = ${userId} and type in ('task_completed', 'focus_completed')
          and payload->>'projectId' is not null
        group by 1`),
    ).map((r) => [r.id, r.day]),
  );
  const offered = new Map(
    rowsOf<{ id: string; day: string }>(
      await tx.execute(sql`
        select x.id, max(q.period_start)::text as day
        from quest_instances q
          cross join lateral (values (q.task_id), (q.project_id), (q.goal_id)) as x(id)
        where q.user_id = ${userId} and x.id is not null
        group by x.id`),
    ).map((r) => [r.id, r.day]),
  );
  const waiting = (id: string, created: Date) => {
    const days = [touched.get(id), offered.get(id)].filter((d): d is string => !!d);
    const since = days.length
      ? days.sort().at(-1)!
      : userDay(created, { timeZone: s.timeZone, dayStartHour: s.dayStartHour });
    return Math.max(0, daysBetween(since, today));
  };

  const views = await projectViews(tx, userId);
  const active = views.filter((p) => p.status === 'active');
  const open = await tx
    .select({
      id: tasks.id,
      title: tasks.title,
      projectId: tasks.projectId,
      completedAt: tasks.completedAt,
      dueDate: tasks.dueDate,
      scheduledDate: tasks.scheduledDate,
      spotlightedAt: tasks.spotlightedAt,
      status: sql<TaskStatus>`case when ${boardColumns.category} = 'waiting' then 'waiting' else 'todo' end`,
      effort: tasks.effort,
      createdAt: tasks.createdAt,
      subtasks: sql<number>`(select count(*)::int from tasks s where s.parent_task_id = ${tasks.id} and s.deleted_at is null)`,
    })
    .from(tasks)
    .leftJoin(boardColumns, eq(boardColumns.id, tasks.columnId))
    .where(
      and(
        eq(tasks.userId, userId),
        isNull(tasks.deletedAt),
        isNull(tasks.completedAt),
        isNull(tasks.parentTaskId),
      ),
    )
    .orderBy(asc(tasks.createdAt));
  const activeIds = new Set(active.map((p) => p.id));
  const resting = (t: (typeof open)[number]) => !!t.projectId && !activeIds.has(t.projectId);
  const topItem = focusList(
    open.filter((t) => !resting(t)),
    views,
    today,
  )[0]?.task;
  // Waiting tasks (D32) are someone else's move: no quests about them.
  const live = open.filter((t) => !resting(t) && t.status !== 'waiting');

  const openGoals = new Map(
    (
      await tx
        .select({ projectId: goals.projectId, n: sql<number>`count(*)::int` })
        .from(goals)
        .where(and(eq(goals.userId, userId), isNull(goals.deletedAt), eq(goals.status, 'open')))
        .groupBy(goals.projectId)
    ).map((g) => [g.projectId, g.n]),
  );
  const pending = await tx
    .select({ projectId: questInstances.projectId })
    .from(questInstances)
    .where(
      and(
        eq(questInstances.userId, userId),
        eq(questInstances.type, 'followup'),
        eq(questInstances.status, 'offered'),
      ),
    );
  const [lastFocus] = await tx
    .select({ id: focusSessions.id, note: focusSessions.note, minutes: focusSessions.minutes })
    .from(focusSessions)
    .where(and(eq(focusSessions.userId, userId), eq(focusSessions.status, 'completed')))
    .orderBy(sql`${focusSessions.startedAt} desc`)
    .limit(1);
  const onBoard = await notesOnBoard(tx, userId);
  const [yesterdayRows, inbox] = [
    await tx
      .select({ template: questInstances.template })
      .from(questInstances)
      .where(
        and(
          eq(questInstances.userId, userId),
          eq(questInstances.type, 'daily'),
          eq(questInstances.periodStart, addDays(today, -1)),
        ),
      ),
    open.filter((t) => t.projectId === null),
  ];

  // Open goals of active projects, for project quests (D45).
  const goalRows = await tx
    .select()
    .from(goals)
    .where(
      and(
        eq(goals.userId, userId),
        isNull(goals.deletedAt),
        eq(goals.status, 'open'),
        inArray(goals.projectId, active.length ? active.map((p) => p.id) : ['']),
      ),
    );
  const goalTasks = new Map(
    (
      await tx
        .select({ goalId: tasks.goalId, n: sql<number>`count(*)::int` })
        .from(tasks)
        .where(
          and(
            eq(tasks.userId, userId),
            isNull(tasks.deletedAt),
            isNull(tasks.completedAt),
            sql`${tasks.goalId} is not null`,
          ),
        )
        .groupBy(tasks.goalId)
    ).map((r) => [r.goalId!, r.n]),
  );
  const goalCandidates = (await goalViews(tx, userId, goalRows)).map((g) => {
    const end = g.dueDate ? (g.duePrecision === 'month' ? monthEnd(g.dueDate) : g.dueDate) : null;
    const pace = g.numbers?.pace;
    const remaining = g.numbers ? g.numbers.target - g.numbers.current : 0;
    return {
      id: g.id,
      title: g.title,
      daysWaiting: waiting(g.id, g.createdAt),
      kind: g.kind,
      daysLeft: end ? Math.max(0, daysBetween(today, end) + 1) : null,
      openTasks: goalTasks.get(g.id) ?? 0,
      weekMinutes:
        g.kind === 'time' && g.targetMinutes
          ? g.period === 'week'
            ? g.targetMinutes
            : Math.round((g.targetMinutes * 7) / 30)
          : null,
      current: g.numbers && !g.numbers.met ? g.numbers.current : null,
      weekPace: pace
        ? Math.min(remaining, pace.per === 'week' ? pace.amount : pace.amount * 7)
        : null,
    };
  });

  const staleSince = addDays(today, -QUESTS.staleProjectDays);
  const commitments = (await todayCommitments(tx, userId, today)).filter((c) => c.scheduled);
  return {
    today,
    resting: (s.quest.restingTypes ?? []) as QuestType[],
    idleDays,
    yesterday: yesterdayRows.map((r) => r.template as QuestTemplate),
    top: topItem
      ? {
          id: topItem.id,
          title: topItem.title,
          daysWaiting: waiting(topItem.id, topItem.createdAt),
        }
      : null,
    nextActions: active
      .filter((p) => p.nextAction)
      .map((p) => ({
        id: p.nextAction!.id,
        title: p.nextAction!.title,
        projectId: p.id,
        projectTitle: p.title,
        daysWaiting: waiting(p.id, p.createdAt),
      })),
    staleProjects: active
      .filter((p) => p.counts.open > 0)
      .filter((p) => {
        const lastTouch =
          touched.get(p.id) ??
          userDay(p.createdAt, { timeZone: s.timeZone, dayStartHour: s.dayStartHour });
        return lastTouch <= staleSince;
      })
      .map((p) => ({ id: p.id, title: p.title, daysWaiting: waiting(p.id, p.createdAt) })),
    hasLargeTask: live.some((t) => t.effort === 'L'),
    taskDays: recent.map((d) => d.tasks),
    focusDays: recent.map((d) => d.minutes),
    focusWeeks: [...weeks.values()].filter((m) => m > 0),
    timeRange: { min: s.quest.timeQuestMinMinutes, max: s.quest.timeQuestMaxMinutes },
    weeklyTarget: s.weeklyTarget,
    activeProjects: active.map((p) => ({
      id: p.id,
      title: p.title,
      daysWaiting: waiting(p.id, p.createdAt),
      openTasks: p.counts.open,
      openGoals: openGoals.get(p.id) ?? 0,
      undetailed: pending.filter((f) => f.projectId === p.id).length,
    })),
    breakable: live
      .filter((t) => t.projectId && t.subtasks === 0 && (t.effort === 'L' || t.effort === 'M'))
      .map((t) => ({
        id: t.id,
        title: t.title,
        projectId: t.projectId!,
        daysWaiting: waiting(t.id, t.createdAt),
      })),
    pendingFollowups: pending.length,
    inboxOpen: inbox.length,
    unpinnedProjects: active
      .filter((p) => p.counts.open > 0 && !p.nextActionTaskId)
      .map((p) => ({ id: p.id, title: p.title, daysWaiting: waiting(p.id, p.createdAt) })),
    noEffortTasks: live
      .filter((t) => t.effort === null)
      .slice(0, 30)
      .map((t) => ({ id: t.id, title: t.title, daysWaiting: waiting(t.id, t.createdAt) })),
    lastFocusWithoutNote:
      lastFocus && !lastFocus.note && (lastFocus.minutes ?? 0) > 0 ? { id: lastFocus.id } : null,
    // All of today's, sized as one ask, while any is still to do.
    commitmentsDue: commitments.some((c) => c.due) ? commitments.length : 0,
    notesOnBoard: onBoard,
    parkedProjects: views
      .filter((p) => p.status === 'parked')
      .map((p) => {
        const since = [p.statusChangedAt, p.reviewedAt]
          .filter((d): d is Date => !!d)
          .sort((a, b) => b.getTime() - a.getTime())[0]!;
        return { id: p.id, title: p.title, daysWaiting: waiting(p.id, since) };
      }),
    goals: goalCandidates,
  };
}

// --- Making boards ---------------------------------------------------------------------------

async function insertSpecs(
  tx: Tx,
  userId: string,
  specs: QuestSpec[],
  period: { start: DateString; end: DateString },
  extra: Partial<typeof questInstances.$inferInsert> = {},
) {
  if (!specs.length) return [];
  const now = new Date();
  const rows = specs.map((q) => ({
    id: newId('quest'),
    userId,
    type: q.type,
    template: q.template,
    periodStart: period.start,
    periodEnd: period.end,
    target: q.target,
    xp: q.xp,
    tier: QUESTS.tier[q.type],
    taskId: q.taskId ?? null,
    projectId: q.projectId ?? null,
    goalId: q.goalId ?? null,
    focusSessionId: q.focusSessionId ?? null,
    missing: q.missing ?? null,
    offeredAt: now,
    ...extra,
  }));
  await tx.insert(questInstances).values(rows);
  return rows;
}

const specOf = (q: QuestRow): QuestSpec => ({
  type: q.type,
  template: q.template as QuestTemplate,
  target: q.target,
  xp: q.xp,
  taskId: q.taskId ?? undefined,
  projectId: q.projectId ?? undefined,
  goalId: q.goalId ?? undefined,
  focusSessionId: q.focusSessionId ?? undefined,
});

/** Expire what's past, and make today's board and this week's quests if they aren't made yet. */
async function ensureBoards(tx: Tx, userId: string, s: QuestSettingsRow, today: DateString) {
  await tx
    .update(questInstances)
    .set({ status: 'expired', closedAt: new Date() })
    .where(
      and(
        eq(questInstances.userId, userId),
        eq(questInstances.status, 'offered'),
        sql`${questInstances.periodEnd} < ${today}`,
      ),
    );
  const weekStart = startOfWeek(today, s.weekStart);
  const made = await tx
    .select({ type: questInstances.type, periodStart: questInstances.periodStart })
    .from(questInstances)
    .where(
      and(
        eq(questInstances.userId, userId),
        inArray(questInstances.periodStart, [today, weekStart]),
      ),
    );
  const dailyMade = made.some((m) => m.periodStart === today && DAILY_BOARD_TYPES.includes(m.type));
  const weeklyMade = made.some(
    (m) => m.periodStart === weekStart && WEEKLY_BOARD_TYPES.includes(m.type),
  );
  if (dailyMade && weeklyMade) return;
  const input = await gatherInput(tx, userId, s, today);
  if (!dailyMade) await insertSpecs(tx, userId, planDaily(input), { start: today, end: today });
  if (!weeklyMade) {
    await insertSpecs(tx, userId, planWeekly(input), {
      start: weekStart,
      end: addDays(weekStart, 6),
    });
  }
}

// --- Evaluating ------------------------------------------------------------------------------

type Progress = number | 'cancel';

const since = (q: QuestRow) => sql`${activity.occurredAt} >= ${q.offeredAt}`;

async function count(tx: Tx, where: ReturnType<typeof and>) {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(activity)
    .where(where);
  return row?.n ?? 0;
}

async function focusMinutes(tx: Tx, userId: string, from: DateString, to: DateString) {
  const [row] = await tx
    .select({ m: sql<number>`coalesce(sum((${activity.payload}->>'minutes')::int), 0)::int` })
    .from(activity)
    .where(
      and(
        eq(activity.userId, userId),
        eq(activity.type, 'focus_completed'),
        gte(activity.localDate, from),
        lte(activity.localDate, to),
      ),
    );
  return row?.m ?? 0;
}

async function activeProject(tx: Tx, userId: string, id: string | null) {
  if (!id) return null;
  const [p] = await tx
    .select({
      id: projects.id,
      status: projects.status,
      nextActionTaskId: projects.nextActionTaskId,
    })
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)));
  return p?.status === 'active' ? p : null;
}

async function liveTask(tx: Tx, userId: string, id: string | null) {
  if (!id) return null;
  const [t] = await tx
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId), isNull(tasks.deletedAt)));
  return t ?? null;
}

async function taskMissing(tx: Tx, t: typeof tasks.$inferSelect): Promise<DetailPart[]> {
  const [sub] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(eq(tasks.parentTaskId, t.id), isNull(tasks.deletedAt)));
  return missingTaskParts({ ...t, subtasks: sub?.n ?? 0, inProject: t.projectId !== null });
}

async function goalMissing(tx: Tx, g: typeof goals.$inferSelect): Promise<DetailPart[]> {
  const [n] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(eq(tasks.goalId, g.id), isNull(tasks.deletedAt)));
  return missingGoalParts({ ...g, tasks: n?.n ?? 0 });
}

/** A quest's progress now, or `cancel` when what it's about is gone (deleted, parked). */
async function progressOf(tx: Tx, userId: string, q: QuestRow): Promise<Progress> {
  const mine = eq(activity.userId, userId);
  const on = (day: DateString) => eq(activity.localDate, day);
  const template = q.template as QuestTemplate;
  switch (template) {
    case 'top_item':
    case 'next_action':
    case 'large_task':
    case 'stale_project': {
      if (template === 'stale_project' && !(await activeProject(tx, userId, q.projectId)))
        return 'cancel';
      if ((template === 'top_item' || template === 'next_action') && !q.taskId) return 'cancel';
      const where =
        template === 'stale_project'
          ? sql`${activity.payload}->>'projectId' = ${q.projectId}`
          : template === 'large_task'
            ? sql`${activity.payload}->>'effort' = 'L' and ${activity.localDate} = ${q.periodStart}`
            : eq(activity.entityId, q.taskId!);
      const done = await count(tx, and(mine, eq(activity.type, 'task_completed'), since(q), where));
      if (done) return 1;
      if (
        template !== 'large_task' &&
        template !== 'stale_project' &&
        !(await liveTask(tx, userId, q.taskId))
      ) {
        return 'cancel';
      }
      return 0;
    }
    case 'tasks_n': {
      const [row] = await tx
        .select({ n: sql<number>`count(distinct ${activity.entityId})::int` })
        .from(activity)
        .where(
          and(
            mine,
            eq(activity.type, 'task_completed'),
            on(q.periodStart),
            sql`coalesce((${activity.payload}->>'subtask')::boolean, false) = false`,
          ),
        );
      return row?.n ?? 0;
    }
    case 'focus_sessions':
      return count(tx, and(mine, eq(activity.type, 'focus_completed'), on(q.periodStart)));
    case 'focus_today':
      return focusMinutes(tx, userId, q.periodStart, q.periodStart);
    case 'week_focus':
      return focusMinutes(tx, userId, q.periodStart, q.periodEnd);
    case 'triage':
      return Math.min(
        1,
        await count(
          tx,
          and(
            mine,
            since(q),
            sql`(${activity.type} = 'task_triaged' or (${activity.type} = 'task_completed'
              and ${activity.payload}->>'projectId' is null
              and coalesce((${activity.payload}->>'subtask')::boolean, false) = false))`,
          ),
        ),
      );
    case 'pin_next': {
      const p = await activeProject(tx, userId, q.projectId);
      if (!p) return 'cancel';
      return p.nextActionTaskId ? 1 : 0;
    }
    case 'effort': {
      const t = await liveTask(tx, userId, q.taskId);
      if (!t || t.completedAt) return t?.effort ? 1 : 'cancel';
      return t.effort ? 1 : 0;
    }
    case 'log_commitment':
      return Math.min(
        1,
        await count(tx, and(mine, eq(activity.type, 'commitment_logged'), since(q))),
      );
    case 'sort_notes':
      return Math.min(
        q.target,
        await count(tx, and(mine, eq(activity.type, 'note_sorted'), since(q))),
      );
    case 'commitments_due': {
      // Today's scheduled ones, each met (or a weekly check ticked today). All of them completes
      // it, however many there are now; none left (archived, parked) cancels it.
      const all = (await todayCommitments(tx, userId, q.periodStart)).filter((c) => c.scheduled);
      if (!all.length) return 'cancel';
      const done = all.filter((c) => !c.due).length;
      return done === all.length ? q.target : Math.min(done, q.target - 1);
    }
    case 'focus_note': {
      if (!q.focusSessionId) return 'cancel';
      const [f] = await tx
        .select({ note: focusSessions.note })
        .from(focusSessions)
        .where(eq(focusSessions.id, q.focusSessionId));
      return f?.note ? 1 : 0;
    }
    case 'add_task':
    case 'add_goal': {
      if (!(await activeProject(tx, userId, q.projectId))) return 'cancel';
      return (await madeItem(tx, userId, q)) ? 1 : 0;
    }
    case 'subtasks': {
      const t = await liveTask(tx, userId, q.taskId);
      if (!t) return 'cancel';
      const [row] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(tasks)
        .where(
          and(
            eq(tasks.parentTaskId, t.id),
            isNull(tasks.deletedAt),
            sql`${tasks.createdAt} >= ${q.offeredAt}`,
          ),
        );
      return row?.n ?? 0;
    }
    case 'task_details': {
      const t = await liveTask(tx, userId, q.taskId);
      if (!t) return 'cancel';
      return partsFilled(q.missing ?? [], await taskMissing(tx, t));
    }
    case 'goal_details': {
      if (!q.goalId) return 'cancel';
      const [g] = await tx
        .select()
        .from(goals)
        .where(and(eq(goals.id, q.goalId), eq(goals.userId, userId), isNull(goals.deletedAt)));
      if (!g) return 'cancel';
      return partsFilled(q.missing ?? [], await goalMissing(tx, g));
    }
    case 'week_target': {
      const [row] = await tx
        .select({ n: sql<number>`count(distinct ${activity.localDate})::int` })
        .from(activity)
        .where(
          and(
            mine,
            activeDayWhere(),
            gte(activity.localDate, q.periodStart),
            lte(activity.localDate, q.periodEnd),
          ),
        );
      return row?.n ?? 0;
    }
    case 'week_projects': {
      const rows = rowsOf<{ n: number }>(
        await tx.execute(sql`
          select count(distinct a.payload->>'projectId')::int as n
          from activity a join projects p on p.id = a.payload->>'projectId'
          where a.user_id = ${userId} and p.status = 'active'
            and a.type in ('task_completed', 'focus_completed')
            and a.local_date between ${q.periodStart} and ${q.periodEnd}`),
      );
      return Math.min(q.target, rows[0]?.n ?? 0);
    }
    case 'comeback':
      return Math.min(1, await count(tx, and(mine, activeDayWhere(), on(q.periodStart))));
    case 'weekly_review':
      return Math.min(
        1,
        await count(tx, and(mine, eq(activity.type, 'review_completed'), since(q))),
      );
    case 'revisit_parked': {
      if (!q.projectId) return 'cancel';
      const [p] = await tx
        .select({
          status: projects.status,
          statusChangedAt: projects.statusChangedAt,
          reviewedAt: projects.reviewedAt,
        })
        .from(projects)
        .where(and(eq(projects.id, q.projectId), eq(projects.userId, userId)));
      if (!p) return 'cancel';
      const after = (d: Date | null) => !!d && d >= q.offeredAt;
      return after(p.reviewedAt) || after(p.statusChangedAt) ? 1 : 0;
    }
    case 'goal_tasks':
    case 'time_goal':
    case 'number_goal': {
      const g = await openGoal(tx, userId, q.goalId);
      if (!g) return 'cancel';
      if (template === 'goal_tasks') {
        const rows = rowsOf<{ n: number }>(
          await tx.execute(sql`
            select count(distinct a.entity_id)::int as n
            from activity a join tasks t on t.id = a.entity_id
            where a.user_id = ${userId} and a.type = 'task_completed'
              and a.occurred_at >= ${q.offeredAt} and t.goal_id = ${g.id}
              and t.completed_at is not null`),
        );
        return rows[0]?.n ?? 0;
      }
      if (template === 'time_goal') {
        const [row] = await tx
          .select({ m: sql<number>`coalesce(sum((${activity.payload}->>'minutes')::int), 0)::int` })
          .from(activity)
          .where(
            and(
              mine,
              eq(activity.type, 'focus_completed'),
              sql`${activity.payload}->>'projectId' = ${g.projectId}`,
              gte(activity.localDate, q.periodStart),
              lte(activity.localDate, q.periodEnd),
            ),
          );
        return row?.m ?? 0;
      }
      const [view] = await goalViews(tx, userId, [g]);
      return view?.numbers?.current ?? 0;
    }
  }
}

/** A goal a project quest is about, while it's open (achieved still counts: it was reached). */
async function openGoal(tx: Tx, userId: string, id: string | null) {
  if (!id) return null;
  const [g] = await tx
    .select()
    .from(goals)
    .where(and(eq(goals.id, id), eq(goals.userId, userId), isNull(goals.deletedAt)));
  return g && g.status !== 'dropped' ? g : null;
}

/** What a make quest made: the first task (or goal) created in its project since it was offered. */
async function madeItem(tx: Tx, userId: string, q: QuestRow) {
  if (!q.projectId) return null;
  if (q.template === 'add_goal') {
    const [g] = await tx
      .select()
      .from(goals)
      .where(
        and(
          eq(goals.userId, userId),
          eq(goals.projectId, q.projectId),
          isNull(goals.deletedAt),
          sql`${goals.createdAt} >= ${q.offeredAt}`,
        ),
      )
      .orderBy(asc(goals.createdAt))
      .limit(1);
    return g ? ({ kind: 'goal', row: g } as const) : null;
  }
  const [t] = await tx
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        eq(tasks.projectId, q.projectId),
        isNull(tasks.parentTaskId),
        isNull(tasks.deletedAt),
        sql`${tasks.createdAt} >= ${q.offeredAt}`,
      ),
    )
    .orderBy(asc(tasks.createdAt))
    .limit(1);
  return t ? ({ kind: 'task', row: t } as const) : null;
}

/** The names quests mention (task, project and goal titles), by id. */
async function namesFor(tx: Tx, userId: string, rows: QuestRow[]) {
  const ids = (pick: (q: QuestRow) => string | null) => [
    ...new Set(rows.map(pick).filter((id): id is string => !!id)),
  ];
  const names = new Map<string, string>();
  const taskIds = ids((q) => q.taskId);
  const projectIds = ids((q) => q.projectId);
  const goalIds = ids((q) => q.goalId);
  if (taskIds.length) {
    for (const r of await tx
      .select({ id: tasks.id, title: tasks.title })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), inArray(tasks.id, taskIds)))) {
      names.set(r.id, r.title);
    }
  }
  if (projectIds.length) {
    for (const r of await tx
      .select({ id: projects.id, title: projects.title })
      .from(projects)
      .where(and(eq(projects.userId, userId), inArray(projects.id, projectIds)))) {
      names.set(r.id, r.title);
    }
  }
  if (goalIds.length) {
    for (const r of await tx
      .select({ id: goals.id, title: goals.title })
      .from(goals)
      .where(and(eq(goals.userId, userId), inArray(goals.id, goalIds)))) {
      names.set(r.id, r.title);
    }
  }
  return names;
}

/** Templates whose title names the project (the rest name their task or goal). */
const NAMES_PROJECT = new Set<string>([
  'stale_project',
  'pin_next',
  'add_task',
  'add_goal',
  'next_action',
  'revisit_parked',
]);

/** The title a quest shows, with today's names. */
function titleOf(q: QuestRow, names: Map<string, string>) {
  const id = NAMES_PROJECT.has(q.template) ? q.projectId : (q.goalId ?? q.taskId ?? q.projectId);
  return questTitle({
    template: q.template as QuestTemplate,
    target: q.target,
    name: id ? (names.get(id) ?? null) : null,
  });
}

async function complete(
  tx: Tx,
  userId: string,
  q: QuestRow,
  progress: number,
  names: Map<string, string>,
) {
  await tx
    .update(questInstances)
    .set({ status: 'completed', completedAt: new Date(), progress })
    .where(eq(questInstances.id, q.id));
  await logActivity(tx, userId, [
    { type: 'quest_completed', entityId: q.id, payload: { xp: q.xp, questType: q.type } },
  ]);
  noteGameEvent({
    type: 'quest_done',
    quest: {
      id: q.id,
      type: q.type,
      title: titleOf(q, names),
      xp: q.xp,
      tier: q.tier,
      big: QUESTS.big.includes(q.type),
    },
  });
}

/** A done make quest's follow-up: fill in what the new thing lacks (ends tomorrow). */
async function spawnFollowup(tx: Tx, userId: string, q: QuestRow, today: DateString) {
  if (q.template === 'subtasks') return;
  const made = await madeItem(tx, userId, q);
  if (!made) return;
  // One follow-up per thing, even if two make quests were met by it.
  const [pending] = await tx
    .select({ id: questInstances.id })
    .from(questInstances)
    .where(
      and(
        eq(questInstances.userId, userId),
        eq(questInstances.type, 'followup'),
        eq(questInstances.status, 'offered'),
        made.kind === 'task'
          ? eq(questInstances.taskId, made.row.id)
          : eq(questInstances.goalId, made.row.id),
      ),
    );
  if (pending) return;
  const missing =
    made.kind === 'task' ? await taskMissing(tx, made.row) : await goalMissing(tx, made.row);
  const target = followupTarget(missing);
  if (!target) return;
  await insertSpecs(
    tx,
    userId,
    [
      {
        type: 'followup',
        template: made.kind === 'task' ? 'task_details' : 'goal_details',
        target,
        xp: QUESTS.followup.xp,
        projectId: q.projectId ?? undefined,
        ...(made.kind === 'task' ? { taskId: made.row.id } : { goalId: made.row.id }),
        missing,
      },
    ],
    { start: today, end: addDays(today, 1) },
    { parentQuestId: q.id },
  );
}

/** After a quick quest: cancel the rest once 3 were rewarded today, or offer the next one. */
async function refillQuick(tx: Tx, userId: string, s: QuestSettingsRow, today: DateString) {
  const quick = await tx
    .select()
    .from(questInstances)
    .where(
      and(
        eq(questInstances.userId, userId),
        eq(questInstances.type, 'quick'),
        eq(questInstances.periodStart, today),
        inArray(questInstances.status, ['offered', 'completed']),
      ),
    );
  const done = quick.filter((q) => q.status === 'completed').length;
  const open = quick.filter((q) => q.status === 'offered');
  if (done >= QUESTS.quick.rewardedPerDay) {
    if (open.length) {
      await tx
        .update(questInstances)
        .set({ status: 'cancelled', closedAt: new Date() })
        .where(
          inArray(
            questInstances.id,
            open.map((q) => q.id),
          ),
        );
    }
    return;
  }
  const room = Math.min(
    QUESTS.quick.visible - open.length,
    QUESTS.quick.rewardedPerDay - done - open.length,
  );
  if (room <= 0) return;
  const input = await gatherInput(tx, userId, s, today);
  // Not the same template twice in a day.
  await insertSpecs(tx, userId, planQuick(input, room, Math.random, quick.map(specOf)), {
    start: today,
    end: today,
  });
}

/** The board bonus, once a day, when every daily quest is done. */
async function maybeBonus(tx: Tx, userId: string, today: DateString) {
  const daily = await tx
    .select({ status: questInstances.status })
    .from(questInstances)
    .where(
      and(
        eq(questInstances.userId, userId),
        eq(questInstances.type, 'daily'),
        eq(questInstances.periodStart, today),
        inArray(questInstances.status, ['offered', 'completed']),
      ),
    );
  if (!daily.length || daily.some((d) => d.status !== 'completed')) return;
  const key = `board:${today}`;
  const already = await count(
    tx,
    and(eq(activity.userId, userId), eq(activity.type, 'quest_bonus'), eq(activity.entityId, key)),
  );
  if (already) return;
  await logActivity(tx, userId, [
    { type: 'quest_bonus', entityId: key, payload: { xp: QUESTS.bonusXp } },
  ]);
  noteGameEvent({ type: 'board_done', xp: QUESTS.bonusXp });
}

/**
 * Evaluate the open quests the change can affect (`all`: every one), completing, cancelling and
 * spawning as needed. Runs in its own transaction, after the write (withGame).
 */
export async function evaluateQuests(userId: string, touches: readonly Touch[] | 'all') {
  await db.transaction(async (tx) => {
    await lock(tx, userId);
    const s = await questSettingsOf(tx, userId);
    const today = userDay(new Date(), s);
    await evaluateIn(tx, userId, s, today, touches);
  });
}

async function evaluateIn(
  tx: Tx,
  userId: string,
  s: QuestSettingsRow,
  today: DateString,
  touches: readonly Touch[] | 'all',
) {
  const open = (
    await tx
      .select()
      .from(questInstances)
      .where(
        and(
          eq(questInstances.userId, userId),
          eq(questInstances.status, 'offered'),
          lte(questInstances.periodStart, today),
          gte(questInstances.periodEnd, today),
        ),
      )
      .orderBy(asc(questInstances.offeredAt))
  ).filter(
    (q) =>
      touches === 'all' || TRIGGERS[q.template as QuestTemplate]?.some((t) => touches.includes(t)),
  );
  if (!open.length) return;
  const names = await namesFor(tx, userId, open);
  const completed: QuestRow[] = [];
  for (const q of open) {
    const progress = await progressOf(tx, userId, q);
    if (progress === 'cancel') {
      await tx
        .update(questInstances)
        .set({ status: 'cancelled', closedAt: new Date() })
        .where(eq(questInstances.id, q.id));
      continue;
    }
    if (progress >= q.target && q.target > 0) {
      await complete(tx, userId, q, Math.min(progress, q.target), names);
      completed.push(q);
    } else if (progress !== q.progress) {
      await tx.update(questInstances).set({ progress }).where(eq(questInstances.id, q.id));
    }
  }
  for (const q of completed) {
    if (q.type === 'make') await spawnFollowup(tx, userId, q, today);
  }
  if (completed.some((q) => q.type === 'quick')) await refillQuick(tx, userId, s, today);
  if (completed.some((q) => q.type === 'daily')) await maybeBonus(tx, userId, today);
}

// --- The board -------------------------------------------------------------------------------

const ORDER: QuestType[] = [
  'comeback',
  'daily',
  'time',
  'make',
  'followup',
  'quick',
  'weekly',
  'review',
  'project',
];

async function boardView(tx: Tx, userId: string, today: DateString) {
  const rows = await tx
    .select()
    .from(questInstances)
    .where(
      and(
        eq(questInstances.userId, userId),
        inArray(questInstances.status, ['offered', 'completed']),
        lte(questInstances.periodStart, today),
        gte(questInstances.periodEnd, today),
      ),
    )
    .orderBy(asc(questInstances.offeredAt));
  const names = await namesFor(tx, userId, rows);
  const rerolled = new Set(rows.map((r) => r.rerollOf).filter(Boolean));
  const quests = rows
    .map((q) => ({
      id: q.id,
      type: q.type,
      template: q.template as QuestTemplate,
      title: titleOf(q, names),
      hint: questHint(q.template as QuestTemplate, q.missing ?? undefined),
      status: q.status as 'offered' | 'completed',
      target: q.target,
      progress: q.status === 'completed' ? q.target : Math.min(q.progress, q.target),
      xp: q.xp,
      tier: q.tier,
      periodEnd: q.periodEnd,
      taskId: q.taskId,
      projectId: q.projectId,
      goalId: q.goalId,
      canReroll:
        q.status === 'offered' &&
        QUESTS.rerollable.includes(q.type) &&
        !q.rerollOf &&
        !rerolled.has(q.id) &&
        // A weekly quest's reroll is once a week; only the focus total has another size to offer.
        (q.type !== 'weekly' || q.template === 'week_focus'),
    }))
    .sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));
  const daily = quests.filter((q) => q.type === 'daily');
  const quickDone = quests.filter((q) => q.type === 'quick' && q.status === 'completed').length;
  const [bonus] = rowsOf<{ n: number }>(
    await tx.execute(
      sql`select count(*)::int as n from activity where user_id = ${userId} and type = 'quest_bonus' and entity_id = ${`board:${today}`}`,
    ),
  );
  return {
    today,
    quests,
    bonus: {
      xp: QUESTS.bonusXp,
      earned: (bonus?.n ?? 0) > 0,
      done: daily.filter((q) => q.status === 'completed').length,
      total: daily.length,
    },
    quick: { done: quickDone, max: QUESTS.quick.rewardedPerDay },
  };
}
export type QuestBoard = Awaited<ReturnType<typeof boardView>>;

/** The board: made on the day's first look, evaluated fully, then shown. */
export async function questBoard(userId: string) {
  return db.transaction(async (tx) => {
    await lock(tx, userId);
    const s = await questSettingsOf(tx, userId);
    const today = userDay(new Date(), s);
    await ensureBoards(tx, userId, s, today);
    await evaluateIn(tx, userId, s, today, 'all');
    return boardView(tx, userId, today);
  });
}

/** Trade a quest for another of its type: once per quest, for quests that allow it. */
export async function rerollQuest(userId: string, id: string) {
  return db.transaction(async (tx) => {
    await lock(tx, userId);
    const s = await questSettingsOf(tx, userId);
    const today = userDay(new Date(), s);
    const [q] = await tx
      .select()
      .from(questInstances)
      .where(and(eq(questInstances.id, id), eq(questInstances.userId, userId)));
    if (!q) throw notFound('quest');
    const [replaced] = await tx
      .select({ id: questInstances.id })
      .from(questInstances)
      .where(eq(questInstances.rerollOf, q.id));
    if (
      q.status !== 'offered' ||
      q.periodEnd < today ||
      !QUESTS.rerollable.includes(q.type) ||
      q.rerollOf ||
      replaced
    ) {
      throw conflict('no_reroll', 'This quest can’t be rerolled (once per quest).');
    }
    const board = await tx
      .select()
      .from(questInstances)
      .where(
        and(
          eq(questInstances.userId, userId),
          inArray(questInstances.status, ['offered', 'completed']),
          eq(questInstances.periodStart, q.periodStart),
        ),
      );
    const input = await gatherInput(tx, userId, s, today);
    const next = planReroll(specOf(q), input, board.map(specOf));
    if (!next)
      throw conflict('no_reroll', 'Nothing else fits right now. Keep this one, or skip it.');
    await tx
      .update(questInstances)
      .set({ status: 'rerolled', closedAt: new Date() })
      .where(eq(questInstances.id, q.id));
    await insertSpecs(
      tx,
      userId,
      [next],
      { start: q.periodStart, end: q.periodEnd },
      { rerollOf: q.id },
    );
    await evaluateIn(tx, userId, s, today, 'all');
    return boardView(tx, userId, today);
  });
}
