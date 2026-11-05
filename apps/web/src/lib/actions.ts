// Writes, with their cache updates. Task writes go through the merge rule (task-cache.ts): the
// predicted result is merged at once (optimistic), the server's answer replaces it, a failure
// refetches. Every action reports its own failure and resolves to undefined.
//
//   const tasks = useTaskActions();
//   await tasks.complete(task);

import type {
  AreaCreate,
  AreaPatch,
  CommitmentCreate,
  CommitmentPatch,
  EventCreate,
  EventPatch,
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
import { syncPush } from './push';
import type {
  Area,
  BoardColumn,
  CalendarEvent,
  Commitment,
  CommitmentDetail,
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
import { setUi } from './ui-store';

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

    /** "Skip it" on a missed occurrence (D43): delete the earlier ones, with one Undo. */
    skipEarlier: (ids: string[]) =>
      attempt(async () => {
        for (const id of ids) await call(api.tasks[':id'].$delete({ param: { id } }));
        dropTasks(qc, ...ids);
        refreshAfterTaskWrite(qc, []);
        void qc.invalidateQueries({ queryKey: ['tasks', 'detail'] });
        toast(ids.length === 1 ? 'Skipped the earlier one' : `Skipped ${ids.length} earlier ones`, {
          action: {
            label: 'Undo',
            onClick: () =>
              void attempt(async () => {
                for (const id of ids) {
                  mergeTasks(qc, await call(api.tasks[':id'].restore.$post({ param: { id } })));
                }
                refreshAfterTaskWrite(qc, []);
                void qc.invalidateQueries({ queryKey: ['tasks', 'detail'] });
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
        const column = await call(
          api.projects[':id'].columns.$post({
            param: { id: projectId },
            json: { title, category },
          }),
        );
        refreshStructure(qc, projectId);
        return column;
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

// --- Commitments (D31) -----------------------------------------------------------------------

/** After any commitment write: the lists, chips and quests read again; the sheet gets the answer. */
function settleCommitment(qc: QueryClient, detail?: CommitmentDetail) {
  if (detail) {
    qc.setQueryData(['commitment', detail.id], detail);
    // The answer has today's state: put it in the lists at once, then read them again.
    qc.setQueriesData<Commitment[]>({ queryKey: ['commitments'] }, (old) =>
      old?.map((c) => (c.id === detail.id ? { ...c, ...detail } : c)),
    );
  }
  void qc.invalidateQueries({ queryKey: ['commitments'] });
  refreshEntities(qc);
}

// --- Calendar events (D39) -------------------------------------------------------------------

/** After any event write: the calendar, project dates, spotlight and chips read again. */
function settleEvent(qc: QueryClient, event?: CalendarEvent) {
  if (event) qc.setQueryData(['event', event.id], event);
  void qc.invalidateQueries({ queryKey: ['calendar'] });
  void qc.invalidateQueries({ queryKey: ['events'] });
  void qc.invalidateQueries({ queryKey: ['spotlight'] });
  refreshEntities(qc);
}

export function eventActions(qc: QueryClient) {
  return {
    create: (input: EventCreate) =>
      attempt(async () => {
        const event = await call(api.events.$post({ json: input }));
        settleEvent(qc, event);
        return event;
      }),

    update: (event: { id: string }, patch: EventPatch) =>
      attempt(async () => {
        const updated = await call(
          api.events[':id'].$patch({ param: { id: event.id }, json: patch }),
        );
        settleEvent(qc, updated);
        return updated;
      }),

    /** Autosave's sender for an event's title and description: throws. */
    save: async (event: { id: string }, patch: EventPatch) => {
      const updated = await call(
        api.events[':id'].$patch({ param: { id: event.id }, json: patch }),
      );
      settleEvent(qc, updated);
      return updated;
    },

    remove: (event: { id: string; title: string }) =>
      attempt(async () => {
        await call(api.events[':id'].$delete({ param: { id: event.id } }));
        settleEvent(qc);
        toast(`Deleted event “${event.title}”`, {
          action: {
            label: 'Undo',
            onClick: () =>
              void attempt(async () => {
                settleEvent(
                  qc,
                  await call(api.events[':id'].restore.$post({ param: { id: event.id } })),
                );
              }),
          },
        });
      }),
  };
}

export function useEventActions() {
  const qc = useQueryClient();
  return useMemo(() => eventActions(qc), [qc]);
}

// --- Spotlight (D33) -------------------------------------------------------------------------

/**
 * Feature a task or goal on Today, or take it off. A full spotlight opens the dialog that asks
 * which one to drop (it calls this again with `replace`). Resolves to whether it changed.
 */
export function spotlightActions(qc: QueryClient) {
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['spotlight'] });
    void qc.invalidateQueries({ queryKey: ['tasks'] });
    void qc.invalidateQueries({ queryKey: ['project'] });
    void qc.invalidateQueries({ queryKey: ['goal'] });
    void qc.invalidateQueries({ queryKey: ['event'] });
  };
  return {
    set: async (item: { id: string; title: string }, on: boolean, replace?: string) => {
      try {
        await call(api.spotlight.$post({ json: { id: item.id, on, replace } }));
        refresh();
        toast.success(on ? `“${item.title}” is in the spotlight` : 'Removed from the spotlight');
        return true;
      } catch (err) {
        if (err instanceof ApiError && err.code === 'spotlight_full') {
          const { items } = err.details as {
            items: { id: string; kind: 'task' | 'goal' | 'event'; title: string }[];
          };
          setUi({ spotlightFull: { add: item, items } });
        } else {
          report(err);
        }
        return false;
      }
    },
  };
}

export function useSpotlightActions() {
  const qc = useQueryClient();
  return useMemo(() => spotlightActions(qc), [qc]);
}

// --- Reminders (D38) -------------------------------------------------------------------------

const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

export function reminderActions(qc: QueryClient) {
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['tasks'] });
    void qc.invalidateQueries({ queryKey: ['commitments'] });
  };
  return {
    /** "Snooze 1 h": a task's reminder moves an hour out; a commitment's next one comes then. */
    snooze: (id: string) =>
      attempt(async () => {
        const { until } = await call(api.reminders.snooze.$post({ json: { id } }));
        refresh();
        toast(`Snoozed until ${clock.format(new Date(until))}`);
      }),

    /** A reminder toast's button (the app was in front when it came): Done or +1. */
    act: async (action: string, target: { kind: 'task' | 'commitment'; id: string }) => {
      if (action === 'snooze') return reminderActions(qc).snooze(target.id);
      if (target.kind === 'commitment') return commitmentActions(qc).log(target.id, 1);
      return attempt(async () => {
        await call(api.tasks[':id'].complete.$post({ param: { id: target.id } }));
        void qc.invalidateQueries();
      });
    },
  };
}

export function useReminderActions() {
  const qc = useQueryClient();
  return useMemo(() => reminderActions(qc), [qc]);
}

export function commitmentActions(qc: QueryClient) {
  return {
    create: (input: CommitmentCreate) =>
      attempt(async () => {
        const c = await call(api.commitments.$post({ json: input }));
        settleCommitment(qc, c);
        return c;
      }),

    update: (id: string, patch: CommitmentPatch) =>
      attempt(async () => {
        const c = await call(api.commitments[':id'].$patch({ param: { id }, json: patch }));
        settleCommitment(qc, c);
        return c;
      }),

    /** Autosave's sender for the sheet's title and description: throws. */
    save: async (id: string, patch: CommitmentPatch) => {
      const c = await call(api.commitments[':id'].$patch({ param: { id }, json: patch }));
      settleCommitment(qc, c);
      return c;
    },

    archive: (c: { id: string; title: string }, archived: boolean) =>
      attempt(async () => {
        const updated = await call(
          api.commitments[':id'].$patch({ param: { id: c.id }, json: { archived } }),
        );
        settleCommitment(qc, updated);
        if (archived) toast(`Archived “${c.title}”`, { description: 'Find it under Archived.' });
        return updated;
      }),

    delete: (c: { id: string; title: string }) =>
      attempt(async () => {
        await call(api.commitments[':id'].$delete({ param: { id: c.id } }));
        settleCommitment(qc);
        toast(`Deleted “${c.title}”`, {
          action: {
            label: 'Undo',
            onClick: () =>
              void attempt(async () => {
                settleCommitment(
                  qc,
                  await call(api.commitments[':id'].restore.$post({ param: { id: c.id } })),
                );
              }),
          },
        });
      }),

    /** A tick, +N or minutes today (`focusSessionId`: from a finished session's card). */
    log: (id: string, amount?: number, focusSessionId?: string) =>
      attempt(async () => {
        const c = await call(
          api.commitments[':id'].entries.$post({
            param: { id },
            json: { ...(amount ? { amount } : {}), ...(focusSessionId ? { focusSessionId } : {}) },
          }),
        );
        settleCommitment(qc, c);
        if (focusSessionId) void qc.invalidateQueries({ queryKey: ['focus'] });
        return c;
      }),

    /** Remove an entry: untick, or undo a mistaken +N. */
    unlog: (id: string, entryId: string) =>
      attempt(async () => {
        const c = await call(
          api.commitments[':id'].entries[':entryId'].$delete({ param: { id, entryId } }),
        );
        settleCommitment(qc, c);
        return c;
      }),
  };
}

export function useCommitmentActions() {
  const qc = useQueryClient();
  return useMemo(() => commitmentActions(qc), [qc]);
}

// --- Focus -----------------------------------------------------------------------------------

/** Focus-session writes. Each answers the timer's whole state, which replaces the cache. */
export function focusActions(qc: QueryClient) {
  const settle = (state: FocusState) => {
    syncServerClock(state.now);
    qc.setQueryData<FocusState>(['focus'], state);
    void qc.invalidateQueries({ queryKey: ['quests'] });
    // A finished session fills a minutes commitment and its project's time goals.
    if (state.last && !state.session) {
      void qc.invalidateQueries({ queryKey: ['commitments'] });
      void qc.invalidateQueries({ queryKey: ['commitment'] });
      void qc.invalidateQueries({ queryKey: ['project'] });
      void qc.invalidateQueries({ queryKey: ['goal'] });
    }
    return state;
  };
  return {
    /** From a click: also unlocks the chime and asks for notifications. Resolves to whether it started. */
    start: async (input: FocusStart) => {
      primeAudio();
      // Allowed here, it also brings Web Push to this device (reminders, focus ended) (D38).
      void askNotifications().then(() => syncPush(qc));
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
