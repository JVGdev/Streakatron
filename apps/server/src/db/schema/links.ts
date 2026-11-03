// Mentions extracted from rich text (D4): one row per (source, field, target). Sources and targets
// are any linkable entity, so neither side is a foreign key: a mention of something deleted stays
// (it shows as a broken chip), and rows whose source is gone for good are purged (jobs/purge.ts).

import { index, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { timestamps } from './columns';

/** The rich-text fields mentions can be in. */
export const LINK_FIELDS = ['description'] as const;

export const links = pgTable(
  'links',
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sourceId: text().notNull(),
    sourceField: text({ enum: LINK_FIELDS }).notNull(),
    targetId: text().notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex().on(t.sourceId, t.sourceField, t.targetId),
    index().on(t.userId, t.targetId),
  ],
);
