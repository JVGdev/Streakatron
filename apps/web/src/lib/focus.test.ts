import { describe, expect, it } from 'vitest';
import { focusList } from './focus';
import type { Project, Task } from './queries';

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
  spotlightedAt: null,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-03T10:00:00.000Z',
  status: 'todo',
  subtasks: { total: 0, done: 0 },
  ...over,
});

const project = (id: string, status: Project['status'], next?: string) =>
  ({
    id,
    title: id,
    status,
    nextAction: next ? { id: next, title: next, pinned: false } : null,
  }) as unknown as Project;

const today = '2026-11-04';

describe('focusList', () => {
  it('orders overdue, then today, then next actions', () => {
    const next = task({ projectId: 'prj_a' });
    const dueToday = task({ dueDate: today });
    const late = task({ dueDate: '2026-11-01' });
    const later = task({ dueDate: '2026-11-10' });
    const items = focusList(
      [next, dueToday, later, late],
      [project('prj_a', 'active', next.id)],
      today,
    );
    expect(items.map((i) => [i.task.id, i.reason])).toEqual([
      [late.id, 'overdue'],
      [dueToday.id, 'today'],
      [next.id, 'next'],
    ]);
  });

  it('sorts overdue tasks oldest first', () => {
    const a = task({ dueDate: '2026-11-03' });
    const b = task({ dueDate: '2026-10-20' });
    expect(focusList([a, b], [], today).map((i) => i.task.id)).toEqual([b.id, a.id]);
  });

  it('counts tasks scheduled today or earlier as today', () => {
    const s = task({ scheduledDate: '2026-11-02' });
    const future = task({ scheduledDate: '2026-11-05' });
    expect(focusList([s, future], [], today).map((i) => [i.task.id, i.reason])).toEqual([
      [s.id, 'today'],
    ]);
  });

  it('lists each task once, under its most urgent reason', () => {
    const t = task({ projectId: 'prj_a', dueDate: '2026-11-01' });
    const items = focusList([t], [project('prj_a', 'active', t.id)], today);
    expect(items).toEqual([{ task: t, reason: 'overdue' }]);
  });

  it('leaves out tasks of projects that aren’t active, and done tasks', () => {
    const parked = task({ projectId: 'prj_p', dueDate: '2026-11-01' });
    const done = task({ dueDate: today, completedAt: '2026-11-04T09:00:00Z', status: 'done' });
    const items = focusList([parked, done], [project('prj_p', 'parked', parked.id)], today);
    expect(items).toEqual([]);
  });
});
