import { newId } from '@streakatron/shared/ids';
import { addDays, eachDay, userDay } from '@streakatron/shared/time';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/client';
import { activity, userSettings, users } from '../src/db/schema';
import { client, owner, resetDb, setUpOwner, type Client } from './helpers';

let as: Client;
let userId: string;

beforeEach(async () => {
  await resetDb();
  as = client(await setUpOwner());
  userId = (await as.get('/api/me')).body.user.id;
});

const today = () => userDay(new Date(), { timeZone: owner.timezone, dayStartHour: 4 });

const newTask = async (title: string, extra: Record<string, unknown> = {}) => {
  const res = await as.post('/api/tasks', { title, ...extra });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as { id: string; game: unknown };
};

const newProject = async (title: string) => {
  const res = await as.post('/api/projects', { title });
  const { body } = await as.get(`/api/projects/${res.body.id}`);
  return body as { project: { id: string }; columns: { id: string; category: string }[] };
};

const log = async () =>
  db
    .select({ type: activity.type, entityId: activity.entityId, xp: activity.xp })
    .from(activity)
    .where(eq(activity.userId, userId))
    .orderBy(activity.occurredAt, activity.id);

/** Past activity, written straight to the log (the API only logs "now"). */
async function activeOn(days: string[], forUser = userId) {
  if (!days.length) return;
  await db.insert(activity).values(
    days.map((localDate) => ({
      id: newId('activity'),
      userId: forUser,
      type: 'task_completed' as const,
      entityId: newId('task'),
      occurredAt: new Date(`${localDate}T15:00:00Z`),
      localDate,
      xp: 10,
    })),
  );
}

describe('completing tasks', () => {
  it('logs the completion and answers the game block', async () => {
    const t = await newTask('Read chapter 3', { effort: 'M' });
    expect(t.game).toBeNull();
    const res = await as.post(`/api/tasks/${t.id}/complete`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: t.id, status: 'done' });
    expect(res.body.game.events).toEqual([
      { type: 'xp', amount: 25 },
      { type: 'day_active', streak: 1 },
    ]);
    expect(res.body.game.state).toMatchObject({
      today: today(),
      level: { level: 1, xp: 25, next: 100 },
      streak: { current: 1, todayActive: true },
    });
    expect(await log()).toEqual([{ type: 'task_completed', entityId: t.id, xp: 25 }]);
  });

  it('earns once: reopening keeps the XP, completing again earns nothing (D15)', async () => {
    const t = await newTask('Essay', { effort: 'L' });
    await as.post(`/api/tasks/${t.id}/complete`);
    const reopened = await as.post(`/api/tasks/${t.id}/reopen`);
    expect(reopened.body.game).toBeNull();
    const again = await as.post(`/api/tasks/${t.id}/complete`);
    expect(again.body.game.events).toEqual([]);
    expect(again.body.game.state.level.xp).toBe(50);
    expect((await log()).map((a) => [a.type, a.xp])).toEqual([
      ['task_completed', 50],
      ['task_reopened', 0],
      ['task_completed', 0],
    ]);
  });

  it('gives unset effort 10 XP and subtasks none, though both make the day active', async () => {
    const parent = await newTask('Parent');
    const sub = await newTask('Sub', { parentTaskId: parent.id });
    const s = await as.post(`/api/tasks/${sub.id}/complete`);
    expect(s.body.game.events).toEqual([{ type: 'day_active', streak: 1 }]);
    const p = await as.post(`/api/tasks/${parent.id}/complete`);
    expect(p.body.game.events).toEqual([{ type: 'xp', amount: 10 }]);
  });

  it('doesn’t log completing a done task twice', async () => {
    const t = await newTask('Once');
    await as.post(`/api/tasks/${t.id}/complete`);
    const again = await as.post(`/api/tasks/${t.id}/complete`);
    expect(again.body.game).toBeNull();
    expect(await log()).toHaveLength(1);
  });

  it('logs board moves into and out of a done column', async () => {
    const { project, columns } = await newProject('Thesis');
    const done = columns.find((c) => c.category === 'done')!;
    const todo = columns.find((c) => c.category === 'todo')!;
    const t = await newTask('Card', { projectId: project.id, effort: 'S' });
    const into = await as.post(`/api/tasks/${t.id}/move`, { columnId: done.id, index: 0 });
    expect(into.body.game.events[0]).toEqual({ type: 'xp', amount: 10 });
    const within = await as.post(`/api/tasks/${t.id}/move`, { columnId: done.id, index: 0 });
    expect(within.body.game).toBeNull();
    await as.post(`/api/tasks/${t.id}/move`, { columnId: todo.id, index: 0 });
    expect((await log()).map((a) => a.type)).toEqual(['task_completed', 'task_reopened']);
  });

  it('logs a task created straight into a done column', async () => {
    const { project, columns } = await newProject('Thesis');
    const done = columns.find((c) => c.category === 'done')!;
    const t = await newTask('Already done', { projectId: project.id, columnId: done.id });
    expect((t.game as { events: unknown[] }).events).toContainEqual({ type: 'xp', amount: 10 });
  });

  it('logs the tasks a column completes when it becomes a done column', async () => {
    const { project, columns } = await newProject('Thesis');
    const doing = columns.find((c) => c.category === 'in_progress')!;
    const a = await newTask('A', { projectId: project.id, columnId: doing.id, effort: 'M' });
    const b = await newTask('B', { projectId: project.id, columnId: doing.id, effort: 'S' });
    const gone = await newTask('Gone', { projectId: project.id, columnId: doing.id });
    await as.del(`/api/tasks/${gone.id}`);
    const res = await as.patch(`/api/columns/${doing.id}`, { category: 'done' });
    expect(res.status).toBe(200);
    expect(res.body.game.events[0]).toEqual({ type: 'xp', amount: 35 });
    expect((await log()).map((x) => x.entityId).sort()).toEqual([a.id, b.id].sort());
  });

  it('halves task XP above 200 a day', async () => {
    let total = 0;
    for (let i = 0; i < 5; i++) {
      const t = await newTask(`Big ${i}`, { effort: 'L' });
      total = (await as.post(`/api/tasks/${t.id}/complete`)).body.game.state.level.xp;
    }
    expect(total).toBe(225);
  });
});

