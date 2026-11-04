// Today's focus list (plan.md §4.3): overdue tasks, tasks due or scheduled today, waiting tasks to
// follow up, then the next action of each active project, each task once. Shared so the server's
// quests (the "top Today item") and the web app's Today page read the same list. Commitments due
// today sit between today's tasks and the next actions (`todayItems`, D31). Spotlighted tasks have
// their own section above it and aren't repeated (D33).

import type { ProjectStatus, TaskStatus } from './index';

export type FocusReason = 'overdue' | 'today' | 'follow_up' | 'next';

export interface FocusListTask {
  id: string;
  projectId: string | null;
  completedAt: unknown;
  dueDate: string | null;
  scheduledDate: string | null;
  /** Waiting tasks (D32) only come back as "follow up", once their scheduled or due date comes. */
  status?: TaskStatus;
  /** Spotlighted tasks (D33) show in the Spotlight instead. */
  spotlightedAt?: unknown;
}

export interface FocusListProject {
  id: string;
  status: ProjectStatus;
  nextAction: { id: string } | null;
}

export interface FocusItem<T> {
  task: T;
  reason: FocusReason;
}

/** How many show on Today before "Show more". */
export const FOCUS_VISIBLE = 5;

/** Every focus item, in order, each task once (its most urgent reason). */
export function focusList<T extends FocusListTask>(
  openTasks: readonly T[],
  projects: readonly FocusListProject[],
  today: string,
): FocusItem<T>[] {
  const items: FocusItem<T>[] = [];
  const seen = new Set<string>();
  const add = (task: T, reason: FocusReason) => {
    if (seen.has(task.id) || (task.completedAt ?? null) !== null) return;
    seen.add(task.id);
    items.push({ task, reason });
  };
  // Tasks of parked, completed or archived projects rest until the project is active again.
  const resting = new Set(projects.filter((p) => p.status !== 'active').map((p) => p.id));
  const shown = openTasks.filter(
    (t) => (!t.projectId || !resting.has(t.projectId)) && (t.spotlightedAt ?? null) === null,
  );
  const live = shown.filter((t) => t.status !== 'waiting');

  const byDay = (a: string | null, b: string | null) => (a ?? '').localeCompare(b ?? '');
  live
    .filter((t) => t.dueDate !== null && t.dueDate < today)
    .sort((a, b) => byDay(a.dueDate, b.dueDate))
    .forEach((t) => add(t, 'overdue'));
  live
    .filter((t) => t.dueDate === today || (t.scheduledDate !== null && t.scheduledDate <= today))
    .sort((a, b) => byDay(a.scheduledDate ?? a.dueDate, b.scheduledDate ?? b.dueDate))
    .forEach((t) => add(t, 'today'));
  const followUp = (t: T) => t.scheduledDate ?? t.dueDate;
  shown
    .filter((t) => t.status === 'waiting' && followUp(t) !== null && followUp(t)! <= today)
    .sort((a, b) => byDay(followUp(a), followUp(b)))
    .forEach((t) => add(t, 'follow_up'));

  const byId = new Map(live.map((t) => [t.id, t]));
  for (const p of projects) {
    if (p.status !== 'active' || !p.nextAction) continue;
    const t = byId.get(p.nextAction.id);
    if (t) add(t, 'next');
  }
  return items;
}

export type TodayItem<T, C> =
  | { kind: 'task'; task: T; reason: FocusReason }
  | { kind: 'commitment'; commitment: C; reason: 'commitment' };

/**
 * Today's list: overdue and today's tasks, follow-ups, then commitments due and not met, then next
 * actions.
 */
export function todayItems<T extends FocusListTask, C>(
  openTasks: readonly T[],
  projects: readonly FocusListProject[],
  due: readonly C[],
  today: string,
): TodayItem<T, C>[] {
  const tasks = focusList(openTasks, projects, today).map((i) => ({ kind: 'task' as const, ...i }));
  const urgent = tasks.filter((i) => i.reason !== 'next');
  const next = tasks.filter((i) => i.reason === 'next');
  return [
    ...urgent,
    ...due.map((commitment) => ({
      kind: 'commitment' as const,
      commitment,
      reason: 'commitment' as const,
    })),
    ...next,
  ];
}
