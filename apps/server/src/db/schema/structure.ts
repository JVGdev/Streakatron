// Areas → projects → goals and tasks, plus board columns and the snapshots kept when a project or
// area is deleted. Every row has `user_id`; every query is scoped by it (D1).

import type { RichDoc } from '@streakatron/shared/rich';
import { SERIES_DATE_FIELDS, type TaskRepeat } from '@streakatron/shared/repeats';
import {
  COLORS,
  COLUMN_CATEGORIES,
  EFFORTS,
  GOAL_KINDS,
  GOAL_PERIODS,
  GOAL_STATUSES,
  ICONS,
  PROJECT_STATUSES,
} from '@streakatron/shared/structure';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { timestamps } from './columns';
import { commitments } from './commitments';

const userId = () =>
  text()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });

/** A rich-text field: TipTap JSON plus its plain text (search, previews). */
const rich = () => ({
  description: jsonb().$type<RichDoc>(),
  descriptionText: text().notNull().default(''),
});

const day = () => date({ mode: 'string' });

const oneOf = (column: AnyPgColumn, values: readonly string[]) =>
  sql`${column} in (${sql.join(
    values.map((v) => sql.raw(`'${v}'`)),
    sql`, `,
  )})`;

export const areas = pgTable(
  'areas',
  {
    id: text().primaryKey(),
    userId: userId(),
    title: text().notNull(),
    ...rich(),
    color: text({ enum: COLORS }).notNull().default('stone'),
    icon: text({ enum: ICONS }).notNull().default('folder'),
    sortOrder: integer().notNull().default(0),
    archivedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [index().on(t.userId, t.sortOrder)],
);

export const projects = pgTable(
  'projects',
  {
    id: text().primaryKey(),
    userId: userId(),
    areaId: text().references(() => areas.id, { onDelete: 'set null' }),
    title: text().notNull(),
    ...rich(),
    status: text({ enum: PROJECT_STATUSES }).notNull().default('active'),
    /** Required (D32: a course, an obligation): outside the active limit, never offered for parking. */
    required: boolean().notNull().default(false),
    statusChangedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Last looked at in a weekly review and kept as it is ("Keep parked", D45). */
    reviewedAt: timestamp({ withTimezone: true }),
    /** A pinned next action; null means the board decides (pickNextAction). */
    nextActionTaskId: text().references((): AnyPgColumn => tasks.id, { onDelete: 'set null' }),
    color: text({ enum: COLORS }).notNull().default('stone'),
    icon: text({ enum: ICONS }).notNull().default('folder'),
    startDate: day(),
    dueDate: day(),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index().on(t.userId, t.status),
    index().on(t.areaId),
    check('projects_status', oneOf(t.status, PROJECT_STATUSES)),
  ],
);

export const boardColumns = pgTable(
  'board_columns',
  {
    id: text().primaryKey(),
    userId: userId(),
    projectId: text()
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    category: text({ enum: COLUMN_CATEGORIES }).notNull(),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index().on(t.projectId, t.sortOrder),
    check('board_columns_category', oneOf(t.category, COLUMN_CATEGORIES)),
  ],
);

export const goals = pgTable(
  'goals',
  {
    id: text().primaryKey(),
    userId: userId(),
    projectId: text()
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    ...rich(),
    kind: text({ enum: GOAL_KINDS }).notNull(),
    /** Time goals: focus minutes per period. */
    targetMinutes: integer(),
    period: text({ enum: GOAL_PERIODS }),
    /** Number goals (D45): the target, its unit, and the part typed in. */
    targetCount: integer(),
    unit: text(),
    count: integer().notNull().default(0),
    /** Number goals: a commitment feeding it, counted from `commitmentFrom` (the day it was linked). */
    commitmentId: text().references((): AnyPgColumn => commitments.id, { onDelete: 'set null' }),
    commitmentFrom: day(),
    dueDate: day(),
    /** A month ("~July 2027", the due date is its first day) until the day is known (D32). */
    duePrecision: text({ enum: ['day', 'month'] })
      .notNull()
      .default('day'),
    status: text({ enum: GOAL_STATUSES }).notNull().default('open'),
    /** Featured on Today since then (D33); shown while the goal is open. */
    spotlightedAt: timestamp({ withTimezone: true }),
    sortOrder: integer().notNull().default(0),
    /** Soft delete: undoable, purged after 30 days. */
    deletedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index().on(t.projectId),
    check('goals_kind', oneOf(t.kind, GOAL_KINDS)),
    check('goals_status', oneOf(t.status, GOAL_STATUSES)),
    check(
      'goals_time_shape',
      sql`${t.kind} <> 'time' or (${t.targetMinutes} is not null and ${t.period} is not null)`,
    ),
    check('goals_number_shape', sql`${t.kind} <> 'number' or ${t.targetCount} is not null`),
    check('goals_count', sql`${t.count} >= 0`),
  ],
);

/**
 * A repeating task (D43): the rule its occurrences follow. Each occurrence is its own task, on
 * its series day (`tasks.series_date`).
 */
export const taskSeries = pgTable(
  'task_series',
  {
    id: text().primaryKey(),
    userId: userId(),
    repeat: jsonb().$type<TaskRepeat>().notNull(),
    /** The schedule's anchor: the day the rule counts from. */
    startDate: day().notNull(),
    /** The task date that holds an occurrence's day. */
    dateField: text({ enum: SERIES_DATE_FIELDS }).notNull().default('due'),
    /** "Doesn't repeat" since then: no more occurrences. */
    stoppedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('task_series_running')
      .on(t.userId)
      .where(sql`${t.stoppedAt} is null`),
    check('task_series_date_field', oneOf(t.dateField, SERIES_DATE_FIELDS)),
  ],
);

export const tasks = pgTable(
  'tasks',
  {
    id: text().primaryKey(),
    userId: userId(),
    /** null: the inbox. */
    projectId: text().references(() => projects.id, { onDelete: 'cascade' }),
    goalId: text().references(() => goals.id, { onDelete: 'set null' }),
    /** Subtasks (one level) belong to a top-level task of the same project. */
    parentTaskId: text().references((): AnyPgColumn => tasks.id, { onDelete: 'cascade' }),
    /** Top-level project tasks only; a column of the task's own project. */
    columnId: text().references(() => boardColumns.id, { onDelete: 'set null' }),
    title: text().notNull(),
    ...rich(),
    effort: text({ enum: EFFORTS }),
    dueDate: day(),
    scheduledDate: day(),
    sortOrder: integer().notNull().default(0),
    completedAt: timestamp({ withTimezone: true }),
    /** Featured on Today since then (D33); shown while the task is open. */
    spotlightedAt: timestamp({ withTimezone: true }),
    /** A reminder at this instant (D32, D38); sent once while the task is open. */
    remindAt: timestamp({ withTimezone: true }),
    /** An occurrence of a repeating task (D43), for its series day. */
    seriesId: text().references(() => taskSeries.id, { onDelete: 'set null' }),
    seriesDate: day(),
    /** The occurrence whose completion made this one (reopening it takes this one back). */
    followsTaskId: text().references((): AnyPgColumn => tasks.id, { onDelete: 'set null' }),
    /** Soft delete: undoable, purged after 30 days. */
    deletedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index().on(t.userId, t.projectId),
    uniqueIndex('tasks_series_day').on(t.seriesId, t.seriesDate),
    index().on(t.followsTaskId),
    index('tasks_remind_at')
      .on(t.remindAt)
      .where(sql`${t.remindAt} is not null`),
    index().on(t.columnId, t.sortOrder),
    index().on(t.parentTaskId),
    index().on(t.goalId),
    index().on(t.userId, t.dueDate),
    check('tasks_effort', sql`${t.effort} is null or ${oneOf(t.effort, EFFORTS)}`),
    check('tasks_not_own_parent', sql`${t.parentTaskId} is null or ${t.parentTaskId} <> ${t.id}`),
  ],
);

export const SNAPSHOT_KINDS = ['project', 'area'] as const;

/** What a deleted project or area looked like (with what went with it), restorable for 30 days. */
export const snapshots = pgTable(
  'snapshots',
  {
    id: text().primaryKey(),
    userId: userId(),
    kind: text({ enum: SNAPSHOT_KINDS }).notNull(),
    /** The deleted entity's id; no foreign key, since it's gone. */
    entityId: text().notNull(),
    title: text().notNull(),
    data: jsonb().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index().on(t.userId, t.createdAt), index().on(t.expiresAt)],
);
