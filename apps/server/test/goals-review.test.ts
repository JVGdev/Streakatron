// Phase 4f: number goals and the weekly review (D45), played through the slice's "done when":
// "Finish the course: lesson 12 of 40 by June" shows the pace needed; the weekly review is guided
// (its steps' writes work, finishing earns once); the review and project quests complete.

import { newId } from '@streakatron/shared/ids';
import { QUESTS, typeOfTemplate, type QuestTemplate } from '@streakatron/shared/quests';
import { addDays, startOfWeek, userDay } from '@streakatron/shared/time';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/client';
import { activity, questInstances } from '../src/db/schema';
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

const newProject = async (title = 'Studying Japanese') =>
  (await as.post('/api/projects', { title })).body.id as string;

async function newGoal(body: Record<string, unknown>) {
  const res = await as.post('/api/goals', body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body;
}

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
    periodStart: weekStart(),
    periodEnd: addDays(weekStart(), 6),
    target: 1,
    xp: 50,
    tier: QUESTS.tier[type],
    offeredAt: new Date(Date.now() - 1000),
    ...fields,
  });
  // Today's board counts as made, so the planner adds nothing random.
  await db.insert(questInstances).values({
    id: newId('quest'),
    userId,
    type: 'time',
    template: 'focus_today',
    periodStart: today(),
    periodEnd: today(),
    target: 9999,
    xp: 30,
    tier: 'standard',
    offeredAt: new Date(),
  });
  return id;
}

const status = async (id: string) =>
  (await db.select().from(questInstances).where(eq(questInstances.id, id)))[0]!.status;

describe('number goals', () => {
  it('"Finish the course: lesson 12 of 40 by June" shows the pace needed', async () => {
    const projectId = await newProject();
    const due = addDays(today(), 70);
    const goal = await newGoal({
      projectId,
      title: 'Finish the course',
      kind: 'number',
      targetCount: 40,
      unit: ' lessons ',
      dueDate: due,
    });
    expect(goal).toMatchObject({ unit: 'lessons', count: 0, targetMinutes: null });
    expect(goal.numbers).toMatchObject({ current: 0, target: 40, daysLeft: 71 });

    const res = await as.patch(`/api/goals/${goal.id}`, { count: 12 });
    expect(res.status).toBe(200);
    // 28 left over ~10 weeks: 3 a week.
    expect(res.body.numbers).toMatchObject({ current: 12, pace: { per: 'week', amount: 3 } });
  });

  it('is fed by a commitment from the day it is linked', async () => {
    const projectId = await newProject();
    const classes = (
      await as.post('/api/commitments', {
        title: 'Course class',
        projectId,
        measure: 'check',
        target: 3,
        period: 'week',
      })
    ).body;
    const minutes = (
      await as.post('/api/commitments', {
        title: 'Listening',
        projectId,
        measure: 'minutes',
        target: 15,
        period: 'day',
      })
    ).body;
    const goal = await newGoal({
      projectId,
      title: 'Finish the course',
      kind: 'number',
      targetCount: 40,
      commitmentId: classes.id,
    });
    expect(goal.commitmentFrom).toBe(today());
    await as.post(`/api/commitments/${classes.id}/entries`, {});
    await as.patch(`/api/goals/${goal.id}`, { count: 12 });
    const fresh = (await as.get(`/api/goals/${goal.id}`)).body;
    expect(fresh.numbers).toMatchObject({ current: 13, fed: 1 });

    // Minutes feed time goals, not number goals.
    const bad = await as.patch(`/api/goals/${goal.id}`, { commitmentId: minutes.id });
    expect(bad.status).toBe(400);
    // Another account's commitment answers 404.
    const other = await as.patch(`/api/goals/${goal.id}`, { commitmentId: newId('commitment') });
    expect(other.status).toBe(404);
  });

  it('drops the number parts when it becomes an outcome, and needs a target', async () => {
    const projectId = await newProject();
    expect((await as.post('/api/goals', { projectId, title: 'X', kind: 'number' })).status).toBe(
      400,
    );
    const goal = await newGoal({ projectId, title: 'X', kind: 'number', targetCount: 5 });
    await as.patch(`/api/goals/${goal.id}`, { count: 3 });
    const res = await as.patch(`/api/goals/${goal.id}`, { kind: 'outcome' });
    expect(res.body).toMatchObject({ targetCount: null, count: 0, numbers: null });
  });
});

