// Writes, with their cache updates. Task writes go through the merge rule (task-cache.ts): the
// predicted result is merged at once (optimistic), the server's answer replaces it, a failure
// refetches. Every action reports its own failure and resolves to undefined.
//
//   const tasks = useTaskActions();
//   await tasks.complete(task);

import type {
  AreaCreate,
  AreaPatch,
  FocusStart,
  GoalCreate,
  GoalPatch,
  ProjectCreate,
  ProjectPatch,
  SettingsPatch,
  TaskCreate,
  TaskPatch,
} from '@streakatron/shared/schemas';
import {
  firstColumnOf,
  firstOpenColumn,
  placeAt,
  type ColumnCategory,
  type ProjectStatus,
} from '@streakatron/shared/structure';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { api, call, ApiError } from './api';
import { askNotifications, endBreak, markSeen, syncServerClock } from './focus-timer';
import type {
  Area,
  BoardColumn,
  FocusSession,
  FocusState,
  Goal,
  Project,
  ProjectPage,
  Task,
  TaskDetail,
} from './queries';
import { primeAudio } from './sound';
import { refreshEntities } from './entities';
import { attempt, report } from './report';
import { cachedTask, dropTasks, mergeTasks, refreshAfterTaskWrite } from './task-cache';

const columnsOf = (qc: QueryClient, projectId: string | null) =>
  projectId ? qc.getQueryData<ProjectPage>(['project', projectId])?.columns : undefined;

/** What completing or reopening will look like, as far as the client can tell. */
function predictDone(qc: QueryClient, task: Task, done: boolean): Task {
  const next: Task = {
    ...task,
    completedAt: done ? new Date().toISOString() : null,
    status: done ? 'done' : 'todo',
  };
  const columns = columnsOf(qc, task.projectId);
  if (columns && !task.parentTaskId) {
    const current = columns.find((c) => c.id === task.columnId);
    const target = done
      ? current?.category === 'done'
        ? current
        : firstColumnOf(columns, 'done')
      : current && current.category !== 'done'
        ? current
        : firstOpenColumn(columns);
    if (target) {
      next.columnId = target.id;
      next.status = target.category;
      if (target.id !== task.columnId) next.sortOrder = -1e9; // top
    }
  }
  return next;
}

/** Optimistic write: merge `predicted`, send, merge the answer; on failure refetch and report. */
async function optimistic(
  qc: QueryClient,
  predicted: Task[],
  send: () => Promise<Task | Task[]>,
  projects: (string | null)[],
) {
  mergeTasks(qc, ...predicted);
  try {
    const result = await send();
    mergeTasks(qc, ...(Array.isArray(result) ? result : [result]));
    return result;
  } catch (err) {
    report(err);
    return undefined;
  } finally {
    refreshAfterTaskWrite(qc, projects);
  }
}

