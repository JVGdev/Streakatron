// Weekly reviews (D45): one per week, started from Today or the sidebar and finished with a
// reflection. Finishing logs `review_completed` (its XP once per week).

import type { RichDoc } from '@streakatron/shared/rich';
import { date, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { timestamps } from './columns';

export const weeklyReviews = pgTable(
  'weekly_reviews',
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The first day of the week it reviews (the user's week start). */
    weekStart: date({ mode: 'string' }).notNull(),
    reflection: jsonb().$type<RichDoc>(),
    reflectionText: text().notNull().default(''),
    completedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex().on(t.userId, t.weekStart)],
);
