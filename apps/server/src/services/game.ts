// The game, on the server (D17): activity is logged in the same transaction as the write that
// caused it (D8), with the XP the shared rules award; state and events are read from the log.
//
//   // in a service, inside its transaction:
//   await logActivity(tx, userId, [{ type: 'task_completed', entityId: id, payload }]);
//   // in a route, around the service call:
//   c.json(await withGame(userId, () => completeTask(userId, id)));   // → { ...result, game }
//
// `withGame` collects what was logged during the call (AsyncLocalStorage) and answers the events
// it caused. Reading the game never fails a committed write: errors are logged and `game` is null.

import { AsyncLocalStorage } from 'node:async_hooks';
import {
  countsAsActive,
  earnsOnce,
  foldXp,
  isTaskXp,
  gameEvents,
  gameState,
  sourceKey,
  xpFor,
  ACTIVE_DAY_TYPES,
  type ActivityPayload,
  type ActivityType,
  type GameEvent,
  type GameState,
} from '@streakatron/shared/game';
import { newId } from '@streakatron/shared/ids';
import { userDay, type DateString } from '@streakatron/shared/time';
import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { activity, userSettings } from '../db/schema';
import { HttpError } from '../http/errors';
import type { Conn, Tx } from './common';
import { evaluateQuests } from './quests';

export interface NewActivity {
  type: ActivityType;
  entityId: string | null;
  payload?: ActivityPayload;
  /** When it happened (default: now), e.g. when a focus session reached its cap unwatched. */
  occurredAt?: Date;
}

interface Logged {
  id: string;
  xp: number;
  localDate: DateString;
  type: ActivityType;
  payload: ActivityPayload;
}

interface Collected {
  logged: Logged[];
  /** Quest events (quests.ts), shown after the state's own. */
  quests: GameEvent[];
}

const collector = new AsyncLocalStorage<Collected>();

/** A quest event for the current `withGame` call's block (quests.ts). */
export function noteGameEvent(event: GameEvent) {
  collector.getStore()?.quests.push(event);
}

/** The user's day and week rules (time zone, day start, week start, weekly target). */
export async function daySettings(conn: Conn, userId: string) {
  const [row] = await conn
    .select({
      timeZone: userSettings.timezone,
      dayStartHour: userSettings.dayStartHour,
      weekStart: userSettings.weekStart,
      weeklyTarget: userSettings.weeklyActiveDayTarget,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId));
  if (!row) throw new HttpError(500, 'missing_settings', 'Your settings are missing.');
  return row;
}

/** Append to the log, awarding XP by the shared rules. Call inside the write's transaction. */
export async function logActivity(tx: Tx, userId: string, entries: NewActivity[]) {
  if (!entries.length) return;
  // One writer per user at a time, so the earn-once and soft-cap reads below can't race.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'activity:' + userId}))`);
  const settings = await daySettings(tx, userId);
  const now = new Date();

  const entities = entries.map((e) => e.entityId).filter((id): id is string => !!id);
  const earned = new Set(
    entities.length
      ? (
          await tx
            .selectDistinct({ type: activity.type, entityId: activity.entityId })
            .from(activity)
            .where(and(eq(activity.userId, userId), inArray(activity.entityId, entities)))
        ).map(sourceKey)
      : [],
  );
  // Task XP already earned per day (for the soft cap), read once per day it's needed.
  const taskXp = new Map<DateString, number>();
  const taskXpOn = async (localDate: DateString) => {
    if (!taskXp.has(localDate)) {
      const [day] = await tx
        .select({ xp: sql<number>`coalesce(sum(${activity.xp}), 0)::int` })
        .from(activity)
        .where(
          and(
            eq(activity.userId, userId),
            eq(activity.localDate, localDate),
            eq(activity.type, 'task_completed'),
          ),
        );
      taskXp.set(localDate, day?.xp ?? 0);
    }
    return taskXp.get(localDate)!;
  };

  const rows = [];
  for (const e of entries) {
    const occurredAt = e.occurredAt ?? now;
    const localDate = userDay(occurredAt, settings);
    const a = { type: e.type, entityId: e.entityId, localDate, payload: e.payload ?? {} };
    const key = sourceKey(a);
    const taskXpThatDay = isTaskXp(a) ? await taskXpOn(localDate) : 0;
    const xp = xpFor(a, { earnedBefore: earned.has(key), taskXpThatDay });
    if (earnsOnce(a)) earned.add(key);
    if (isTaskXp(a)) taskXp.set(localDate, taskXpThatDay + xp);
    rows.push({ id: newId('activity'), userId, occurredAt, ...a, xp });
  }
  await tx.insert(activity).values(rows);
  collector
    .getStore()
    ?.logged.push(
      ...rows.map(({ id, xp, type, localDate, payload }) => ({ id, xp, type, localDate, payload })),
    );
}

