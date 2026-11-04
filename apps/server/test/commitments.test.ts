// Commitments (D31), played through the "Studying Japanese" use case (plan.md Phase 4a).

import { newId } from '@streakatron/shared/ids';
import { QUESTS, typeOfTemplate, type QuestTemplate } from '@streakatron/shared/quests';
import { addDays, startOfWeek, userDay } from '@streakatron/shared/time';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/client';
import { activity, commitmentEntries, focusSessions, questInstances } from '../src/db/schema';
import { client, owner, resetDb, setUpOwner, type Client } from './helpers';

let as: Client;
let userId: string;

beforeEach(async () => {
  await resetDb();
  as = client(await setUpOwner());
  userId = (await as.get('/api/me')).body.user.id;
});

const MIN = 60_000;
const today = () => userDay(new Date(), { timeZone: owner.timezone, dayStartHour: 4 });

const newProject = async (title = 'Studying Japanese') =>
  (await as.post('/api/projects', { title })).body.id as string;

const newCommitment = async (body: Record<string, unknown>) => {
  const res = await as.post('/api/commitments', body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as { id: string } & Record<string, unknown>;
};

const log = (amount?: number, id?: string) =>
  as.post(`/api/commitments/${id}/entries`, amount === undefined ? {} : { amount });

const xpLog = () =>
  db
    .select({ type: activity.type, entityId: activity.entityId, xp: activity.xp })
    .from(activity)
    .where(eq(activity.userId, userId))
    .orderBy(activity.occurredAt, activity.id);

describe('commitments', () => {
  it('are made in every shape the use case needs, with defaults first', async () => {
    const p = await newProject();
    const duolingo = await newCommitment({ title: 'Duolingo lesson', projectId: p });
    expect(duolingo).toMatchObject({
      measure: 'check',
      target: 1,
      period: 'day',
      schedule: null,
      unit: null,
      project: { id: p, title: 'Studying Japanese' },
      day: { scheduled: true, due: true, met: false, progress: 0, target: 1 },
      streak: { current: 0, longest: 0, unit: 'day' },
      entries: [],
    });
    expect(duolingo.history).toHaveLength(28);
    expect(duolingo.id).toMatch(/^cmt_/);

    const anki = await newCommitment({
      title: 'Anki reviews',
      measure: 'count',
      target: 20,
      unit: ' cards ',
    });
    expect(anki).toMatchObject({ unit: 'cards', project: null });
    const classes = await newCommitment({
      title: 'Course class',
      period: 'week',
      target: 3,
      schedule: { days: [1] },
    });
    // A week has no weekdays: dropped rather than failing.
    expect(classes).toMatchObject({ period: 'week', target: 3, schedule: null });
    const everyDay = await newCommitment({
      title: 'Listening',
      measure: 'minutes',
      target: 15,
      schedule: { days: [0, 1, 2, 3, 4, 5, 6] },
    });
    expect(everyDay.schedule).toBeNull();

    const list = await as.get('/api/commitments');
    expect(list.body.commitments.map((c: { title: string }) => c.title)).toEqual([
      'Duolingo lesson',
      'Anki reviews',
      'Course class',
      'Listening',
    ]);
  });

  it('refuse shapes that make no sense', async () => {
    const bad = [
      { title: 'x', measure: 'check', period: 'week', target: 8 },
      { title: 'x', measure: 'minutes', target: 2000 },
      { title: 'x', measure: 'minutes', target: 15, unit: 'min' },
      { title: 'x', schedule: { days: [] } },
      { title: '' },
    ];
    for (const body of bad) {
      expect((await as.post('/api/commitments', body)).status, JSON.stringify(body)).toBe(400);
    }
    // A daily check's target is always 1.
    const c = await newCommitment({ title: 'Read', target: 5 });
    expect(c.target).toBe(1);
  });

  it('are edited, archived, deleted and restored, and stay private', async () => {
    const c = await newCommitment({ title: 'Duolingo' });
    const edited = await as.patch(`/api/commitments/${c.id}`, {
      title: 'Duolingo lesson',
      measure: 'count',
      target: 2,
      unit: 'lessons',
    });
    expect(edited.body).toMatchObject({ title: 'Duolingo lesson', target: 2, unit: 'lessons' });
    expect(
      (await as.patch(`/api/commitments/${c.id}`, { measure: 'check', period: 'week', target: 9 }))
        .status,
    ).toBe(400);

    const archived = await as.patch(`/api/commitments/${c.id}`, { archived: true });
    expect(archived.body.archivedAt).not.toBeNull();
    expect((await as.get('/api/commitments')).body.commitments).toHaveLength(0);
    expect((await as.get('/api/commitments?archived=true')).body.commitments).toHaveLength(1);
    expect((await log(1, c.id)).status).toBe(409);
    await as.patch(`/api/commitments/${c.id}`, { archived: false });

    await as.del(`/api/commitments/${c.id}`);
    expect((await as.get(`/api/commitments/${c.id}`)).status).toBe(404);
    await as.post(`/api/commitments/${c.id}/restore`);
    expect((await as.get(`/api/commitments/${c.id}`)).status).toBe(200);

    // Someone else's (or no one's) id answers 404.
    expect((await as.get('/api/commitments/cmt_01JC3Z0000000000000000000A')).status).toBe(404);
  });

  it('a daily check: one tick a day, 10 XP, the day active, its streak', async () => {
    const c = await newCommitment({ title: 'Duolingo lesson' });
    const res = await log(undefined, c.id);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      day: { met: true, due: false, progress: 1 },
      streak: { current: 1 },
    });
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.game.events).toEqual(
      expect.arrayContaining([
        { type: 'xp', amount: 10 },
        expect.objectContaining({ type: 'day_active' }),
      ]),
    );
    // A second tick adds nothing.
    const again = await log(undefined, c.id);
    expect(again.body.entries).toHaveLength(1);
    expect(again.body.game).toBeNull();

    // Unticking and ticking again earns nothing more (D15).
    await as.del(`/api/commitments/${c.id}/entries/${res.body.entries[0].id}`);
    const retick = await log(undefined, c.id);
    expect(retick.body.day.met).toBe(true);
    const met = (await xpLog()).filter((a) => a.type === 'commitment_met');
    expect(met.map((a) => a.xp)).toEqual([10, 0]);
    expect(met[0]!.entityId).toBe(`${c.id}:${today()}`);
  });

  it('an amount fills with +N; partial entries don’t make the day active', async () => {
    const c = await newCommitment({ title: 'Anki', measure: 'count', target: 20, unit: 'cards' });
    const partial = await log(12, c.id);
    expect(partial.body).toMatchObject({ day: { progress: 12, met: false, due: true } });
    expect(partial.body.game).toBeNull();
    expect((await as.get('/api/game/state')).body.streak.todayActive).toBe(false);

    const full = await log(8, c.id);
    expect(full.body).toMatchObject({ day: { progress: 20, met: true, due: false } });
    expect(full.body.game.events).toEqual(
      expect.arrayContaining([
        { type: 'xp', amount: 10 },
        expect.objectContaining({ type: 'day_active' }),
      ]),
    );
    // Going past the target logs, but meets nothing again.
    const more = await log(5, c.id);
    expect(more.body.day.progress).toBe(25);
    expect((await xpLog()).filter((a) => a.type === 'commitment_met')).toHaveLength(1);
    expect((await xpLog()).filter((a) => a.type === 'commitment_logged')).toHaveLength(3);
  });

  it('typed minutes count; one entry is at most a day', async () => {
    const c = await newCommitment({ title: 'Listening', measure: 'minutes', target: 15 });
    expect((await log(1441, c.id)).status).toBe(400);
    const res = await log(15, c.id);
    expect(res.body.day).toMatchObject({ progress: 15, met: true });
  });

  it('a weekly check: one a day, any entry makes the day active', async () => {
    const c = await newCommitment({ title: 'Course class', period: 'week', target: 3 });
    const res = await log(undefined, c.id);
    expect(res.body.day).toMatchObject({ progress: 1, met: false, due: false, today: 1 });
    expect(res.body.game.events).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'day_active' })]),
    );
    // Two earlier days this week (or last week's tail: either way the streak logic is unit-tested).
    const week = startOfWeek(today(), 1);
    expect(res.body.day.period).toEqual({ start: week, end: addDays(week, 6) });
  });
});

