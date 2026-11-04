import { TIMEZONE_CHANGE_DAYS, type SettingsPatch } from '@streakatron/shared/schemas';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { users, userSettings } from '../db/schema';
import { HttpError } from '../http/errors';

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

/** Change settings. A new time zone is allowed once every `TIMEZONE_CHANGE_DAYS` (D17). */
export async function updateSettings(userId: string, patch: SettingsPatch) {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .for('update');
    if (!current) throw new HttpError(500, 'missing_settings', 'Your settings are missing.');
    const values: Partial<typeof userSettings.$inferInsert> = { ...patch };
    if (patch.timezone === undefined || patch.timezone === current.timezone) {
      delete values.timezone;
    } else {
      const now = new Date();
      const last = current.timezoneChangedAt;
      const next = last && new Date(last.getTime() + TIMEZONE_CHANGE_DAYS * 86_400_000);
      if (next && next > now) {
        throw new HttpError(
          429,
          'timezone_locked',
          `The time zone can change once a week. Next change: ${next.toISOString().slice(0, 10)}.`,
          { nextChangeAt: next.toISOString() },
        );
      }
      values.timezoneChangedAt = now;
    }
    if (Object.keys(values).length) {
      await tx.update(userSettings).set(values).where(eq(userSettings.userId, userId));
    }
    const [row] = await tx.select().from(userSettings).where(eq(userSettings.userId, userId));
    const { userId: _, createdAt: __, updatedAt: ___, ...settings } = row!;
    return settings;
  });
}