describe('game state', () => {
  it('starts empty', async () => {
    const { body } = await as.get('/api/game/state');
    expect(body).toMatchObject({
      today: today(),
      level: { level: 1, xp: 0, floor: 0, next: 100 },
      streak: { current: 0, longest: 0, freezes: 0, todayActive: false },
      week: { current: 0, week: { activeDays: 0, target: 4, met: false } },
    });
  });

  it('keeps a streak through a missed day with a banked freeze', async () => {
    const t = today();
    // Eight days ago through two days ago, minus yesterday: 7 in a row earn the freeze.
    await activeOn(eachDay(addDays(t, -8), addDays(t, -2)));
    const { body } = await as.get('/api/game/state');
    expect(body.streak).toMatchObject({
      current: 7,
      freezes: 0,
      frozenDays: [addDays(t, -1)],
      todayActive: false,
    });
    const task = await newTask('Keep it going');
    const res = await as.post(`/api/tasks/${task.id}/complete`);
    expect(res.body.game.events).toContainEqual({ type: 'day_active', streak: 8 });
  });

  it('reports a level up', async () => {
    await activeOn([addDays(today(), -3)]);
    await db.update(activity).set({ xp: 95 }).where(eq(activity.userId, userId));
    const t = await newTask('Push over', { effort: 'S' });
    const res = await as.post(`/api/tasks/${t.id}/complete`);
    expect(res.body.game.events).toContainEqual({ type: 'level_up', level: 2 });
  });

  it('counts only your own activity', async () => {
    const other = newId('user');
    await db.insert(users).values({ id: other, name: 'Eve', email: 'eve@example.com' });
    await db.insert(userSettings).values({ userId: other });
    await activeOn([today()], other);
    const { body } = await as.get('/api/game/state');
    expect(body.level.xp).toBe(0);
    expect(body.streak.todayActive).toBe(false);
  });

  it('needs a session', async () => {
    expect((await client('').get('/api/game/state')).status).toBe(401);
  });
});

describe('recompute', () => {
  it('replays the log with the current rules', async () => {
    const t = await newTask('A', { effort: 'L' });
    await as.post(`/api/tasks/${t.id}/complete`);
    await as.post(`/api/tasks/${t.id}/reopen`);
    await as.post(`/api/tasks/${t.id}/complete`);
    await db.update(activity).set({ xp: 7 }).where(eq(activity.userId, userId));
    const res = await as.post('/api/admin/recompute');
    expect(res.body).toEqual({ activities: 3, changed: 3, xp: 50 });
    expect((await log()).map((a) => a.xp)).toEqual([50, 0, 0]);
    expect((await as.post('/api/admin/recompute')).body.changed).toBe(0);
  });
});

describe('settings', () => {
  it('change the day and week rules', async () => {
    const res = await as.patch('/api/settings', {
      dayStartHour: 5,
      weekStart: 0,
      weeklyActiveDayTarget: 3,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ dayStartHour: 5, weekStart: 0, weeklyActiveDayTarget: 3 });
    const state = await as.get('/api/game/state');
    expect(state.body.week.week.target).toBe(3);
    expect((await as.patch('/api/settings', { dayStartHour: 24 })).status).toBe(400);
    expect((await as.patch('/api/settings', { weeklyActiveDayTarget: 0 })).status).toBe(400);
  });

  it('let the time zone change once a week (D17)', async () => {
    const first = await as.patch('/api/settings', { timezone: 'Europe/Lisbon' });
    expect(first.status).toBe(200);
    expect(first.body.timezone).toBe('Europe/Lisbon');
    // Sending the same zone again isn't a change.
    expect((await as.patch('/api/settings', { timezone: 'Europe/Lisbon' })).status).toBe(200);
    const second = await as.patch('/api/settings', { timezone: 'Asia/Tokyo' });
    expect(second.status).toBe(429);
    expect(second.body.error.code).toBe('timezone_locked');
    await db
      .update(userSettings)
      .set({ timezoneChangedAt: new Date(Date.now() - 8 * 86_400_000) })
      .where(eq(userSettings.userId, userId));
    expect((await as.patch('/api/settings', { timezone: 'Asia/Tokyo' })).status).toBe(200);
    expect((await as.patch('/api/settings', { timezone: 'Not/AZone' })).status).toBe(400);
  });
});