// --- Reading ---------------------------------------------------------------------------------

/**
 * Activity that makes its day active (`countsAsActive` as SQL): the always-active types, plus
 * entries on weekly commitments (D31).
 */
export const activeDayWhere = () =>
  or(
    inArray(activity.type, [...ACTIVE_DAY_TYPES]),
    and(eq(activity.type, 'commitment_logged'), sql`${activity.payload}->>'period' = 'week'`),
  );

/** The same, for raw SQL over `activity` (unqualified columns). */
export const activeDaySql = () =>
  sql`(type in (${sql.join(
    ACTIVE_DAY_TYPES.map((t) => sql`${t}`),
    sql`, `,
  )}) or (type = 'commitment_logged' and payload->>'period' = 'week'))`;

/** Total XP, and the days that were active (each with the ids of the activity that made them). */
async function readLog(userId: string) {
  const [total] = await db
    .select({ xp: sql<number>`coalesce(sum(${activity.xp}), 0)::int` })
    .from(activity)
    .where(eq(activity.userId, userId));
  const active = await db
    .select({ id: activity.id, localDate: activity.localDate })
    .from(activity)
    .where(and(eq(activity.userId, userId), activeDayWhere()));
  return { xp: total?.xp ?? 0, active };
}

export async function getGameState(userId: string, now = new Date()): Promise<GameState> {
  const settings = await daySettings(db, userId);
  const { xp, active } = await readLog(userId);
  return gameState(
    xp,
    active.map((a) => a.localDate),
    userDay(now, settings),
    settings,
  );
}

export interface GameBlock {
  events: GameEvent[];
  state: GameState;
}

/** The game block for what was logged: the state after, and what changed from before it. */
async function gameBlock(
  userId: string,
  logged: Logged[],
  questEvents: GameEvent[],
): Promise<GameBlock> {
  const settings = await daySettings(db, userId);
  const today = userDay(new Date(), settings);
  const { xp, active } = await readLog(userId);
  const fresh = new Set(logged.map((l) => l.id));
  const gained = logged.reduce((sum, l) => sum + l.xp, 0);
  const after = gameState(
    xp,
    active.map((a) => a.localDate),
    today,
    settings,
  );
  const before = gameState(
    xp - gained,
    active.filter((a) => !fresh.has(a.id)).map((a) => a.localDate),
    today,
    settings,
  );
  return { events: [...gameEvents(before, after), ...questEvents], state: after };
}

/** What a write touched, for the quests it can affect (D30); `all` re-reads every open quest. */
export type Touch = 'task' | 'focus' | 'goal' | 'project' | 'commitment' | 'review';

export interface WithGameOptions {
  touches?: readonly Touch[] | 'all';
}

/**
 * Run a write and add the `game` block for the activity it logged: `{ ...result, game }`. With
 * `touches`, the open quests that kind of change can affect are evaluated after the write commits
 * (their completions join the block). `game` is null when nothing was logged, or when reading the
 * game failed. Neither quest evaluation nor the game block ever fails the write (logged instead).
 */
export async function withGame<T extends object>(
  userId: string,
  write: () => Promise<T>,
  { touches }: WithGameOptions = {},
): Promise<T & { game: GameBlock | null }> {
  const store: Collected = { logged: [], quests: [] };
  const result = await collector.run(store, write);
  if (touches) {
    try {
      await collector.run(store, () => evaluateQuests(userId, touches));
    } catch (err) {
      console.error('quests: evaluating after a write failed', err);
    }
  }
  const { logged, quests } = store;
  if (!logged.length || !logged.some((l) => l.xp > 0 || countsAsActive(l.type, l.payload))) {
    return { ...result, game: null };
  }
  try {
    return { ...result, game: await gameBlock(userId, logged, quests) };
  } catch (err) {
    console.error('game: reading the state after a write failed', err);
    return { ...result, game: null };
  }
}

// --- Recompute -------------------------------------------------------------------------------

/** Replay the whole log with the current rules and rewrite each row's XP. Returns what changed. */
export async function recompute(userId: string) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'activity:' + userId}))`);
    const log = await tx
      .select()
      .from(activity)
      .where(eq(activity.userId, userId))
      .orderBy(asc(activity.occurredAt), asc(activity.id));
    const xps = foldXp(log);
    let changed = 0;
    for (const [i, row] of log.entries()) {
      if (row.xp === xps[i]) continue;
      changed++;
      await tx.update(activity).set({ xp: xps[i] }).where(eq(activity.id, row.id));
    }
    const xp = xps.reduce((a, b) => a + b, 0);
    return { activities: log.length, changed, xp };
  });
}
