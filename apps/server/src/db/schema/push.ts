// Web Push (D38): each device's subscription, what the reminder job already sent, and the server's
// VAPID keys (made on first use, kept in the database so backups carry them).

import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { timestamps } from './columns';

/** One per browser that turned notifications on; a push service answering 404/410 removes it. */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The push service URL; unique, so a browser that subscribes again replaces its row. */
    endpoint: text().notNull().unique(),
    p256dh: text().notNull(),
    auth: text().notNull(),
    /** "Chrome on Linux". */
    label: text().notNull(),
    lastSentAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [index().on(t.userId)],
);

/**
 * What the reminder job sent, so each reminder goes out once: `key` is the target and the instant
 * it was due (`cmt_…@2026-11-04T13:00:00.000Z`), or `streak@<day>`. Pruned after a few days.
 */
export const reminderLog = pgTable(
  'reminder_log',
  {
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    key: text().notNull(),
    sentAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] }), index().on(t.sentAt)],
);

/** Instance-wide keys (`vapid`). */
export const serverKeys = pgTable('server_keys', {
  name: text().primaryKey(),
  value: jsonb().notNull(),
  createdAt: timestamp({ withTimezone: true })
    .notNull()
    .default(sql`now()`),
});
