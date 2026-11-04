// Today's focus list (plan.md §4.3), from what exists before Phase 3: overdue tasks, tasks due or
// scheduled today, then the next action of each active project. Phase 3 adds habits due today.

import type { Project, Task } from './queries';

export type FocusReason = 'overdue' | 'today' | 'next';

export interface FocusItem {
  task: Task;
  reason: FocusReason;
}

/** How many show before "Show more". */
export const FOCUS_VISIBLE = 5;

/** Every focus item, in order, each task once (its most urgent reason). */
export function focusList(openTasks: Task[], projects: Project[], today: string): FocusItem[] {
  const items: FocusItem[] = [];
  const seen = new Set<string>();
  const add = (task: Task, reason: FocusReason) => {
    if (seen.has(task.id) || task.completedAt !== null) return;
    seen.add(task.id);
    items.push({ task, reason });
  };
  // Tasks of parked, completed or archived projects wait until the project is active again.
  const waiting = new Set(projects.filter((p) => p.status !== 'active').map((p) => p.id));
  const live = openTasks.filter((t) => !t.projectId || !waiting.has(t.projectId));

  const byDay = (a: string | null, b: string | null) => (a ?? '').localeCompare(b ?? '');
  live
    .filter((t) => t.dueDate !== null && t.dueDate < today)
    .sort((a, b) => byDay(a.dueDate, b.dueDate))
    .forEach((t) => add(t, 'overdue'));
  live
    .filter((t) => t.dueDate === today || (t.scheduledDate !== null && t.scheduledDate <= today))
    .sort((a, b) => byDay(a.scheduledDate ?? a.dueDate, b.scheduledDate ?? b.dueDate))
    .forEach((t) => add(t, 'today'));

  const byId = new Map(live.map((t) => [t.id, t]));
  for (const p of projects) {
    if (p.status !== 'active' || !p.nextAction) continue;
    const t = byId.get(p.nextAction.id);
    if (t) add(t, 'next');
  }
  return items;
}