export function taskActions(qc: QueryClient) {
  return {
    create: (input: TaskCreate) =>
      attempt(async () => {
        const task = await call(api.tasks.$post({ json: input }));
        mergeTasks(qc, task);
        refreshAfterTaskWrite(qc, [task.projectId]);
        return task;
      }),

    update: (task: Task, patch: TaskPatch) =>
      attempt(async () => {
        const updated = await call(
          api.tasks[':id'].$patch({ param: { id: task.id }, json: patch }),
        );
        mergeTasks(qc, updated);
        if (patch.projectId !== undefined || patch.goalId !== undefined) {
          refreshAfterTaskWrite(qc, [task.projectId, updated.projectId]);
        }
        return updated;
      }),

    /** Autosave's sender: throws, so the saver can retry and show its state. */
    save: async (id: string, patch: TaskPatch) => {
      const updated = await call(api.tasks[':id'].$patch({ param: { id }, json: patch }));
      mergeTasks(qc, updated);
      // Task views leave the document out; the cached detail must have what was saved, or the
      // sheet opened again would start from the old text.
      if (patch.description !== undefined) {
        qc.setQueryData<TaskDetail>(['tasks', 'detail', id], (old) =>
          old
            ? { ...old, description: (patch.description ?? null) as TaskDetail['description'] }
            : old,
        );
      }
      refreshEntities(qc);
      return updated;
    },

    complete: (task: Task) =>
      optimistic(
        qc,
        [predictDone(qc, task, true)],
        () => call(api.tasks[':id'].complete.$post({ param: { id: task.id } })),
        [task.projectId],
      ),

    reopen: (task: Task) =>
      optimistic(
        qc,
        [predictDone(qc, task, false)],
        () => call(api.tasks[':id'].reopen.$post({ param: { id: task.id } })),
        [task.projectId],
      ),

    toggle(task: Task) {
      return task.completedAt ? this.reopen(task) : this.complete(task);
    },

    /**
     * Board drag and drop: into `column` at `index` among `columnTasks` (that column's tasks as
     * shown, in order, without the moved one).
     */
    move: (task: Task, column: BoardColumn, index: number, columnTasks: Task[]) => {
      const order = placeAt(
        columnTasks.filter((t) => t.id !== task.id).map((t) => t.id),
        task.id,
        index,
      );
      const done = column.category === 'done';
      const predicted = order.map((id, i) => {
        const t = id === task.id ? task : columnTasks.find((x) => x.id === id)!;
        return id === task.id
          ? {
              ...t,
              columnId: column.id,
              sortOrder: i,
              status: column.category as ColumnCategory,
              completedAt: done ? (t.completedAt ?? new Date().toISOString()) : null,
            }
          : { ...t, sortOrder: i };
      });
      return optimistic(
        qc,
        predicted,
        () =>
          call(
            api.tasks[':id'].move.$post({
              param: { id: task.id },
              json: { columnId: column.id, index },
            }),
          ),
        [task.projectId],
      );
    },

    /** Delete, with an Undo in the toast. */
    remove: (task: Task) =>
      attempt(async () => {
        await call(api.tasks[':id'].$delete({ param: { id: task.id } }));
        dropTasks(qc, task.id);
        refreshAfterTaskWrite(qc, [task.projectId]);
        toast(`Deleted “${task.title}”`, {
          action: {
            label: 'Undo',
            onClick: () =>
              void attempt(async () => {
                const back = await call(api.tasks[':id'].restore.$post({ param: { id: task.id } }));
                mergeTasks(qc, back);
                refreshAfterTaskWrite(qc, [back.projectId]);
              }),
          },
        });
      }),

    byId: (id: string) => cachedTask(qc, id),
  };
}

export function useTaskActions() {
  const qc = useQueryClient();
  return useMemo(() => taskActions(qc), [qc]);
}

// --- Areas, projects, goals ------------------------------------------------------------------

const refreshStructure = (qc: QueryClient, projectId?: string) => {
  refreshEntities(qc);
  void qc.invalidateQueries({ queryKey: ['areas'] });
  void qc.invalidateQueries({ queryKey: ['projects'] });
  if (projectId) void qc.invalidateQueries({ queryKey: ['project', projectId] });
};

