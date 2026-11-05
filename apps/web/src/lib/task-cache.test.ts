import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { normalizeFilter, type Task } from './queries';
import { applyToList, dropTasks, matchesFilter, mergeTasks } from './task-cache';

let n = 0;
const task = (over: Partial<Task> = {}): Task => ({
  id: `tsk_${++n}`,
  projectId: 'prj_a',
  goalId: null,
  parentTaskId: null,
  columnId: 'col_todo',
  title: `Task ${n}`,
  descriptionText: '',
  effort: null,
  dueDate: null,
  scheduledDate: null,
  sortOrder: n,
  completedAt: null,
  spotlightedAt: null,
  remindAt: null,
  seriesId: null,
  seriesDate: null,
  series: null,
  earlierOpen: [],
  createdAt: `2026-11-03T10:00:${String(n).padStart(2, '0')}.000Z`,
  updatedAt: '2026-11-03T10:00:00.000Z',
  status: 'todo',
  subtasks: { total: 0, done: 0 },
  ...over,
});

describe('matchesFilter', () => {
  it('follows the server’s list rules', () => {
    const t = task();
    expect(matchesFilter({ status: 'any' }, t)).toBe(true);
    expect(matchesFilter({ project: 'prj_a', status: 'open' }, t)).toBe(true);
    expect(matchesFilter({ project: 'prj_b', status: 'any' }, t)).toBe(false);
    expect(matchesFilter({ project: 'inbox', status: 'any' }, t)).toBe(false);
    expect(matchesFilter({ project: 'inbox', status: 'any' }, task({ projectId: null }))).toBe(
      true,
    );
    expect(matchesFilter({ status: 'done' }, t)).toBe(false);
    expect(matchesFilter({ status: 'open' }, task({ completedAt: '2026-11-03T11:00:00Z' }))).toBe(
      false,
    );
  });

  it('keeps subtasks to their parent’s list', () => {
    const sub = task({ parentTaskId: 'tsk_p' });
    expect(matchesFilter({ status: 'any' }, sub)).toBe(false);
    expect(matchesFilter({ parent: 'tsk_p', status: 'any' }, sub)).toBe(true);
    expect(matchesFilter({ parent: 'tsk_p', status: 'any' }, task())).toBe(false);
  });
});

describe('applyToList', () => {
  it('replaces, inserts in order, and removes what no longer matches', () => {
    const a = task({ sortOrder: 0 });
    const b = task({ sortOrder: 2 });
    const f = { project: 'prj_a', status: 'open' } as const;
    const list = [a, b];
    const c = task({ sortOrder: 1 });
    expect(applyToList(list, f, c).map((t) => t.id)).toEqual([a.id, c.id, b.id]);
    expect(applyToList(list, f, { ...a, title: 'Renamed' })[0]!.title).toBe('Renamed');
    expect(applyToList(list, f, { ...a, completedAt: '2026-11-03T12:00:00Z' })).toEqual([b]);
    // Unchanged lists keep their identity (no needless re-render).
    expect(applyToList(list, f, task({ projectId: 'prj_b' }))).toBe(list);
  });
});

describe('mergeTasks / dropTasks', () => {
  it('update every cached list and the detail entry', () => {
    const qc = new QueryClient();
    const t = task({ projectId: null, columnId: null });
    const inbox = ['tasks', 'list', normalizeFilter({ project: 'inbox' })];
    const all = ['tasks', 'list', normalizeFilter({ status: 'open' })];
    const project = ['tasks', 'list', normalizeFilter({ project: 'prj_a' })];
    qc.setQueryData(inbox, [t]);
    qc.setQueryData(all, [t]);
    qc.setQueryData(project, []);
    qc.setQueryData(['tasks', 'detail', t.id], { ...t, description: null });

    // Triaged into a project: leaves the inbox, joins the project, stays in "all open".
    mergeTasks(qc, { ...t, projectId: 'prj_a', columnId: 'col_todo' });
    expect(qc.getQueryData<Task[]>(inbox)).toEqual([]);
    expect(qc.getQueryData<Task[]>(project)!.map((x) => x.id)).toEqual([t.id]);
    expect(qc.getQueryData<Task[]>(all)![0]!.projectId).toBe('prj_a');
    expect(
      qc.getQueryData<{ projectId: string; description: null }>(['tasks', 'detail', t.id]),
    ).toMatchObject({
      projectId: 'prj_a',
      description: null,
    });

    dropTasks(qc, t.id);
    expect(qc.getQueryData<Task[]>(project)).toEqual([]);
    expect(qc.getQueryData(['tasks', 'detail', t.id])).toBeUndefined();
  });
});