describe('focus on a commitment', () => {
  const start = async (commitmentId: string) => {
    const res = await as.post('/api/focus/start', {
      focusMinutes: 50,
      breakMinutes: 10,
      commitmentId,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.session as { id: string };
  };
  const ago = (id: string, minutes: number) =>
    db
      .update(focusSessions)
      .set({ startedAt: new Date(Date.now() - minutes * MIN) })
      .where(eq(focusSessions.id, id));

  it('a minutes commitment gets the minutes; its project’s time goal counts them', async () => {
    const p = await newProject();
    const goal = (
      await as.post('/api/goals', {
        projectId: p,
        title: '4 hours of Japanese a week',
        kind: 'time',
        targetMinutes: 240,
        period: 'week',
      })
    ).body;
    const c = await newCommitment({
      title: 'Listening',
      measure: 'minutes',
      target: 15,
      projectId: p,
    });
    const s = await start(c.id);
    expect((await as.get('/api/focus/current')).body.session.commitment).toMatchObject({
      id: c.id,
      title: 'Listening',
      measure: 'minutes',
      logged: false,
    });
    await ago(s.id, 20);
    const done = await as.post('/api/focus/finish');
    expect(done.body.last).toMatchObject({
      minutes: 20,
      project: { id: p },
      commitment: { id: c.id, logged: true },
    });
    const after = (await as.get(`/api/commitments/${c.id}`)).body;
    expect(after.day).toMatchObject({ progress: 20, met: true });
    expect(after.entries).toEqual([expect.objectContaining({ amount: 20, source: 'focus' })]);
    // 20 XP for the session, 10 for meeting the commitment.
    expect(done.body.game.events).toEqual(expect.arrayContaining([{ type: 'xp', amount: 30 }]));

    const g = (await as.get(`/api/goals/${goal.id}`)).body;
    expect(g.progress).toMatchObject({ minutes: 20, target: 240, met: false });
    expect(g.progress.perDay).toBe(Math.ceil(220 / g.progress.daysLeft));
  });

  it('a check offers "Mark done" on finish: once per session', async () => {
    const p = await newProject();
    const c = await newCommitment({
      title: 'Course class',
      period: 'week',
      target: 3,
      projectId: p,
    });
    const s = await start(c.id);
    await ago(s.id, 50);
    const done = await as.post('/api/focus/finish');
    expect(done.body.last.commitment).toMatchObject({ logged: false });
    // Not logged on its own: the finish card offers it.
    expect((await as.get(`/api/commitments/${c.id}`)).body.day.progress).toBe(0);

    const marked = await as.post(`/api/commitments/${c.id}/entries`, { focusSessionId: s.id });
    expect(marked.status).toBe(201);
    expect(marked.body.day.progress).toBe(1);
    expect(marked.body.entries[0]).toMatchObject({ source: 'focus' });
    const twice = await as.post(`/api/commitments/${c.id}/entries`, { focusSessionId: s.id });
    expect(twice.body.entries).toHaveLength(1);
    expect((await as.get('/api/focus/current')).body.last.commitment.logged).toBe(true);

    // Another commitment can't claim the session.
    const other = await newCommitment({ title: 'Anki', measure: 'count', target: 20 });
    expect(
      (await as.post(`/api/commitments/${other.id}/entries`, { focusSessionId: s.id })).status,
    ).toBe(400);
  });

  it('attaches one thing at a time', async () => {
    const c = await newCommitment({ title: 'Listening', measure: 'minutes', target: 15 });
    const p = await newProject();
    const res = await as.post('/api/focus/start', {
      focusMinutes: 25,
      breakMinutes: 5,
      commitmentId: c.id,
      projectId: p,
    });
    expect(res.status).toBe(400);
  });
});

describe('the rest of the app', () => {
  it('finds and mentions commitments', async () => {
    const c = await newCommitment({ title: 'Duolingo lesson' });
    const found = await as.get('/api/search?q=duolingo');
    expect(found.body.results[0]).toMatchObject({ kind: 'commitment', id: c.id, status: 'active' });
    const resolved = await as.get(`/api/entities/resolve?ids=${c.id}`);
    expect(resolved.body.entities[0]).toMatchObject({
      kind: 'commitment',
      title: 'Duolingo lesson',
    });

    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Before ' },
            { type: 'mention', attrs: { id: c.id, label: 'Duolingo lesson' } },
          ],
        },
      ],
    };
    const task = (await as.post('/api/tasks', { title: 'Plan the week', description: doc })).body;
    const back = await as.get(`/api/entities/${c.id}/backlinks`);
    expect(back.body.backlinks.map((b: { id: string }) => b.id)).toEqual([task.id]);
  });

  it('go with their project into its snapshot and come back', async () => {
    const p = await newProject();
    const c = await newCommitment({ title: 'Duolingo lesson', projectId: p });
    await log(undefined, c.id);
    const del = await as.del(`/api/projects/${p}`);
    expect((await as.get(`/api/commitments/${c.id}`)).status).toBe(404);
    await as.post(`/api/snapshots/${del.body.snapshotId}/restore`);
    const back = await as.get(`/api/commitments/${c.id}`);
    expect(back.status).toBe(200);
    expect(back.body.day.met).toBe(true);
    expect(
      await db.select().from(commitmentEntries).where(eq(commitmentEntries.commitmentId, c.id)),
    ).toHaveLength(1);
  });
});

