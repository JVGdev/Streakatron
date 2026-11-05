// Phase 4b: Spotlight (D33), waiting columns and required projects (D32), played through the
// slice's "done when".

import { addDays, userDay } from '@streakatron/shared/time';
import { beforeEach, describe, expect, it } from 'vitest';
import { client, owner, resetDb, setUpOwner, type Client } from './helpers';

let as: Client;

beforeEach(async () => {
  await resetDb();
  as = client(await setUpOwner());
});

const today = () => userDay(new Date(), { timeZone: owner.timezone, dayStartHour: 4 });

const newProject = async (body: Record<string, unknown>) => {
  const res = await as.post('/api/projects', body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as { id: string; required: boolean; status: string };
};

const newTask = async (body: Record<string, unknown>) => {
  const res = await as.post('/api/tasks', body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as { id: string; status: string };
};

const spotlight = (id: string, on = true, replace?: string) =>
  as.post('/api/spotlight', { id, on, ...(replace ? { replace } : {}) });

describe('required projects', () => {
  it('don’t count toward the active limit and are never offered for parking', async () => {
    for (const title of ['A', 'B', 'C']) await newProject({ title });
    const full = await as.post('/api/projects', { title: 'D' });
    expect(full.status).toBe(409);

    const course = await newProject({ title: 'Online course', required: true });
    expect(course).toMatchObject({ status: 'active', required: true });

    // Another chosen project still can't be active, and the required one isn't offered to park.
    const parked = await newProject({ title: 'E', status: 'parked' });
    const res = await as.post(`/api/projects/${parked.id}/status`, { status: 'active' });
    expect(res.status).toBe(409);
    expect(res.body.error.details.active.map((p: { title: string }) => p.title)).toEqual([
      'A',
      'B',
      'C',
    ]);

    // Turning "required" off counts it again: no room, so it's refused.
    const off = await as.patch(`/api/projects/${course.id}`, { required: false });
    expect(off.status).toBe(409);
    expect(off.body.error.code).toBe('active_limit');

    // A parked required project activates even at the limit.
    await as.post(`/api/projects/${course.id}/status`, { status: 'parked' });
    const back = await as.post(`/api/projects/${course.id}/status`, { status: 'active' });
    expect(back.status, JSON.stringify(back.body)).toBe(200);
  });
});

describe('waiting columns', () => {
  it('are never the next action and come back on Today as a follow-up', async () => {
    const p = await newProject({ title: 'Exchange paperwork' });
    const col = await as.post(`/api/projects/${p.id}/columns`, {
      title: 'Waiting',
      category: 'waiting',
    });
    expect(col.status).toBe(201);
    const letter = await newTask({
      title: 'Waiting for the acceptance letter',
      projectId: p.id,
      columnId: col.body.id,
      scheduledDate: addDays(today(), 3),
    });
    expect(letter.status).toBe('waiting');

    let project = (await as.get(`/api/projects/${p.id}`)).body.project;
    expect(project.nextAction).toBeNull();
    const pin = await as.patch(`/api/projects/${p.id}`, { nextActionTaskId: letter.id });
    expect(pin.status).toBe(400);

    const visa = await newTask({ title: 'Check the visa status', projectId: p.id });
    project = (await as.get(`/api/projects/${p.id}`)).body.project;
    expect(project.nextAction.id).toBe(visa.id);

    // A board can't be left with only waiting and done columns.
    const columns = (await as.get(`/api/projects/${p.id}`)).body.columns as {
      id: string;
      category: string;
    }[];
    const todo = columns.find((c) => c.category === 'todo')!;
    const doing = columns.find((c) => c.category === 'in_progress')!;
    await as.del(`/api/columns/${doing.id}`);
    const lastOpen = await as.patch(`/api/columns/${todo.id}`, { category: 'waiting' });
    expect(lastOpen.status).toBe(409);
  });
});

describe('spotlight', () => {
  it('features up to 4 tasks and goals, oldest first, and asks which to drop', async () => {
    const p = await newProject({ title: 'Studying Japanese' });
    const katakana = await newTask({ title: 'Learn katakana', projectId: p.id });
    const goal = await as.post('/api/goals', {
      projectId: p.id,
      title: 'Read and write hiragana and katakana',
      kind: 'outcome',
    });
    await as.patch(`/api/tasks/${katakana.id}`, { goalId: goal.body.id });
    const others = [];
    for (const title of ['One', 'Two', 'Three']) others.push(await newTask({ title }));

    expect((await spotlight(katakana.id)).status).toBe(200);
    expect((await spotlight(goal.body.id)).status).toBe(200);
    await spotlight(others[0]!.id);
    await spotlight(others[1]!.id);
    const full = await spotlight(others[2]!.id);
    expect(full.status).toBe(409);
    expect(full.body.error.code).toBe('spotlight_full');
    expect(full.body.error.details.items).toHaveLength(4);

    const swapped = await spotlight(others[2]!.id, true, others[0]!.id);
    expect(swapped.status).toBe(200);
    expect(swapped.body.items.map((i: { title: string }) => i.title)).toEqual([
      'Learn katakana',
      'Read and write hiragana and katakana',
      'Two',
      'Three',
    ]);

    const list = (await as.get('/api/spotlight')).body.items;
    expect(list[0]).toEqual({ kind: 'task', id: katakana.id, goal: null, event: null });
    expect(list[1]).toMatchObject({
      kind: 'goal',
      goal: { title: 'Read and write hiragana and katakana', tasks: { open: 1, done: 0 } },
    });
    const task = (await as.get(`/api/tasks/${katakana.id}`)).body;
    expect(task.spotlightedAt).not.toBeNull();
  });

  it('lets go of done, deleted and parked things without losing the flag', async () => {
    const p = await newProject({ title: 'Studying Japanese' });
    const t = await newTask({ title: 'Learn katakana', projectId: p.id });
    await spotlight(t.id);

    await as.post(`/api/tasks/${t.id}/complete`, {});
    expect((await as.get('/api/spotlight')).body.items).toHaveLength(0);
    await as.post(`/api/tasks/${t.id}/reopen`, {});
    expect((await as.get('/api/spotlight')).body.items).toHaveLength(1);

    await as.post(`/api/projects/${p.id}/status`, { status: 'parked' });
    expect((await as.get('/api/spotlight')).body.items).toHaveLength(0);
    const resting = await spotlight((await newTask({ title: 'More', projectId: p.id })).id);
    expect(resting.status).toBe(400);
    expect(resting.body.error.code).toBe('spotlight_resting');

    await as.post(`/api/projects/${p.id}/status`, { status: 'active' });
    expect((await spotlight(t.id, false)).body.items).toHaveLength(0);
  });

  it('only touches this account’s things', async () => {
    const t = await newTask({ title: 'Mine' });
    await resetDb();
    as = client(await setUpOwner());
    expect((await spotlight(t.id)).status).toBe(404);
  });
});
