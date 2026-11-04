// Game rules as pure functions over the activity log (D8). The server is the only place they run
// for real (D17); the web app only shows what the server answers.
//
// - XP is never taken away and each source earns once (D15): `xpFor` decides one activity's XP from
//   what came before it, and `foldXp` replays a whole log with the same rule (admin recompute).
// - Streaks are read from the set of active days (`YYYY-MM-DD`, the user's day when it happened).
//   Today never breaks a streak: it's still in progress.

import type { Effort } from '../structure';
import { addDays, eachDay, startOfWeek, type DateString } from '../time';
import { ACTIVE_DAY_TYPES, GAME, type ActivityType } from './config';

export * from './config';

// --- XP --------------------------------------------------------------------------------------

export interface ActivityPayload {
  /** Task completions: the task's effort when it was completed. */
  effort?: Effort | null;
  /** Task completions: whether it's a subtask. */
  subtask?: boolean;
  /** Focus sessions: the minutes credited. */
  minutes?: number;
  /** Tasks and focus sessions: the project worked on (for quests). */
  projectId?: string | null;
  /** Quests and the board bonus: the XP they award (decided when offered). */
  xp?: number;
  /** Quests: the type (quest fit stats). */
  questType?: string;
}

export interface XpActivity {
  type: ActivityType;
  entityId: string | null;
  localDate: DateString;
  payload: ActivityPayload;
}

/** What `xpFor` needs to know about the log before the activity. */
export interface XpContext {
  /** This source (type + entity) earned already: earn once, ever (D15). */
  earnedBefore: boolean;
  /** Task XP already earned on the activity's day (for the soft cap). */
  taskXpThatDay: number;
}

/** The key a source earns under: one task's completion earns once, however often it's redone. */
export const sourceKey = (a: Pick<XpActivity, 'type' | 'entityId'>) => `${a.type}:${a.entityId}`;

/** Base XP for completing a task, before the daily soft cap. */
export function taskBaseXp(payload: ActivityPayload): number {
  if (payload.subtask) return GAME.xp.subtask;
  return payload.effort ? GAME.xp.task[payload.effort] : GAME.xp.taskUnset;
}

/** `amount` added to `already` task XP today: the part above the soft cap counts half (rounded up). */
export function softCapped(
  amount: number,
  already: number,
  cap: number = GAME.xp.taskDailySoftCap,
) {
  const full = Math.max(0, Math.min(amount, cap - already));
  return full + Math.ceil((amount - full) / 2);
}

/** The XP one activity earns. */
export function xpFor(a: XpActivity, ctx: XpContext): number {
  switch (a.type) {
    case 'task_completed': {
      if (ctx.earnedBefore) return 0;
      return softCapped(taskBaseXp(a.payload), ctx.taskXpThatDay);
    }
    case 'task_reopened':
      return 0;
    case 'focus_completed': {
      if (ctx.earnedBefore) return 0;
      const minutes = Math.max(0, Math.floor(a.payload.minutes ?? 0));
      return minutes >= GAME.focus.minMinutes ? minutes * GAME.xp.focusPerMinute : 0;
    }
    case 'quest_completed':
    case 'quest_bonus':
      return ctx.earnedBefore ? 0 : Math.max(0, Math.floor(a.payload.xp ?? 0));
    case 'task_triaged':
      return 0;
  }
}

/** Whether an activity's XP counts toward the task soft cap. */
export const isTaskXp = (a: Pick<XpActivity, 'type'>) => a.type === 'task_completed';

/** Whether an activity earns once per source (and so marks its source as earned). */
export const earnsOnce = (a: Pick<XpActivity, 'type'>) =>
  a.type === 'task_completed' ||
  a.type === 'focus_completed' ||
  a.type === 'quest_completed' ||
  a.type === 'quest_bonus';

/** Replay a log (in the order it happened): the XP each activity earns. */
export function foldXp(log: readonly XpActivity[]): number[] {
  const earned = new Set<string>();
  const taskXpByDay = new Map<DateString, number>();
  return log.map((a) => {
    const key = sourceKey(a);
    const xp = xpFor(a, {
      earnedBefore: earned.has(key),
      taskXpThatDay: taskXpByDay.get(a.localDate) ?? 0,
    });
    if (earnsOnce(a)) earned.add(key);
    if (isTaskXp(a)) taskXpByDay.set(a.localDate, (taskXpByDay.get(a.localDate) ?? 0) + xp);
    return xp;
  });
}

export const countsAsActive = (type: ActivityType) => ACTIVE_DAY_TYPES.includes(type);

// --- Levels ----------------------------------------------------------------------------------

/** Cumulative XP needed to reach `level`: 50 · n · (n − 1) (L2 = 100, L3 = 300, L10 = 4500). */
export const xpForLevel = (level: number) => 50 * level * (level - 1);

export interface LevelInfo {
  level: number;
  xp: number;
  /** XP at which this level started. */
  floor: number;
  /** XP at which the next level starts. */
  next: number;
}

export function levelFor(xp: number): LevelInfo {
  const total = Math.max(0, Math.floor(xp));
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + total / 12.5)) / 2));
  // Guard the float estimate on both sides.
  while (xpForLevel(level + 1) <= total) level++;
  while (level > 1 && xpForLevel(level) > total) level--;
  return { level, xp: total, floor: xpForLevel(level), next: xpForLevel(level + 1) };
}

// --- Daily streak ----------------------------------------------------------------------------

