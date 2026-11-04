// Today's focus list: the shared rule (`@streakatron/shared/structure`), on the web app's types.

import {
  focusList as sharedFocusList,
  type FocusItem as SharedFocusItem,
} from '@streakatron/shared/structure';
import type { Project, Task } from './queries';

export { FOCUS_VISIBLE, type FocusReason } from '@streakatron/shared/structure';

export type FocusItem = SharedFocusItem<Task>;

/** Every focus item, in order, each task once (its most urgent reason). */
export const focusList = (openTasks: Task[], projects: Project[], today: string): FocusItem[] =>
  sharedFocusList(openTasks, projects, today);
