import { newId } from '@streakatron/shared/ids';
import { QUESTS, typeOfTemplate, type QuestTemplate } from '@streakatron/shared/quests';
import { addDays, startOfWeek, userDay } from '@streakatron/shared/time';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/client';
import { activity, focusSessions, questInstances } from '../src/db/schema';
import { client, owner, resetDb, setUpOwner, type Client } from './helpers';

let as: Client;
let userId: string;

beforeEach(async () => {
  await resetDb();
  as = client(await setUpOwner());
  userId = (await as.get('/api/me')).body.user.id;
});

const today = () => userDay(new Date(), { timeZone: owner.timezone, dayStartHour: 4 });
const weekStart = () => startOfWeek(today(), 1);

/** Offer a quest directly (the planner is random; its rules are unit-tested in shared). */
async function offer(
  template: QuestTemplate,
  fields: Partial<typeof questInstances.$inferInsert> = {},
) {
  const type = typeOfTemplate(template);
  const id = newId('quest');
  await db.insert(questInstances).values({
    id,
    userId,
    type,
    template,
    periodStart: today(),
    periodEnd: today(),
    target: 1,
    xp: 30,
    tier: QUESTS.tier[type],
    offeredAt: new Date(Date.now() - 1000),
    ...fields,
  });
  return id;
}

/** Mark today's board and this week's quests as made, so the planner adds nothing random. */
async function boardsMade() {
  await offer('week_focus', {
    periodStart: weekStart(),
    periodEnd: addDays(weekStart(), 6),
    target: 9999,
  });
}

const quest = async (id: string) =>
  (await db.select().from(questInstances).where(eq(questInstances.id, id)))[0]!;

const questLog = () =>
  db
    .select({ type: activity.type, entityId: activity.entityId, xp: activity.xp })
    .from(activity)
    .where(and(eq(activity.userId, userId)));

const newProject = async (title: string) =>
  (await as.post('/api/projects', { title })).body.id as string;
const newTask = async (title: string, extra: Record<string, unknown> = {}) => {
  const res = await as.post('/api/tasks', { title, ...extra });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.id as string;
};

const questEvents = (game: { events: { type: string }[] } | null) =>
  (game?.events ?? []).filter((e) => e.type === 'quest_done' || e.type === 'board_done');
/** Quest completions only (a lone daily quest done also earns the board bonus). */
const questsDone = (game: { events: { type: string }[] } | null) =>
  questEvents(game).filter((e) => e.type === 'quest_done');

describe('the board', () => {
  it('is made on the first look: 3 daily, a time quest, quick ones and the weekly quests', async () => {
    const a = await newProject('Compilers');
    const b = await newProject('Thesis');
    await newTask('Read chapter 4', { projectId: a, effort: 'L' });
    await newTask('Outline', { projectId: b });
    await newTask('Email prof');

    const res = await as.get('/api/quests');
    expect(res.status).toBe(200);
    const types = res.body.quests.map((q: { type: string }) => q.type);
    expect(types.filter((t: string) => t === 'daily')).toHaveLength(3);
    expect(types.filter((t: string) => t === 'time')).toHaveLength(1);
    expect(types.filter((t: string) => t === 'quick').length).toBeGreaterThan(0);
    expect(types.filter((t: string) => t === 'quick').length).toBeLessThanOrEqual(2);
    const weekly = res.body.quests.filter((q: { type: string }) => q.type === 'weekly');
    expect(weekly.map((q: { template: string }) => q.template).sort()).toEqual([
      'week_focus',
      'week_projects',
      'week_target',
    ]);
    expect(res.body.bonus).toMatchObject({ xp: QUESTS.bonusXp, earned: false, done: 0, total: 3 });
    for (const q of res.body.quests) {
      expect(typeof q.title).toBe('string');
      expect(q.title).not.toContain('undefined');
      expect(q.status).toBe('offered');
    }

    // The second look makes nothing new.
    const again = await as.get('/api/quests');
    expect(again.body.quests.map((q: { id: string }) => q.id).sort()).toEqual(
      res.body.quests.map((q: { id: string }) => q.id).sort(),
    );
  });

  it('expires what’s past', async () => {
    const old = await offer('tasks_n', {
      periodStart: addDays(today(), -1),
      periodEnd: addDays(today(), -1),
      target: 3,
    });
    await as.get('/api/quests');
    expect(await quest(old)).toMatchObject({ status: 'expired' });
    expect((await quest(old)).closedAt).not.toBeNull();
  });

  it('rests the types turned off, and validates quest settings', async () => {
    const res = await as.patch('/api/settings', {
      questSettings: {
        restingTypes: ['daily', 'time', 'quick', 'make', 'weekly', 'review', 'project'],
        timeQuestMinMinutes: 15,
        timeQuestMaxMinutes: 180,
      },
    });
    expect(res.status).toBe(200);
    expect((await as.get('/api/quests')).body.quests).toEqual([]);
    const bad = await as.patch('/api/settings', {
      questSettings: { restingTypes: [], timeQuestMinMinutes: 120, timeQuestMaxMinutes: 60 },
    });
    expect(bad.status).toBe(400);
    const comeback = await as.patch('/api/settings', {
      questSettings: {
        restingTypes: ['comeback'],
        timeQuestMinMinutes: 15,
        timeQuestMaxMinutes: 180,
      },
    });
    expect(comeback.status).toBe(400);
  });
});

