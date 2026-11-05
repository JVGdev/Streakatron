// Calendar events (D39): one-off or repeating, on a day, a month ("~March 2027") or not dated yet;
// optionally with a time, a reminder and a project. Spotlighted ones count down on Today (D33).

import { DATE_PRECISIONS, type Repeat } from '@streakatron/shared/calendar';
import type { RichDoc } from '@streakatron/shared/rich';
import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { timestamps } from './columns';
import { projects } from './structure';

export const events = pgTable(
  'events',
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Optional; deleting the project deletes them (they go into its snapshot). */
    projectId: text().references(() => projects.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    description: jsonb().$type<RichDoc>(),
    descriptionText: text().notNull().default(''),
    /** The day, or the month's first day for a month; null while to be decided. */
    date: date({ mode: 'string' }),
    precision: text({ enum: DATE_PRECISIONS }).notNull().default('day'),
    /** Wall-clock `HH:MM` in the user's zone; null: all day. */
    startTime: text(),
    durationMinutes: smallint(),
    /** Day events only; checked by the shared rules. */
    repeat: jsonb().$type<Repeat>(),
    /** Minutes before the start (all-day: before 09:00); null: no reminder. */
    reminderMinutes: integer(),
    /** Counting down on Today since then (D33). */
    spotlightedAt: timestamp({ withTimezone: true }),
    /** Soft delete: undoable, purged after 30 days. */
    deletedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index().on(t.userId, t.date),
    index().on(t.projectId),
    index('events_reminders')
      .on(t.userId)
      .where(sql`${t.reminderMinutes} is not null and ${t.deletedAt} is null`),
    check(
      'events_precision',
      sql`${t.precision} in (${sql.raw(DATE_PRECISIONS.map((p) => `'${p}'`).join(', '))})`,
    ),
    check(
      'events_shape',
      sql`(${t.precision} = 'tbd') = (${t.date} is null)
        and (${t.precision} = 'day' or (${t.startTime} is null and ${t.repeat} is null and ${t.reminderMinutes} is null))
        and (${t.durationMinutes} is null or ${t.startTime} is not null)`,
    ),
  ],
);
