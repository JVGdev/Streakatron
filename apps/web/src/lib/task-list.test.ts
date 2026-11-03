import { describe, expect, it } from 'vitest';
import type { Project, Task } from './queries';
import { DEFAULT_LIST, filterTasks, groupTasks, isOverdue, sortTasks } from './task-list';

let n = 0;
const task = (over: Partial<Task> = {}): Task => ({
  id: `tsk_${++n}`,
  projectId: null,
  goalId: null,
  parentTaskId: null,
  columnId: null,
  title: `Task ${n}`,
  descriptionText: '',
  effort: null,
  dueDate: null,
  scheduledDate: null,
  sortOrder: n,
  completedAt: null,
  createdAt: `2026-11-0${(n % 9) + 1}T10:00:00.000Z`,
  updatedAt: '2026-11-03T10:00:00.000Z',
  status: 'todo',
  subtasks: { total: 0, done: 0 },
  ...over,
});

const today = '2026-11-04'; // a Wednesday
const done = { completedAt: '2026-11-04T09:00:00Z', status: 'done' as const };
const titles = (ts: Task[]) => ts.map((t) => t.title);

describe('filters', () => {
  const late = task({ title: 'late', dueDate: '2026-11-02' });
  const due = task({ title: 'due', dueDate: today });
  const planned = task({ title: 'planned', scheduledDate: today });
  const sunday = task({ title: 'sunday', dueDate: '2026-11-08' });
  const later = task({ title: 'later', dueDate: '2026-11-20' });
  const undated = task({ title: 'undated' });
  const finished = task({ title: 'finished', dueDate: '2026-11-01', ...done });
  const all = [late, due, planned, sunday, later, undated, finished];
  const f = (o: Partial<typeof DEFAULT_LIST>) =>
    titles(filterTasks(all, { ...DEFAULT_LIST, ...o }, today));

  it('by date', () => {
    expect(f({ due: 'overdue' })).toEqual(['late']);
    expect(f({ due: 'today' })).toEqual(['late', 'due', 'planned']);
    expect(f({ due: 'week' })).toEqual(['late', 'due', 'planned', 'sunday']);
    expect(f({ due: 'none' })).toEqual(['undated']);
  });

  it('by status', () => {
    expect(f({ status: 'open' })).not.toContain('finished');
    expect(f({ status: 'done' })).toEqual(['finished']);
    expect(f({ status: 'all' })).toHaveLength(all.length);
  });

  it('by project and inbox', () => {
    const inProject = task({ projectId: 'prj_a', title: 'p' });
    const list = [inProject, undated];
    expect(titles(filterTasks(list, { ...DEFAULT_LIST, project: 'prj_a' }, today))).toEqual(['p']);
    expect(titles(filterTasks(list, { ...DEFAULT_LIST, project: 'inbox' }, today))).toEqual([
      'undated',
    ]);
  });

  it('knows what is overdue', () => {
    expect(isOverdue(late, today)).toBe(true);
    expect(isOverdue(due, today)).toBe(false);
    expect(isOverdue(finished, today)).toBe(false);
  });
});

describe('sorting', () => {
  it('by due date with undated last and done at the bottom', () => {
    const a = task({ title: 'a', dueDate: '2026-11-10' });
    const b = task({ title: 'b' });
    const c = task({ title: 'c', scheduledDate: '2026-11-05' });
    const d = task({ title: 'd', dueDate: '2026-11-01', ...done });
    expect(titles(sortTasks([a, b, c, d], 'due'))).toEqual(['c', 'a', 'b', 'd']);
  });

  it('by effort, largest first', () => {
    const s = task({ title: 's', effort: 'S' });
    const l = task({ title: 'l', effort: 'L' });
    const none = task({ title: 'none' });
    expect(titles(sortTasks([s, none, l], 'effort'))).toEqual(['l', 's', 'none']);
  });

  it('by title, ignoring case and accents', () => {
    expect(titles(sortTasks([task({ title: 'b' }), task({ title: 'Á' })], 'title'))).toEqual([
      'Á',
      'b',
    ]);
  });
});

describe('grouping', () => {
  const projects = [
    { id: 'prj_a', title: 'Thesis' },
    { id: 'prj_b', title: 'Gym' },
  ] as Project[];

  it('by project, inbox first, then in project order', () => {
    const groups = groupTasks(
      [task({ projectId: 'prj_b' }), task(), task({ projectId: 'prj_a' })],
      'project',
      { today, projects },
    );
    expect(groups.map((g) => g.label)).toEqual(['Inbox', 'Thesis', 'Gym']);
  });

  it('by date bucket', () => {
    const groups = groupTasks(
      [
        task({ dueDate: '2026-11-30' }),
        task({ dueDate: '2026-11-01' }),
        task({ dueDate: '2026-11-05' }),
        task(),
        task({ dueDate: '2026-11-07' }),
        task({ dueDate: today }),
      ],
      'due',
      { today, projects },
    );
    expect(groups.map((g) => g.label)).toEqual([
      'Overdue',
      'Today',
      'Tomorrow',
      'Next 7 days',
      'Later',
      'No date',
    ]);
  });

  it('by status, in progress first', () => {
    const groups = groupTasks([task(), task({ status: 'in_progress' }), task(done)], 'status', {
      today,
      projects,
    });
    expect(groups.map((g) => g.label)).toEqual(['In progress', 'To do', 'Done']);
  });
});
