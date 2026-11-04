// Focus sessions (plan.md §4.4): timed work blocks, optionally on a task or a project. The timer's
// state lives here, so a session survives reloads and other devices; the shared rules
// (`@streakatron/shared/focus`) read focus time from these columns. One open session per user.

import { FOCUS_LIMITS, FOCUS_STATUSES } from '@streakatron/shared/focus';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { timestamps } from './columns';
import { projects, tasks } from './structure';

const { plannedMinutes, breakMinutes, noteLength } = FOCUS_LIMITS;

export const focusSessions = pgTable(
  'focus_sessions',
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    taskId: text().references(() => tasks.id, { onDelete: 'set null' }),
    /** The project worked on: the one picked, or the task's when the session started. */
    projectId: text().references(() => projects.id, { onDelete: 'set null' }),
    status: text({ enum: FOCUS_STATUSES }).notNull(),
    plannedMinutes: smallint().notNull(),
    /** The break the preset suggests afterwards (the break itself isn't stored). */
    breakMinutes: smallint().notNull().default(0),
    startedAt: timestamp({ withTimezone: true }).notNull(),
    /** Pauses that are over. */
    pausedMs: integer().notNull().default(0),
    /** When the open pause began (paused sessions only). */
    pausedAt: timestamp({ withTimezone: true }),
    endedAt: timestamp({ withTimezone: true }),
    /** Minutes credited when it completed. */
    minutes: smallint(),
    note: text(),
    ...timestamps,
  },
  (t) => [
    index().on(t.userId, t.startedAt),
    uniqueIndex('focus_sessions_one_open')
      .on(t.userId)
      .where(sql`${t.status} in ('running', 'paused')`),
    check(
      'focus_sessions_planned',
      sql`${t.plannedMinutes} between ${sql.raw(String(plannedMinutes.min))} and ${sql.raw(String(plannedMinutes.max))}`,
    ),
    check(
      'focus_sessions_break',
      sql`${t.breakMinutes} between ${sql.raw(String(breakMinutes.min))} and ${sql.raw(String(breakMinutes.max))}`,
    ),
    check('focus_sessions_paused_ms', sql`${t.pausedMs} >= 0`),
    check(
      'focus_sessions_shape',
      sql`(${t.status} in ('running', 'paused')) = (${t.endedAt} is null)
        and (${t.status} = 'paused') = (${t.pausedAt} is not null)
        and (${t.status} = 'completed') = (${t.minutes} is not null)`,
    ),
    check('focus_sessions_note', sql`char_length(${t.note}) <= ${sql.raw(String(noteLength))}`),
  ],
);