export interface DailyStreak {
  /** Active days in the current streak (days kept by a freeze don't add to it). */
  current: number;
  longest: number;
  /** Freezes banked now. */
  freezes: number;
  todayActive: boolean;
  /** Days a freeze kept the streak alive, oldest first. */
  frozenDays: DateString[];
  /** Consecutive active days toward the next freeze. */
  run: number;
}

/**
 * The daily streak on `today`, from the days that were active (any order, repeats allowed).
 * - Each run of `freezeEvery` consecutive active days earns a freeze; at most `maxFreezes` banked.
 * - A missed day (before today) uses a banked freeze and the streak lives; without one it ends.
 *   A frozen day starts the run toward the next freeze over.
 */
export function dailyStreak(
  activeDays: Iterable<DateString>,
  today: DateString,
  rules: { freezeEvery: number; maxFreezes: number } = GAME.streak,
): DailyStreak {
  const active = new Set([...activeDays].filter((d) => d <= today));
  const result: DailyStreak = {
    current: 0,
    longest: 0,
    freezes: 0,
    todayActive: active.has(today),
    frozenDays: [],
    run: 0,
  };
  if (active.size === 0) return result;
  const first = [...active].sort()[0]!;
  for (const day of eachDay(first, today)) {
    if (active.has(day)) {
      result.current++;
      result.run++;
      result.longest = Math.max(result.longest, result.current);
      if (result.run % rules.freezeEvery === 0) {
        result.freezes = Math.min(rules.maxFreezes, result.freezes + 1);
      }
    } else if (day === today) {
      // Still in progress.
    } else if (result.freezes > 0) {
      result.freezes--;
      result.frozenDays.push(day);
      result.run = 0;
    } else {
      result.current = 0;
      result.run = 0;
    }
  }
  return result;
}

// --- Weekly streak ---------------------------------------------------------------------------

export interface WeeklyStreak {
  /** Consecutive weeks that met the target (this week counts once it has). */
  current: number;
  longest: number;
  week: {
    start: DateString;
    activeDays: number;
    /** This week's active days, in order. */
    dates: DateString[];
    target: number;
    met: boolean;
  };
}

/**
 * Weeks meeting the active-day target in a row. The current week never breaks the streak; it adds
 * to it once met. Past weeks are judged by today's target and week start (the rules are derived).
 */
export function weeklyStreak(
  activeDays: Iterable<DateString>,
  today: DateString,
  { weekStart, target }: { weekStart: number; target: number },
): WeeklyStreak {
  const thisWeek = startOfWeek(today, weekStart);
  const days = [...new Set(activeDays)].filter((d) => d <= today);
  const perWeek = new Map<DateString, number>();
  for (const day of days) {
    const week = startOfWeek(day, weekStart);
    perWeek.set(week, (perWeek.get(week) ?? 0) + 1);
  }
  const thisCount = perWeek.get(thisWeek) ?? 0;
  const result: WeeklyStreak = {
    current: 0,
    longest: 0,
    week: {
      start: thisWeek,
      activeDays: thisCount,
      dates: days.filter((d) => d >= thisWeek).sort(),
      target,
      met: thisCount >= target,
    },
  };
  if (perWeek.size === 0) return result;
  const first = [...perWeek.keys()].sort()[0]!;
  for (let week = first; week <= thisWeek; week = addDays(week, 7)) {
    const met = (perWeek.get(week) ?? 0) >= target;
    if (met) {
      result.current++;
      result.longest = Math.max(result.longest, result.current);
    } else if (week !== thisWeek) {
      result.current = 0;
    }
  }
  return result;
}

// --- State and events ------------------------------------------------------------------------

export interface GameRules {
  weekStart: number;
  weeklyTarget: number;
}

export interface GameState {
  today: DateString;
  level: LevelInfo;
  streak: DailyStreak;
  week: WeeklyStreak;
}

export function gameState(
  xp: number,
  activeDays: readonly DateString[],
  today: DateString,
  rules: GameRules,
): GameState {
  return {
    today,
    level: levelFor(xp),
    streak: dailyStreak(activeDays, today),
    week: weeklyStreak(activeDays, today, {
      weekStart: rules.weekStart,
      target: rules.weeklyTarget,
    }),
  };
}

export type GameEvent =
  | { type: 'xp'; amount: number }
  | { type: 'level_up'; level: number }
  /** Today became an active day: the streak grew to `streak`. */
  | { type: 'day_active'; streak: number }
  | { type: 'freeze_earned'; freezes: number }
  | { type: 'week_met'; weeks: number }
  /** A quest was done (`big`: it takes the screen; the rest show in the toast). */
  | {
      type: 'quest_done';
      quest: { id: string; type: string; title: string; xp: number; tier: string; big: boolean };
    }
  /** Every daily quest of the day was done: the board bonus. */
  | { type: 'board_done'; xp: number };

/** What a write changed, as events the UI can celebrate (in that order). */
export function gameEvents(before: GameState, after: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  const gained = after.level.xp - before.level.xp;
  if (gained > 0) events.push({ type: 'xp', amount: gained });
  if (after.level.level > before.level.level) {
    events.push({ type: 'level_up', level: after.level.level });
  }
  if (after.streak.todayActive && !before.streak.todayActive) {
    events.push({ type: 'day_active', streak: after.streak.current });
  }
  if (after.streak.freezes > before.streak.freezes) {
    events.push({ type: 'freeze_earned', freezes: after.streak.freezes });
  }
  if (after.week.week.met && !before.week.week.met) {
    events.push({ type: 'week_met', weeks: after.week.current });
  }
  return events;
}
