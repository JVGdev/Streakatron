// Every gamification number in one place (plan.md §5). Tune after dogfooding.

import type { Effort } from '../structure';

export const GAME = {
  xp: {
    /** Task completed, by effort; a task with no effort set earns like S (D27). */
    task: { S: 10, M: 25, L: 50 } satisfies Record<Effort, number>,
    taskUnset: 10,
    /** Subtasks earn nothing; the parent carries the XP. */
    subtask: 0,
    /** Task XP a day above this is halved (guards against bulk-closing). */
    taskDailySoftCap: 200,
    /** Focus: XP per minute of a completed session of at least `focus.minMinutes`. */
    focusPerMinute: 1,
  },
  focus: {
    /** A session this long or longer earns XP and makes the day active. */
    minMinutes: 10,
    /** A running session ends on its own this long past its planned time (no farming by leaving it on). */
    overtimeMinutes: 60,
  },
  streak: {
    /** One freeze per this many consecutive active days. */
    freezeEvery: 7,
    /** At most this many freezes banked. */
    maxFreezes: 2,
  },
} as const;

/** What happened, in the append-only activity log (D8). */
export const ACTIVITY_TYPES = [
  'task_completed',
  'task_reopened',
  'focus_completed',
  /** An inbox task got a project (completing one in the inbox is triage too). */
  'task_triaged',
  /** A quest was done: its XP (the quest decides it), once per quest. */
  'quest_completed',
  /** Every daily quest of a day was done: the board bonus, once per day. */
  'quest_bonus',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/**
 * The activities that make a day active (plan.md §5; habits come in Phase 4). `focus_completed` is
 * only logged for sessions of at least `focus.minMinutes`, so every one counts.
 */
export const ACTIVE_DAY_TYPES: readonly ActivityType[] = ['task_completed', 'focus_completed'];