describe('completing quests', () => {
  it('completes a daily quest when its task is done: XP, a big moment, logged once', async () => {
    await boardsMade();
    const t = await newTask('Read chapter 4', { effort: 'M' });
    const q = await offer('top_item', { taskId: t, xp: 30 });
    const res = await as.post(`/api/tasks/${t}/complete`);
    expect(res.status).toBe(200);
    expect(questsDone(res.body.game)).toEqual([
      {
        type: 'quest_done',
        quest: {
          id: q,
          type: 'daily',
          title: 'Finish “Read chapter 4”',
          xp: 30,
          tier: 'standard',
          big: true,
        },
      },
    ]);
    // The task, the quest, and the bonus (it's the day's only daily quest).
    expect(res.body.game.events[0]).toEqual({ type: 'xp', amount: 25 + 30 + QUESTS.bonusXp });
    expect(await quest(q)).toMatchObject({ status: 'completed', progress: 1 });
    const logged = (await questLog()).filter((l) => l.type === 'quest_completed');
    expect(logged).toEqual([{ type: 'quest_completed', entityId: q, xp: 30 }]);

    // Reopening and completing again changes nothing.
    await as.post(`/api/tasks/${t}/reopen`);
    const again = await as.post(`/api/tasks/${t}/complete`);
    expect(questEvents(again.body.game)).toEqual([]);
  });

  it('counts today’s tasks, including ones done before the board', async () => {
    const t1 = await newTask('a');
    await as.post(`/api/tasks/${t1}/complete`);
    await boardsMade();
    const q = await offer('tasks_n', { target: 2 });
    await as.get('/api/quests');
    expect(await quest(q)).toMatchObject({ status: 'offered', progress: 1 });
    const t2 = await newTask('b');
    const res = await as.post(`/api/tasks/${t2}/complete`);
    expect(questsDone(res.body.game)).toHaveLength(1);
    expect(await quest(q)).toMatchObject({ status: 'completed', progress: 2 });
  });

  it('grants the board bonus once every daily quest is done', async () => {
    await boardsMade();
    const t = await newTask('one', { effort: 'L' });
    const other = await newTask('two');
    await offer('top_item', { taskId: t });
    await offer('tasks_n', { target: 2 });
    await offer('large_task');
    const first = await as.post(`/api/tasks/${other}/complete`);
    expect(questEvents(first.body.game)).toEqual([]);
    const res = await as.post(`/api/tasks/${t}/complete`);
    const events = questEvents(res.body.game);
    expect(events.filter((e) => e.type === 'quest_done')).toHaveLength(3);
    expect(events.at(-1)).toEqual({ type: 'board_done', xp: QUESTS.bonusXp });
    const board = await as.get('/api/quests');
    expect(board.body.bonus).toMatchObject({ earned: true, done: 3, total: 3 });
    const bonus = (await questLog()).filter((l) => l.type === 'quest_bonus');
    expect(bonus).toEqual([
      { type: 'quest_bonus', entityId: `board:${today()}`, xp: QUESTS.bonusXp },
    ]);
  });

  it('completes a time quest from focus sessions', async () => {
    await boardsMade();
    const q = await offer('focus_today', { target: 20, xp: 30 });
    await as.post('/api/focus/start', { focusMinutes: 25, breakMinutes: 5 });
    await db
      .update(focusSessions)
      .set({ startedAt: new Date(Date.now() - 21 * 60_000) })
      .where(eq(focusSessions.status, 'running'));
    const res = await as.post('/api/focus/finish');
    expect(questEvents(res.body.game)).toMatchObject([
      { quest: { id: q, type: 'time', big: true } },
    ]);
  });

  it('cancels a project quest when the project is parked', async () => {
    await boardsMade();
    const p = await newProject('Thesis');
    const q = await offer('stale_project', { projectId: p });
    await as.post(`/api/projects/${p}/status`, { status: 'parked' });
    expect(await quest(q)).toMatchObject({ status: 'cancelled' });
  });
});

