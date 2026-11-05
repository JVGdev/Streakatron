// App-wide UI state that any component (palette, shortcuts, sidebar) can open: the command
// palette, the area, project, commitment and event dialogs, and the "spotlight is full" dialog.

import { useSyncExternalStore } from 'react';

export interface UiState {
  palette: null | { mode: 'search' | 'capture' };
  /** The project dialog: new (optionally in an area) or editing one. */
  projectDialog: null | { projectId?: string; areaId?: string | null };
  areaDialog: null | { areaId?: string };
  /** The commitment dialog: new (optionally in a project) or editing one. */
  commitmentDialog: null | { commitmentId?: string; projectId?: string | null };
  /** The new-event dialog (D39), optionally on a day or in a project. */
  eventDialog: null | { date?: string; projectId?: string | null };
  shortcuts: boolean;
  /** A reminder was set but this device won't show it (D38): why, and who still gets it. */
  pushPrompt: null | {
    problem: import('./push').PushProblem;
    others: string[];
    message?: string;
  };
  /** The spotlight is full (D33): which one to drop for `add`. */
  spotlightFull: null | {
    add: { id: string; title: string };
    items: { id: string; kind: 'task' | 'goal' | 'event'; title: string }[];
  };
}

let state: UiState = {
  palette: null,
  projectDialog: null,
  areaDialog: null,
  commitmentDialog: null,
  eventDialog: null,
  shortcuts: false,
  spotlightFull: null,
  pushPrompt: null,
};
const listeners = new Set<() => void>();

export function setUi(patch: Partial<UiState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function useUi(): UiState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export const openPalette = (mode: 'search' | 'capture' = 'search') => setUi({ palette: { mode } });
export const newProject = (areaId?: string | null) => setUi({ projectDialog: { areaId } });
export const editProject = (projectId: string) => setUi({ projectDialog: { projectId } });
export const newArea = () => setUi({ areaDialog: {} });
export const editArea = (areaId: string) => setUi({ areaDialog: { areaId } });
export const newCommitment = (projectId?: string | null) =>
  setUi({ commitmentDialog: { projectId } });
export const editCommitment = (commitmentId: string) =>
  setUi({ commitmentDialog: { commitmentId } });
export const newEvent = (opts: { date?: string; projectId?: string | null } = {}) =>
  setUi({ eventDialog: opts });