export function structureActions(qc: QueryClient) {
  return {
    createArea: (input: AreaCreate) =>
      attempt(async () => {
        const area = await call(api.areas.$post({ json: input }));
        qc.setQueryData<Area[]>(['areas'], (old) => (old ? [...old, area] : old));
        refreshStructure(qc);
        return area;
      }),

    updateArea: (id: string, patch: AreaPatch) =>
      attempt(async () => {
        const area = await call(api.areas[':id'].$patch({ param: { id }, json: patch }));
        qc.setQueryData<Area[]>(['areas'], (old) => old?.map((a) => (a.id === id ? area : a)));
        refreshEntities(qc);
        return area;
      }),

    /** Autosave's sender for an area's title and description: throws. */
    saveArea: async (id: string, patch: AreaPatch) => {
      const area = await call(api.areas[':id'].$patch({ param: { id }, json: patch }));
      qc.setQueryData<Area[]>(['areas'], (old) => old?.map((a) => (a.id === id ? area : a)));
      refreshEntities(qc);
      return area;
    },

    reorderAreas: (ids: string[]) => {
      const before = qc.getQueryData<Area[]>(['areas']);
      if (before) {
        qc.setQueryData<Area[]>(
          ['areas'],
          ids.map((id) => before.find((a) => a.id === id)!).filter(Boolean),
        );
      }
      return attempt(async () => {
        try {
          const { areas } = await call(api.areas.reorder.$post({ json: { ids } }));
          qc.setQueryData(['areas'], areas);
        } catch (err) {
          void qc.invalidateQueries({ queryKey: ['areas'] });
          throw err;
        }
      });
    },

    deleteArea: (area: Area, projects: 'keep' | 'delete') =>
      attempt(async () => {
        const res = await call(
          api.areas[':id'].$delete({ param: { id: area.id }, query: { projects } }),
        );
        refreshStructure(qc);
        void qc.invalidateQueries({ queryKey: ['tasks'] });
        void qc.invalidateQueries({ queryKey: ['snapshots'] });
        undoToast(qc, `Deleted area “${area.title}”`, res.snapshotId);
        return res;
      }),

    createProject: (input: ProjectCreate) =>
      attempt(async () => {
        const project = await call(api.projects.$post({ json: input }));
        refreshStructure(qc);
        return project;
      }),

    updateProject: (id: string, patch: ProjectPatch) =>
      attempt(async () => {
        const project = await call(api.projects[':id'].$patch({ param: { id }, json: patch }));
        qc.setQueryData<Project[]>(['projects'], (old) =>
          old?.map((p) => (p.id === id ? project : p)),
        );
        qc.setQueryData<ProjectPage>(['project', id], (old) => (old ? { ...old, project } : old));
        refreshStructure(qc, id);
        return project;
      }),

    /** Autosave's sender for a project's description: throws. */
    saveProject: async (id: string, patch: ProjectPatch) => {
      const project = await call(api.projects[':id'].$patch({ param: { id }, json: patch }));
      qc.setQueryData<Project[]>(['projects'], (old) =>
        old?.map((p) => (p.id === id ? project : p)),
      );
      qc.setQueryData<ProjectPage>(['project', id], (old) => (old ? { ...old, project } : old));
      refreshEntities(qc);
      return project;
    },

    /** Throws (an `active_limit` 409 is handled by the caller's dialog). */
    setStatus: async (id: string, status: ProjectStatus, park?: string) => {
      const { projects } = await call(
        api.projects[':id'].status.$post({ param: { id }, json: { status, park } }),
      );
      for (const p of projects) refreshStructure(qc, p.id);
      return projects;
    },

    deleteProject: (project: Project) =>
      attempt(async () => {
        const res = await call(api.projects[':id'].$delete({ param: { id: project.id } }));
        qc.removeQueries({ queryKey: ['project', project.id] });
        refreshStructure(qc);
        void qc.invalidateQueries({ queryKey: ['tasks'] });
        void qc.invalidateQueries({ queryKey: ['snapshots'] });
        undoToast(qc, `Deleted “${project.title}”`, res.snapshotId);
        return res;
      }),

    createColumn: (projectId: string, title: string, category: ColumnCategory) =>
      attempt(async () => {
        await call(
          api.projects[':id'].columns.$post({
            param: { id: projectId },
            json: { title, category },
          }),
        );
        refreshStructure(qc, projectId);
      }),

    updateColumn: (column: BoardColumn, patch: { title?: string; category?: ColumnCategory }) =>
      attempt(async () => {
        await call(api.columns[':id'].$patch({ param: { id: column.id }, json: patch }));
        refreshStructure(qc, column.projectId);
        if (patch.category) void qc.invalidateQueries({ queryKey: ['tasks'] });
      }),

    reorderColumns: (projectId: string, ids: string[]) =>
      attempt(async () => {
        const page = qc.getQueryData<ProjectPage>(['project', projectId]);
        if (page) {
          qc.setQueryData<ProjectPage>(['project', projectId], {
            ...page,
            columns: ids.map((id) => page.columns.find((c) => c.id === id)!),
          });
        }
        try {
          await call(
            api.projects[':id'].columns.reorder.$post({ param: { id: projectId }, json: { ids } }),
          );
        } finally {
          refreshStructure(qc, projectId);
        }
      }),

    deleteColumn: (column: BoardColumn) =>
      attempt(async () => {
        await call(api.columns[':id'].$delete({ param: { id: column.id }, query: {} }));
        refreshStructure(qc, column.projectId);
        void qc.invalidateQueries({ queryKey: ['tasks'] });
      }),

    createGoal: (input: GoalCreate) =>
      attempt(async () => {
        const goal = await call(api.goals.$post({ json: input }));
        refreshStructure(qc, input.projectId);
        return goal;
      }),

    updateGoal: (goal: Goal, patch: GoalPatch) =>
      attempt(async () => {
        const updated = await call(
          api.goals[':id'].$patch({ param: { id: goal.id }, json: patch }),
        );
        qc.setQueryData<ProjectPage>(['project', goal.projectId], (old) =>
          old ? { ...old, goals: old.goals.map((g) => (g.id === goal.id ? updated : g)) } : old,
        );
        qc.setQueryData(['goal', goal.id], updated);
        refreshEntities(qc);
        return updated;
      }),

    /** Autosave's sender for a goal's title and description: throws. */
    saveGoal: async (goal: Goal, patch: GoalPatch) => {
      const updated = await call(api.goals[':id'].$patch({ param: { id: goal.id }, json: patch }));
      qc.setQueryData<ProjectPage>(['project', goal.projectId], (old) =>
        old ? { ...old, goals: old.goals.map((g) => (g.id === goal.id ? updated : g)) } : old,
      );
      qc.setQueryData(['goal', goal.id], updated);
      refreshEntities(qc);
      return updated;
    },

    deleteGoal: (goal: Goal) =>
      attempt(async () => {
        await call(api.goals[':id'].$delete({ param: { id: goal.id } }));
        refreshStructure(qc, goal.projectId);
        toast(`Deleted goal “${goal.title}”`, {
          action: {
            label: 'Undo',
            onClick: () =>
              void attempt(async () => {
                await call(api.goals[':id'].restore.$post({ param: { id: goal.id } }));
                refreshStructure(qc, goal.projectId);
              }),
          },
        });
      }),

    restoreSnapshot: (id: string) =>
      attempt(async () => {
        const res = await call(api.snapshots[':id'].restore.$post({ param: { id } }));
        refreshStructure(qc);
        void qc.invalidateQueries({ queryKey: ['tasks'] });
        void qc.invalidateQueries({ queryKey: ['snapshots'] });
        toast.success(`Restored “${res.title}”`, {
          description: res.parked.length
            ? `Your active limit is full, so it came back parked.`
            : undefined,
        });
        return res;
      }),

    /** Settings change the user's day and the week's rules, so the game is read again. */
    updateSettings: (patch: SettingsPatch) =>
      attempt(async () => {
        const settings = await call(api.settings.$patch({ json: patch }));
        void qc.invalidateQueries({ queryKey: ['me'] });
        void qc.invalidateQueries({ queryKey: ['game'] });
        void qc.invalidateQueries({ queryKey: ['quests'] });
        return settings;
      }),
  };
}

