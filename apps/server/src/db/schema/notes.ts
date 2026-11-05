// Notes (D42, D46): post-its on a freeform board, written from any page. A note written during a
// focus session (or its break) keeps the session and the minute. Sorting one turns it into an entry,
// adds it to a task or dismisses it: the note is soft-deleted, so Undo brings it back.

import type { RichDoc } from '@streakatron/shared/rich';
import { NOTE_COLORS } from '@streakatron/shared/notes';
import { sql } from 'drizzle-orm';
import {
  check,
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
import { focusSessions } from './focus';
import { projects } from './structure';

export const notes = pgTable(
  'notes',
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Its first line with text, kept with the text (mention chips, search, lists). */
    title: text().notNull().default(''),
    description: jsonb().$type<RichDoc>(),
    descriptionText: text().notNull().default(''),
    color: text({ enum: NOTE_COLORS }).notNull().default('yellow'),
    /** Optional; a deleted project leaves its notes on the board. */
    projectId: text().references(() => projects.id, { onDelete: 'set null' }),
    /** The focus session it was written in (or in the break after). */
    focusSessionId: text().references(() => focusSessions.id, { onDelete: 'set null' }),
    /** The minute of that session (null: written in its break). */
    focusMinute: smallint(),
    /** Its place on the board (board units, the post-it's top-left corner) and stacking order. */
    x: integer().notNull(),
    y: integer().notNull(),
    z: integer().notNull().default(0),
    /** Sorted or dismissed: undoable, purged after 30 days. */
    deletedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index().on(t.userId),
    index().on(t.focusSessionId),
    check(
      'notes_color',
      sql`${t.color} in (${sql.raw(NOTE_COLORS.map((c) => `'${c}'`).join(', '))})`,
    ),
    check('notes_minute', sql`${t.focusMinute} is null or ${t.focusMinute} >= 1`),
  ],
);
