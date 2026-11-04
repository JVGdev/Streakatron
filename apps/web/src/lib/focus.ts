// Today's focus list: the shared rule (`@streakatron/shared/structure`), on the web app's types.

import {
  focusList as sharedFocusList,
  todayItems as sharedTodayItems,
  type FocusItem as SharedFocusItem,
  type TodayItem as SharedTodayItem,
} from '@streakatron/shared/structure';
import type { Commitment, Project, Task } from './queries';

export { FOCUS_VISIBLE, type FocusReason } from '@streakatron/shared/structure';

export type FocusItem = SharedFocusItem<Task>;

/** Every focus item, in order, each task once (its most urgent reason). */
export const focusList = (openTasks: Task[], projects: Project[], today: string): FocusItem[] =>
  sharedFocusList(openTasks, projects, today);

export type TodayItem = SharedTodayItem<Task, Commitment>;

/** Today's list: urgent tasks, then commitments due and not met, then next actions (D31). */
export const todayItems = (
  openTasks: Task[],
  projects: Project[],
  due: Commitment[],
  today: string,
): TodayItem[] => sharedTodayItems(openTasks, projects, due, today);
