// Quest instances (plan.md §5, D10, D30): one row per quest offered, kept for good. Its status ends
// as completed, expired, rerolled or cancelled, so the rows are also the quest fit stats (offered /
// done / rerolled / expired by type). What a quest is about is an FK column per kind.

import {
  BOX_TIERS,
  QUEST_STATUSES,
  QUEST_TYPES,
  type DetailPart,
} from '@streakatron/shared/quests';
import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { timestamps } from './columns';
import { focusSessions } from './focus';
import { goals, projects, tasks } from './structure';

export const questInstances = pgTable(
  'quest_instances',
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text({ enum: QUEST_TYPES }).notNull(),
    template: text().notNull(),
    status: text({ enum: QUEST_STATUSES }).notNull().default('offered'),
    /** The days it can be done in (the user's days): one day, a week, or today and tomorrow. */
    periodStart: date({ mode: 'string' }).notNull(),
    periodEnd: date({ mode: 'string' }).notNull(),
    target: integer().notNull(),
    /** Progress when last evaluated (derived). */
    progress: integer().notNull().default(0),
    xp: integer().notNull(),
    tier: text({ enum: BOX_TIERS }).notNull(),
    taskId: text().references(() => tasks.id, { onDelete: 'set null' }),
    projectId: text().references(() => projects.id, { onDelete: 'set null' }),
    goalId: text().references(() => goals.id, { onDelete: 'set null' }),
    focusSessionId: text().references(() => focusSessions.id, { onDelete: 'set null' }),
    /** A follow-up's make quest. */
    parentQuestId: text().references((): AnyPgColumn => questInstances.id, {
      onDelete: 'set null',
    }),
    /** The quest this one replaced in a reroll (a replacement can't be rerolled again). */
    rerollOf: text().references((): AnyPgColumn => questInstances.id, { onDelete: 'set null' }),
    /** Follow-ups: the parts that were missing when it was offered. */
    missing: jsonb().$type<DetailPart[]>(),
    offeredAt: timestamp({ withTimezone: true }).notNull(),
    completedAt: timestamp({ withTimezone: true }),
    /** When it expired, was rerolled or was cancelled. */
    closedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index().on(t.userId, t.status),
    index().on(t.userId, t.periodStart),
    check('quest_instances_target', sql`${t.target} >= 0 and ${t.progress} >= 0 and ${t.xp} >= 0`),
    check(
      'quest_instances_shape',
      sql`(${t.status} = 'completed') = (${t.completedAt} is not null)
        and (${t.status} in ('expired', 'rerolled', 'cancelled')) = (${t.closedAt} is not null)
        and ${t.periodStart} <= ${t.periodEnd}`,
    ),
  ],
);