describe('weekly review', () => {
  it('saves the reflection, earns 50 XP once, and completes its quest', async () => {
    const quest = await offer('weekly_review');
    const started = (await as.post('/api/review/start')).body;
    expect((await as.post('/api/review/start')).body.id).toBe(started.id);

    const doc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Good week.' }] }],
    };
    const saved = await as.patch(`/api/review/${started.id}`, { reflection: doc });
    expect(saved.body.reflectionText).toBe('Good week.');

    const done = await as.post(`/api/review/${started.id}/finish`, {});
    expect(done.status).toBe(200);
    expect(done.body.completedAt).not.toBeNull();
    expect(done.body.game.events).toContainEqual({ type: 'xp', amount: 50 + 50 });
    await as.post(`/api/review/${started.id}/finish`, {});
    const logged = await db
      .select({ xp: activity.xp })
      .from(activity)
      .where(and(eq(activity.userId, userId), eq(activity.type, 'review_completed')));
    expect(logged).toEqual([{ xp: 50 }]);
    expect(await status(quest)).toBe('completed');

    const page = (await as.get('/api/review')).body;
    expect(page.review.id).toBe(started.id);
    expect((await as.get('/api/review/status')).body.done).toBe(true);
  });

  it('summarizes the week and lists stalled projects', async () => {
    const worked = await newProject('Compilers');
    const stalled = await newProject('Thesis');
    const task = (await as.post('/api/tasks', { title: 'Lexer', projectId: worked })).body;
    await as.post(`/api/tasks/${task.id}/complete`);
    const page = (await as.get('/api/review')).body;
    // Early in the week the review looks at the past one; otherwise at this one.
    if (page.week.start === weekStart()) {
      expect(page.summary.tasksDone.map((t: { id: string }) => t.id)).toEqual([task.id]);
      expect(page.summary.activeDays).toBe(1);
      expect(page.stalled).toEqual([stalled]);
    } else {
      expect(page.stalled.sort()).toEqual([worked, stalled].sort());
    }
  });

  it('"Keep parked" revisits a parked project', async () => {
    const id = await newProject('Guitar');
    await as.post(`/api/projects/${id}/status`, { status: 'parked' });
    const quest = await offer('revisit_parked', { projectId: id });
    const active = await newProject('Active one');
    expect((await as.post('/api/review/keep-parked', { projectId: active })).status).toBe(409);
    expect((await as.post('/api/review/keep-parked', { projectId: id })).status).toBe(200);
    expect(await status(quest)).toBe('completed');
  });
});

describe('project quests', () => {
  it('"Finish N tasks of a goal" counts tasks of that goal done after it was offered', async () => {
    const projectId = await newProject();
    const goal = await newGoal({ projectId, title: 'Hiragana', kind: 'outcome' });
    const mk = async (title: string, goalId?: string) =>
      (await as.post('/api/tasks', { title, projectId, ...(goalId ? { goalId } : {}) })).body.id;
    const a = await mk('Rows a–n', goal.id);
    const b = await mk('Rows h–w', goal.id);
    const other = await mk('Other');
    const quest = await offer('goal_tasks', { goalId: goal.id, target: 2 });
    await as.post(`/api/tasks/${a}/complete`);
    await as.post(`/api/tasks/${other}/complete`);
    expect(await status(quest)).toBe('offered');
    await as.post(`/api/tasks/${b}/complete`);
    expect(await status(quest)).toBe('completed');
  });

  it('"Bring a number goal to N" completes when it gets there, and cancels when dropped', async () => {
    const projectId = await newProject();
    const goal = await newGoal({ projectId, title: 'Course', kind: 'number', targetCount: 40 });
    await as.patch(`/api/goals/${goal.id}`, { count: 12 });
    const quest = await offer('number_goal', { goalId: goal.id, target: 14 });
    await as.patch(`/api/goals/${goal.id}`, { count: 13 });
    expect(await status(quest)).toBe('offered');
    await as.patch(`/api/goals/${goal.id}`, { count: 14 });
    expect(await status(quest)).toBe('completed');

    const again = await offer('number_goal', { goalId: goal.id, target: 20 });
    await as.patch(`/api/goals/${goal.id}`, { status: 'dropped' });
    expect(await status(again)).toBe('cancelled');
  });

  it('plans review and project quests with the week', async () => {
    const projectId = await newProject();
    const goal = await newGoal({ projectId, title: 'Hiragana', kind: 'outcome' });
    await as.post('/api/tasks', { title: 'Rows', projectId, goalId: goal.id });
    const board = (await as.get('/api/quests')).body;
    const types = board.quests.map((q: { type: string }) => q.type);
    expect(types).toContain('review');
    expect(types).toContain('project');
    expect(board.quests.find((q: { type: string }) => q.type === 'project').goalId).toBe(goal.id);
  });
});