describe('quests', () => {
  async function offer(template: QuestTemplate, target = 1) {
    const type = typeOfTemplate(template);
    const id = newId('quest');
    await db.insert(questInstances).values({
      id,
      userId,
      type,
      template,
      periodStart: today(),
      periodEnd: today(),
      target,
      xp: 30,
      tier: QUESTS.tier[type],
      offeredAt: new Date(Date.now() - 1000),
    });
    return id;
  }
  const status = async (id: string) =>
    (
      await db
        .select()
        .from(questInstances)
        .where(and(eq(questInstances.id, id)))
    )[0]!;

  it('"Log one commitment" and "Meet every commitment due today"', async () => {
    const duolingo = await newCommitment({ title: 'Duolingo lesson' });
    const anki = await newCommitment({ title: 'Anki', measure: 'count', target: 20 });
    const logOne = await offer('log_commitment');
    const meetAll = await offer('commitments_due', 2);

    await log(5, anki.id);
    expect(await status(logOne)).toMatchObject({ status: 'completed' });
    expect(await status(meetAll)).toMatchObject({ status: 'offered', progress: 0 });

    await log(undefined, duolingo.id);
    expect(await status(meetAll)).toMatchObject({ status: 'offered', progress: 1 });
    const last = await log(15, anki.id);
    expect(await status(meetAll)).toMatchObject({ status: 'completed' });
    expect(last.body.game.events).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'quest_done' })]),
    );
  });

  it('a parked project’s commitments rest with it', async () => {
    const p = await newProject();
    await newCommitment({ title: 'Duolingo lesson', projectId: p });
    const meetAll = await offer('commitments_due', 1);
    await as.post(`/api/projects/${p}/status`, { status: 'parked' });
    expect(await status(meetAll)).toMatchObject({ status: 'cancelled' });
  });
});
