// Stats read from the activity log (plan.md §4.7). Phase 3: the contribution heatmap.

import type { HeatmapQuery } from '@streakatron/shared/schemas';
import { addDays, userDay } from '@streakatron/shared/time';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { userSettings } from '../db/schema';
import { activeDaySql } from './game';

/** The heatmap's span when none is asked for: a year, to today. */
export const HEATMAP_DAYS = 371;

/** Per day with any activity: active or not, XP, tasks completed and focus minutes. */
export async function heatmap(userId: string, q: HeatmapQuery) {
  const [s] = await db
    .select({ timeZone: userSettings.timezone, dayStartHour: userSettings.dayStartHour })
    .from(userSettings)
    .where(eq(userSettings.userId, userId));
  const today = userDay(new Date(), s!);
  const to = q.to ?? today;
  const from = q.from ?? addDays(to, -(HEATMAP_DAYS - 1));
  const res = await db.execute(sql`
    select local_date::text as date,
      coalesce(sum(xp), 0)::int as xp,
      count(distinct entity_id) filter (
        where type = 'task_completed' and coalesce((payload->>'subtask')::boolean, false) = false
      )::int as tasks,
      coalesce(sum((payload->>'minutes')::int) filter (where type = 'focus_completed'), 0)::int as minutes,
      bool_or(${activeDaySql()}) as active
    from activity
    where user_id = ${userId} and local_date between ${from} and ${to}
    group by local_date
    order by local_date`);
  const days = res.rows as {
    date: string;
    xp: number;
    tasks: number;
    minutes: number;
    active: boolean;
  }[];
  return { from, to, today, days };
}
