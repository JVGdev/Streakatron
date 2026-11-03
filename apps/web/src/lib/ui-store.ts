// App-wide UI state that any component (palette, shortcuts, sidebar) can open: the command
// palette and the area/project dialogs.

import { useSyncExternalStore } from 'react';

export interface UiState {
  palette: null | { mode: 'search' | 'capture' };
  /** The project dialog: new (optionally in an area) or editing one. */
  projectDialog: null | { projectId?: string; areaId?: string | null };
  areaDialog: null | { areaId?: string };
  shortcuts: boolean;
}

let state: UiState = { palette: null, projectDialog: null, areaDialog: null, shortcuts: false };
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
