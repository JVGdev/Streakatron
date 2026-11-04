// Commitments (D31, plan.md §4.6): routines measured as done / an amount / minutes, per day or per
// week, and the entries that fill them. The rules (`@streakatron/shared/commitments`) read entries
// summed per day; one check a day is enforced by the service, which locks the commitment row.

import {
  COMMITMENT_MEASURES,
  COMMITMENT_PERIODS,
  ENTRY_SOURCES,
  type CommitmentSchedule,
} from '@streakatron/shared/commitments';
import type { RichDoc } from '@streakatron/shared/rich';
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
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { timestamps } from './columns';
import { focusSessions } from './focus';
import { projects } from './structure';

const userId = () =>
  text()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });

const oneOf = (column: AnyPgColumn, values: readonly string[]) =>
  sql`${column} in (${sql.join(
    values.map((v) => sql.raw(`'${v}'`)),
    sql`, `,
  )})`;

export const commitments = pgTable(
  'commitments',
  {
    id: text().primaryKey(),
    userId: userId(),
    /** Optional; deleting the project deletes them (they go into its snapshot). */
    projectId: text().references(() => projects.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    description: jsonb().$type<RichDoc>(),
    descriptionText: text().notNull().default(''),
    measure: text({ enum: COMMITMENT_MEASURES }).notNull(),
    target: integer().notNull(),
    /** Amounts only ("cards"). */
    unit: text(),
    period: text({ enum: COMMITMENT_PERIODS }).notNull(),
    /** Day commitments: the weekdays; null is every day (and always null for weeks). */
    schedule: jsonb().$type<CommitmentSchedule>(),
    sortOrder: integer().notNull().default(0),
    archivedAt: timestamp({ withTimezone: true }),
    /** Soft delete: undoable, purged after 30 days. */
    deletedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index().on(t.userId, t.sortOrder),
    index().on(t.projectId),
    check('commitments_measure', oneOf(t.measure, COMMITMENT_MEASURES)),
    check('commitments_period', oneOf(t.period, COMMITMENT_PERIODS)),
    check(
      'commitments_shape',
      sql`${t.target} >= 1
        and (${t.measure} <> 'check' or ${t.period} <> 'day' or ${t.target} = 1)
        and (${t.unit} is null or ${t.measure} = 'count')
        and (${t.schedule} is null or ${t.period} = 'day')`,
    ),
  ],
);

export const commitmentEntries = pgTable(
  'commitment_entries',
  {
    id: text().primaryKey(),
    userId: userId(),
    commitmentId: text()
      .notNull()
      .references(() => commitments.id, { onDelete: 'cascade' }),
    /** The user's day it counts for (time zone + day start when logged), never re-dated. */
    localDate: date({ mode: 'string' }).notNull(),
    /** A check is 1; otherwise the amount or minutes. */
    amount: integer().notNull(),
    source: text({ enum: ENTRY_SOURCES }).notNull().default('manual'),
    focusSessionId: text().references(() => focusSessions.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    index().on(t.commitmentId, t.localDate),
    index().on(t.userId, t.localDate),
    // A session fills its commitment once (minutes on finish, or its "Mark done" / "+1").
    uniqueIndex('commitment_entries_one_per_session')
      .on(t.focusSessionId)
      .where(sql`${t.focusSessionId} is not null`),
    check('commitment_entries_amount', sql`${t.amount} >= 1`),
    check('commitment_entries_source', oneOf(t.source, ENTRY_SOURCES)),
  ],
);
