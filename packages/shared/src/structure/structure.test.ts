import { describe, expect, it } from 'vitest';
import {
  boardProblem,
  canTransition,
  checkedOrder,
  firstColumnOf,
  firstOpenColumn,
  pickNextAction,
  placeAt,
  type BoardColumnLike,
  type BoardTaskLike,
} from '.';

describe('placeAt', () => {
  it('moves an item within a list', () => {
    expect(placeAt(['a', 'b', 'c', 'd'], 'a', 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(placeAt(['a', 'b', 'c', 'd'], 'd', 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(placeAt(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'b', 'c']);
  });

  it('inserts a new item and clamps the index', () => {
    expect(placeAt(['a', 'b'], 'x', 1)).toEqual(['a', 'x', 'b']);
    expect(placeAt(['a', 'b'], 'x', 99)).toEqual(['a', 'b', 'x']);
    expect(placeAt(['a', 'b'], 'x', -3)).toEqual(['x', 'a', 'b']);
    expect(placeAt([], 'x', 0)).toEqual(['x']);
  });
});

describe('checkedOrder', () => {
  it('accepts a permutation of what exists', () => {
    expect(checkedOrder(['a', 'b', 'c'], ['c', 'a', 'b'])).toEqual(['c', 'a', 'b']);
  });

  it('rejects missing, extra, unknown or repeated ids', () => {
    expect(checkedOrder(['a', 'b', 'c'], ['a', 'b'])).toBeNull();
    expect(checkedOrder(['a', 'b'], ['a', 'b', 'c'])).toBeNull();
    expect(checkedOrder(['a', 'b'], ['a', 'x'])).toBeNull();
    expect(checkedOrder(['a', 'b'], ['a', 'a'])).toBeNull();
  });
});

describe('project lifecycle', () => {
  it('allows the documented transitions', () => {
    expect(canTransition('active', 'parked')).toBe(true);
    expect(canTransition('parked', 'active')).toBe(true);
    expect(canTransition('active', 'completed')).toBe(true);
    expect(canTransition('completed', 'active')).toBe(true);
    expect(canTransition('completed', 'archived')).toBe(true);
    expect(canTransition('archived', 'parked')).toBe(true);
  });

  it('brings archived projects back as parked only', () => {
    expect(canTransition('archived', 'active')).toBe(false);
    expect(canTransition('archived', 'completed')).toBe(false);
  });

  it('has no transition to the same status', () => {
    for (const s of ['active', 'parked', 'completed', 'archived'] as const) {
      expect(canTransition(s, s)).toBe(false);
    }
  });
});

const columns: BoardColumnLike[] = [
  { id: 'done', category: 'done', sortOrder: 3 },
  { id: 'todo', category: 'todo', sortOrder: 0 },
  { id: 'later', category: 'todo', sortOrder: 1 },
  { id: 'doing', category: 'in_progress', sortOrder: 2 },
];

const task = (
  id: string,
  columnId: string | null,
  sortOrder: number,
  extra: Partial<BoardTaskLike> = {},
) => ({
  id,
  columnId,
  sortOrder,
  completedAt: null,
  parentTaskId: null,
  ...extra,
});

describe('columns', () => {
  it('finds the leftmost column of a category', () => {
    expect(firstColumnOf(columns, 'todo')?.id).toBe('todo');
    expect(firstColumnOf(columns, 'done')?.id).toBe('done');
    expect(firstOpenColumn(columns)?.id).toBe('todo');
    expect(firstOpenColumn(columns.filter((c) => c.category !== 'todo'))?.id).toBe('doing');
  });

  it('needs a done column and an open one', () => {
    expect(boardProblem(columns)).toBeNull();
    expect(boardProblem([{ category: 'todo' }, { category: 'in_progress' }])).toMatch(/done/);
    expect(boardProblem([{ category: 'done' }])).toMatch(/open/);
    expect(boardProblem([])).not.toBeNull();
  });
});

describe('next action', () => {
  it('prefers what is in progress, then the top of to do', () => {
    const tasks = [task('t1', 'todo', 0), task('t2', 'doing', 5), task('t3', 'doing', 1)];
    expect(pickNextAction(null, columns, tasks)).toBe('t3');
    expect(pickNextAction(null, columns, tasks.slice(0, 1))).toBe('t1');
  });

  it('reads columns left to right and tasks top to bottom', () => {
    const tasks = [task('t1', 'later', 0), task('t2', 'todo', 9), task('t3', 'todo', 4)];
    expect(pickNextAction(null, columns, tasks)).toBe('t3');
  });

  it('uses the pinned task while it is open', () => {
    const tasks = [task('t1', 'doing', 0), task('t2', 'later', 3)];
    expect(pickNextAction('t2', columns, tasks)).toBe('t2');
    const done = [task('t1', 'doing', 0), task('t2', 'later', 3, { completedAt: new Date() })];
    expect(pickNextAction('t2', columns, done)).toBe('t1');
    expect(pickNextAction('gone', columns, tasks)).toBe('t1');
  });

  it('skips done tasks, subtasks and tasks off the board', () => {
    const tasks = [
      task('t1', 'doing', 0, { completedAt: '2026-11-03T10:00:00Z' }),
      task('t2', 'doing', 1, { parentTaskId: 't9' }),
      task('t3', null, 0),
      task('t4', 'done', 0),
    ];
    expect(pickNextAction(null, columns, tasks)).toBeNull();
    expect(pickNextAction(null, columns, [])).toBeNull();
  });
});
