import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { users, userSettings } from '../db/schema';

/** Whether any account exists yet (none: the app shows first-run setup). */
export async function hasAnyUser(): Promise<boolean> {
  const rows = await db.execute<{ exists: boolean }>(
    sql`select exists (select 1 from ${users}) as "exists"`,
  );
  return rows.rows[0]?.exists ?? false;
}

export async function getSettings(userId: string) {
  const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  return row ?? null;
}

/** The owner: the first account made. Used by jobs that run for the whole instance (backups). */
export async function getOwnerSettings() {
  const [row] = await db
    .select({ timezone: userSettings.timezone, dayStartHour: userSettings.dayStartHour })
    .from(users)
    .innerJoin(userSettings, eq(userSettings.userId, users.id))
    .orderBy(users.createdAt)
    .limit(1);
  return row ?? null;
}