describe('make quests and follow-ups (D16)', () => {
  it('a task made in the project completes it and spawns a follow-up for that task', async () => {
    await boardsMade();
    const p = await newProject('Compilers');
    const make = await offer('add_task', { projectId: p, xp: 15 });
    const res = await as.post('/api/tasks', { title: 'Write the lexer', projectId: p });
    const t = res.body.id;
    expect(questEvents(res.body.game)).toMatchObject([
      { quest: { id: make, type: 'make', big: false, title: 'Add a task to Compilers' } },
    ]);
    const board = await as.get('/api/quests');
    const follow = board.body.quests.find((q: { type: string }) => q.type === 'followup');
    expect(follow).toMatchObject({
      template: 'task_details',
      taskId: t,
      target: 2,
      title: 'Add 2 details to “Write the lexer”',
      periodEnd: addDays(today(), 1),
      canReroll: false,
    });
    expect(follow.hint).toContain('its effort');

    // One detail: progress; a second: done.
    await as.patch(`/api/tasks/${t}`, { effort: 'M' });
    expect(await quest(follow.id)).toMatchObject({ status: 'offered', progress: 1 });
    const done = await as.patch(`/api/tasks/${t}`, { dueDate: addDays(today(), 3) });
    expect(questEvents(done.body.game)).toMatchObject([
      { quest: { type: 'followup', tier: 'small' } },
    ]);
  });

  it('spawns one follow-up per thing, even when two make quests are met by it', async () => {
    await boardsMade();
    const p = await newProject('Compilers');
    await offer('add_task', { projectId: p });
    await offer('add_task', { projectId: p });
    await as.post('/api/tasks', { title: 'Both at once', projectId: p });
    const follows = await db
      .select()
      .from(questInstances)
      .where(eq(questInstances.type, 'followup'));
    expect(follows).toHaveLength(1);
  });

  it('cancels the follow-up when the made task is deleted', async () => {
    await boardsMade();
    const p = await newProject('Compilers');
    await offer('add_task', { projectId: p });
    const t = (await as.post('/api/tasks', { title: 'Oops', projectId: p })).body.id;
    const follow = (
      await db.select().from(questInstances).where(eq(questInstances.type, 'followup'))
    )[0]!;
    await as.del(`/api/tasks/${t}`);
    expect(await quest(follow.id)).toMatchObject({ status: 'cancelled' });
  });

  it('a goal made spawns a goal follow-up', async () => {
    await boardsMade();
    const p = await newProject('Thesis');
    await offer('add_goal', { projectId: p });
    const res = await as.post('/api/goals', {
      projectId: p,
      title: 'Submit draft',
      kind: 'outcome',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(questEvents(res.body.game)).toHaveLength(1);
    const follow = (
      await db.select().from(questInstances).where(eq(questInstances.type, 'followup'))
    )[0]!;
    expect(follow).toMatchObject({ template: 'goal_details', goalId: res.body.id, target: 2 });
    expect(follow.missing).toEqual(['description', 'due', 'task']);
  });

  it('breaking a task into subtasks', async () => {
    await boardsMade();
    const p = await newProject('Compilers');
    const t = await newTask('Parser', { projectId: p, effort: 'L' });
    const q = await offer('subtasks', { taskId: t, projectId: p, target: 2 });
    await newTask('Grammar', { parentTaskId: t });
    expect(await quest(q)).toMatchObject({ status: 'offered', progress: 1 });
    await newTask('AST', { parentTaskId: t });
    expect(await quest(q)).toMatchObject({ status: 'completed' });
    // Subtask breakdowns get no follow-up.
    expect(
      await db.select().from(questInstances).where(eq(questInstances.type, 'followup')),
    ).toEqual([]);
  });
});

describe('quick quests', () => {
  it('triage: an inbox task getting a project', async () => {
    await boardsMade();
    const t = await newTask('Loose thought');
    const p = await newProject('Thesis');
    const q = await offer('triage', { xp: 10 });
    const res = await as.patch(`/api/tasks/${t}`, { projectId: p });
    expect(questEvents(res.body.game)).toMatchObject([
      { quest: { id: q, type: 'quick', big: false } },
    ]);
  });

  it('effort and the next action pin', async () => {
    await boardsMade();
    const p = await newProject('Thesis');
    const t = await newTask('Outline', { projectId: p });
    const effort = await offer('effort', { taskId: t, xp: 10 });
    const pin = await offer('pin_next', { projectId: p, xp: 10 });
    await as.patch(`/api/tasks/${t}`, { effort: 'S' });
    await as.patch(`/api/projects/${p}`, { nextActionTaskId: t });
    expect(await quest(effort)).toMatchObject({ status: 'completed' });
    expect(await quest(pin)).toMatchObject({ status: 'completed' });
  });

  it('offers the next one after a completion, and stops at 3 a day', async () => {
    await boardsMade();
    const tasks = [];
    for (let i = 0; i < 6; i++) tasks.push(await newTask(`t${i}`));
    const p = await newProject('Home');
    await offer('triage', { xp: 10 });
    await offer('focus_note', { xp: 10 });
    // 1: triage done → one new quick quest offered in its place.
    await as.patch(`/api/tasks/${tasks[0]}`, { projectId: p });
    let quick = await db
      .select()
      .from(questInstances)
      .where(and(eq(questInstances.type, 'quick'), eq(questInstances.status, 'offered')));
    expect(quick).toHaveLength(2);
    // Complete whatever is offered until 3 are done.
    for (let round = 0; round < 4; round++) {
      quick = await db
        .select()
        .from(questInstances)
        .where(and(eq(questInstances.type, 'quick'), eq(questInstances.status, 'offered')));
      const next = quick.find((q) => q.template === 'effort');
      if (!next) break;
      await as.patch(`/api/tasks/${next.taskId}`, { effort: 'S' });
    }
    const all = await db.select().from(questInstances).where(eq(questInstances.type, 'quick'));
    const done = all.filter((q) => q.status === 'completed').length;
    expect(done).toBeLessThanOrEqual(QUESTS.quick.rewardedPerDay);
    if (done === QUESTS.quick.rewardedPerDay) {
      expect(all.filter((q) => q.status === 'offered')).toEqual([]);
    }
  });
});

describe('rerolls', () => {
  it('trades a quest once; the replacement can’t be rerolled', async () => {
    await newTask('a');
    await boardsMade();
    const q = await offer('tasks_n', { target: 5 });
    const res = await as.post(`/api/quests/${q}/reroll`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await quest(q)).toMatchObject({ status: 'rerolled' });
    const replacement = res.body.quests.find((x: { type: string }) => x.type === 'daily');
    expect(replacement.template).not.toBe('tasks_n');
    expect(replacement.canReroll).toBe(false);
    const again = await as.post(`/api/quests/${replacement.id}/reroll`);
    expect(again.status).toBe(409);
    expect((await as.post(`/api/quests/${q}/reroll`)).status).toBe(409);
  });

  it('refuses follow-ups and comebacks, and other accounts’ quests', async () => {
    await boardsMade();
    const comeback = await offer('comeback');
    expect((await as.post(`/api/quests/${comeback}/reroll`)).status).toBe(409);
    expect((await as.post('/api/quests/qst_01JC3Z0000000000000000000A/reroll')).status).toBe(404);
  });
});

describe('comeback and idle days', () => {
  const activeOn = async (localDate: string) =>
    db.insert(activity).values({
      id: newId('activity'),
      userId,
      type: 'task_completed',
      entityId: newId('task'),
      occurredAt: new Date(`${localDate}T15:00:00Z`),
      localDate,
      xp: 10,
    });

  it('offers a comeback after 2 inactive days, done by any active-day work', async () => {
    await activeOn(addDays(today(), -3));
    const board = await as.get('/api/quests');
    const comeback = board.body.quests.find((q: { type: string }) => q.type === 'comeback');
    expect(comeback).toMatchObject({ xp: 50, canReroll: false });
    // No tasks yet: only the daily quests that need none.
    expect(
      board.body.quests.filter((q: { type: string }) => q.type === 'daily').length,
    ).toBeGreaterThan(0);
    const t = await newTask('small step');
    const res = await as.post(`/api/tasks/${t}/complete`);
    expect(
      questEvents(res.body.game).map((e) => (e as { quest?: { type: string } }).quest?.type),
    ).toContain('comeback');
  });

  it('shows only the comeback after 7+ idle days', async () => {
    await activeOn(addDays(today(), -9));
    const board = await as.get('/api/quests');
    expect(board.body.quests.map((q: { type: string }) => q.type)).toEqual(['comeback']);
  });
});

describe('the heatmap', () => {
  it('sums each day’s activity', async () => {
    const t = await newTask('a', { effort: 'M' });
    await as.post(`/api/tasks/${t}/complete`);
    const res = await as.get('/api/stats/heatmap');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ to: today(), today: today() });
    expect(res.body.from).toBe(addDays(today(), -370));
    expect(res.body.days).toEqual([{ date: today(), xp: 25, tasks: 1, minutes: 0, active: true }]);
    expect((await as.get('/api/stats/heatmap?from=2026-01-10&to=2026-01-01')).status).toBe(400);
    expect((await as.get('/api/stats/heatmap?from=2024-01-01&to=2026-01-01')).status).toBe(400);
  });
});
