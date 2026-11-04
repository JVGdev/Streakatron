// The append-only activity log the game is derived from (D8). Rows are only ever inserted; the one
// column rewritten is `xp`, a cache of what the game rules award, which admin recompute replays.

import { ACTIVITY_TYPES, type ActivityPayload } from '@streakatron/shared/game';
import { sql } from 'drizzle-orm';
import { check, date, index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { timestamps } from './columns';

export const activity = pgTable(
  'activity',
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text({ enum: ACTIVITY_TYPES }).notNull(),
    /** What it's about (a task…). No foreign key: the log outlives what it mentions. */
    entityId: text(),
    occurredAt: timestamp({ withTimezone: true }).notNull(),
    /** The user's day when it happened (time zone + day start then), never re-dated. */
    localDate: date({ mode: 'string' }).notNull(),
    payload: jsonb().$type<ActivityPayload>().notNull().default({}),
    /** XP the game rules awarded it (derived; recompute rewrites it). */
    xp: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index().on(t.userId, t.localDate),
    index().on(t.userId, t.type, t.entityId),
    check('activity_xp', sql`${t.xp} >= 0`),
  ],
);