function undoToast(qc: QueryClient, message: string, snapshotId: string) {
  toast(message, {
    description: 'You can restore it from Settings for 30 days.',
    action: {
      label: 'Undo',
      onClick: () => void structureActions(qc).restoreSnapshot(snapshotId),
    },
  });
}

export function useStructureActions() {
  const qc = useQueryClient();
  return useMemo(() => structureActions(qc), [qc]);
}

// --- Focus -----------------------------------------------------------------------------------

/** Focus-session writes. Each answers the timer's whole state, which replaces the cache. */
export function focusActions(qc: QueryClient) {
  const settle = (state: FocusState) => {
    syncServerClock(state.now);
    qc.setQueryData<FocusState>(['focus'], state);
    void qc.invalidateQueries({ queryKey: ['quests'] });
    return state;
  };
  return {
    /** From a click: also unlocks the chime and asks for notifications. Resolves to whether it started. */
    start: async (input: FocusStart) => {
      primeAudio();
      askNotifications();
      try {
        const state = settle(await call(api.focus.start.$post({ json: input })));
        endBreak();
        if (state.last) markSeen(state.last.id);
        return true;
      } catch (err) {
        if (err instanceof ApiError && err.code === 'focus_open') {
          void qc.invalidateQueries({ queryKey: ['focus'] });
          toast('A focus session is already going.');
        } else {
          report(err);
        }
        return false;
      }
    },
    pause: () => attempt(async () => settle(await call(api.focus.pause.$post()))),
    resume: () =>
      attempt(async () => {
        primeAudio();
        return settle(await call(api.focus.resume.$post()));
      }),
    finish: () => attempt(async () => settle(await call(api.focus.finish.$post()))),
    abandon: () =>
      attempt(async () => {
        const state = settle(await call(api.focus.abandon.$post()));
        if (state.last) markSeen(state.last.id);
        return state;
      }),
    /** Autosave's sender for the note on a finished session: throws. */
    saveNote: async (id: string, note: string) => {
      const session = await call(
        api.focus[':id'].$patch({ param: { id }, json: { note: note.trim() || null } }),
      );
      qc.setQueryData<FocusState>(['focus'], (old) =>
        old?.last?.id === id ? { ...old, last: session as FocusSession } : old,
      );
      return session;
    },
  };
}

export function useFocusActions() {
  const qc = useQueryClient();
  return useMemo(() => focusActions(qc), [qc]);
}

// --- Quests ----------------------------------------------------------------------------------

export function questActions(qc: QueryClient) {
  return {
    /** Trade a quest for another of its type (once per quest). */
    reroll: (id: string) =>
      attempt(async () => {
        const board = await call(api.quests[':id'].reroll.$post({ param: { id } }));
        qc.setQueryData(['quests'], board);
        return board;
      }),
  };
}

export function useQuestActions() {
  const qc = useQueryClient();
  return useMemo(() => questActions(qc), [qc]);
}
