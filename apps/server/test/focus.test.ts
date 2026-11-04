import { userDay } from '@streakatron/shared/time';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/client';
import { activity, focusSessions } from '../src/db/schema';
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

const start = async (body: Record<string, unknown> = {}) => {
  const res = await as.post('/api/focus/start', { focusMinutes: 25, breakMinutes: 5, ...body });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.session as { id: string };
};

/** Move the open session back in time: it started `minutes` ago (a pause moves with it). */
async function ago(id: string, minutes: number, pausedMinutesAgo?: number) {
  await db
    .update(focusSessions)
    .set({
      startedAt: new Date(Date.now() - minutes * MIN),
      ...(pausedMinutesAgo !== undefined
        ? { pausedAt: new Date(Date.now() - pausedMinutesAgo * MIN) }
        : {}),
    })
    .where(eq(focusSessions.id, id));
}

const log = () =>
  db
    .select({
      type: activity.type,
      entityId: activity.entityId,
      xp: activity.xp,
      occurredAt: activity.occurredAt,
      payload: activity.payload,
    })
    .from(activity)
    .where(eq(activity.userId, userId));

describe('the timer', () => {
  it('starts, pauses, resumes and survives a reload', async () => {
    const s = await start();
    const current = await as.get('/api/focus/current');
    expect(current.status).toBe(200);
    expect(current.body).toMatchObject({
      session: { id: s.id, status: 'running', plannedMinutes: 25, breakMinutes: 5, pausedMs: 0 },
      last: null,
      today: { minutes: 0, sessions: 0 },
      game: null,
    });
    expect(typeof current.body.now).toBe('string');

    const paused = await as.post('/api/focus/pause');
    expect(paused.body.session).toMatchObject({ status: 'paused' });
    expect(paused.body.session.pausedAt).not.toBeNull();
    // Pausing twice is fine.
    expect((await as.post('/api/focus/pause')).status).toBe(200);

    // The pause lasted 4 minutes.
    await ago(s.id, 10, 4);
    const resumed = await as.post('/api/focus/resume');
    expect(resumed.body.session).toMatchObject({ status: 'running', pausedAt: null });
    expect(resumed.body.session.pausedMs).toBeGreaterThanOrEqual(4 * MIN - 1000);
    expect(resumed.body.session.pausedMs).toBeLessThan(4 * MIN + 5000);
  });

  it('allows one open session at a time', async () => {
    const s = await start();
    const again = await as.post('/api/focus/start', { focusMinutes: 50, breakMinutes: 10 });
    expect(again.status).toBe(409);
    expect(again.body.error).toMatchObject({ code: 'focus_open', details: { sessionId: s.id } });
  });

  it('answers 409 to actions with no session', async () => {
    for (const action of ['pause', 'resume', 'finish', 'abandon']) {
      const res = await as.post(`/api/focus/${action}`);
      expect(res.status, action).toBe(409);
      expect(res.body.error.code).toBe('no_focus');
    }
  });

  it('validates input', async () => {
    expect((await as.post('/api/focus/start', { focusMinutes: 0, breakMinutes: 5 })).status).toBe(
      400,
    );
    expect((await as.post('/api/focus/start', { focusMinutes: 241, breakMinutes: 5 })).status).toBe(
      400,
    );
    const t = await as.post('/api/tasks', { title: 'x' });
    const p = await as.post('/api/projects', { title: 'p' });
    const both = await as.post('/api/focus/start', {
      focusMinutes: 25,
      breakMinutes: 5,
      taskId: t.body.id,
      projectId: p.body.id,
    });
    expect(both.status).toBe(400);
  });
});

describe('attaching', () => {
  it('takes the task’s project along', async () => {
    const p = await as.post('/api/projects', { title: 'Thesis' });
    const t = await as.post('/api/tasks', { title: 'Write intro', projectId: p.body.id });
    await start({ taskId: t.body.id });
    const { body } = await as.get('/api/focus/current');
    expect(body.session.task).toMatchObject({ id: t.body.id, title: 'Write intro' });
    expect(body.session.project).toMatchObject({ id: p.body.id, title: 'Thesis' });
  });

  it('takes a project alone', async () => {
    const p = await as.post('/api/projects', { title: 'Thesis' });
    await start({ projectId: p.body.id });
    const { body } = await as.get('/api/focus/current');
    expect(body.session.task).toBeNull();
    expect(body.session.project.id).toBe(p.body.id);
  });

  it('answers 404 for another account’s or a deleted task', async () => {
    const t = await as.post('/api/tasks', { title: 'gone' });
    await as.del(`/api/tasks/${t.body.id}`);
    const res = await as.post('/api/focus/start', {
      focusMinutes: 25,
      breakMinutes: 5,
      taskId: t.body.id,
    });
    expect(res.status).toBe(404);
    const other = await as.post('/api/focus/start', {
      focusMinutes: 25,
      breakMinutes: 5,
      projectId: 'prj_01JC3Z0000000000000000000A',
    });
    expect(other.status).toBe(404);
  });

  it('shows no task once it’s deleted mid-session', async () => {
    const t = await as.post('/api/tasks', { title: 'soon gone' });
    await start({ taskId: t.body.id });
    await as.del(`/api/tasks/${t.body.id}`);
    expect((await as.get('/api/focus/current')).body.session.task).toBeNull();
  });
});

describe('finishing', () => {
  it('credits whole minutes and 1 XP each, making the day active', async () => {
    const s = await start();
    await ago(s.id, 25.5);
    const res = await as.post('/api/focus/finish');
    expect(res.status).toBe(200);
    expect(res.body.session).toBeNull();
    expect(res.body.last).toMatchObject({ id: s.id, status: 'completed', minutes: 25 });
    expect(res.body.today).toEqual({ minutes: 25, sessions: 1 });
    expect(res.body.game.events).toEqual([
      { type: 'xp', amount: 25 },
      { type: 'day_active', streak: 1 },
    ]);
    const [row] = await log();
    expect(row).toMatchObject({
      type: 'focus_completed',
      entityId: s.id,
      xp: 25,
      payload: { minutes: 25, projectId: null },
    });
  });

  it('counts nothing under 10 minutes (the session still completes)', async () => {
    const s = await start();
    await ago(s.id, 9.9);
    const res = await as.post('/api/focus/finish');
    expect(res.body.last).toMatchObject({ status: 'completed', minutes: 9 });
    expect(res.body.game).toBeNull();
    expect(res.body.today).toEqual({ minutes: 9, sessions: 1 });
    expect(await log()).toEqual([]);
    const state = await as.get('/api/game/state');
    expect(state.body.streak.todayActive).toBe(false);
  });

  it('leaves pauses out, including one still open at the finish', async () => {
    const s = await start();
    // Started 40 minutes ago, paused for the last 15: 25 minutes of focus.
    await ago(s.id, 40);
    await as.post('/api/focus/pause');
    await ago(s.id, 40, 15);
    const res = await as.post('/api/focus/finish');
    expect(res.body.last.minutes).toBe(25);
    expect(res.body.last.pausedAt).toBeNull();
    expect(res.body.last.pausedMs).toBeGreaterThanOrEqual(15 * MIN - 1000);
  });

  it('counts overtime up to an hour past the plan', async () => {
    const s = await start();
    await ago(s.id, 70);
    const res = await as.post('/api/focus/finish');
    expect(res.body.last.minutes).toBe(70);
    expect(res.body.game.events[0]).toEqual({ type: 'xp', amount: 70 });
  });

  it('finishes on its own at the cap, dated then, when next read', async () => {
    const s = await start();
    // 25 planned + 60 overtime = 85; it started 5 hours ago, so it ended 3 h 35 min ago.
    await ago(s.id, 300);
    const res = await as.get('/api/focus/current');
    expect(res.body.session).toBeNull();
    expect(res.body.last).toMatchObject({ id: s.id, status: 'completed', minutes: 85 });
    expect(res.body.game.events[0]).toEqual({ type: 'xp', amount: 85 });
    const endedAt = new Date(res.body.last.endedAt).getTime();
    expect(Math.abs(endedAt - (Date.now() - 215 * MIN))).toBeLessThan(5000);
    const [row] = await log();
    expect(Math.abs(row!.occurredAt.getTime() - endedAt)).toBeLessThan(1000);
    // Reading again changes nothing.
    const again = await as.get('/api/focus/current');
    expect(again.body.game).toBeNull();
    expect(await log()).toHaveLength(1);
  });

  it('pausing a session past its cap answers it finished (and keeps that)', async () => {
    const s = await start();
    await ago(s.id, 300);
    const res = await as.post('/api/focus/pause');
    expect(res.status).toBe(200);
    expect(res.body.session).toBeNull();
    expect(res.body.last).toMatchObject({ id: s.id, status: 'completed', minutes: 85 });
    expect(res.body.game.events[0]).toEqual({ type: 'xp', amount: 85 });
    expect(await log()).toHaveLength(1);
  });

  it('finishing a session past its cap keeps the cap, and a new one can start', async () => {
    const s = await start();
    await ago(s.id, 300);
    const res = await as.post('/api/focus/finish');
    expect(res.status).toBe(200);
    expect(res.body.last).toMatchObject({ id: s.id, minutes: 85 });
    await start();
  });

  it('never counts a paused session’s pause toward the cap', async () => {
    const s = await start();
    // 20 minutes of focus, then paused for 10 hours: still open, nothing counted yet.
    await ago(s.id, 20);
    await as.post('/api/focus/pause');
    await ago(s.id, 620, 600);
    const res = await as.get('/api/focus/current');
    expect(res.body.session).toMatchObject({ id: s.id, status: 'paused' });
    const done = await as.post('/api/focus/finish');
    expect(done.body.last.minutes).toBe(20);
  });

  it('earns once: a finished session can’t be credited again', async () => {
    const s = await start();
    await ago(s.id, 30);
    await as.post('/api/focus/finish');
    expect((await as.post('/api/focus/finish')).status).toBe(409);
    expect(await log()).toHaveLength(1);
  });
});

describe('abandoning and notes', () => {
  it('abandons without counting', async () => {
    const s = await start();
    await ago(s.id, 30);
    const res = await as.post('/api/focus/abandon');
    expect(res.body.session).toBeNull();
    expect(res.body.last).toMatchObject({ id: s.id, status: 'abandoned', minutes: null });
    expect(res.body.today).toEqual({ minutes: 0, sessions: 0 });
    expect(res.body.game).toBeNull();
    expect(await log()).toEqual([]);
  });

  it('writes a note on a finished session', async () => {
    const s = await start();
    await ago(s.id, 12);
    await as.post('/api/focus/finish');
    const res = await as.patch(`/api/focus/${s.id}`, { note: '  Outlined chapter 2 ' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: s.id, note: 'Outlined chapter 2' });
    expect((await as.patch(`/api/focus/${s.id}`, { note: '' })).body.note).toBeNull();
    expect((await as.patch(`/api/focus/${s.id}`, { note: 'x'.repeat(501) })).status).toBe(400);
  });

  it('scopes sessions by user', async () => {
    const res = await as.patch('/api/focus/fcs_01JC3Z0000000000000000000A', { note: 'hi' });
    expect(res.status).toBe(404);
  });
});

describe('today', () => {
  it('sums today’s completed sessions', async () => {
    for (const minutes of [12, 30]) {
      const s = await start();
      await ago(s.id, minutes);
      await as.post('/api/focus/finish');
    }
    const { body } = await as.get('/api/focus/current');
    expect(body.today).toEqual({ minutes: 42, sessions: 2 });
    const state = await as.get('/api/game/state');
    expect(state.body).toMatchObject({ today: today(), level: { xp: 42 } });
  });
});

describe('settings', () => {
  it('saves focus presets', async () => {
    const presets = [
      { focusMinutes: 15, breakMinutes: 3 },
      { focusMinutes: 90, breakMinutes: 20 },
    ];
    const res = await as.patch('/api/settings', { focusPresets: presets });
    expect(res.status).toBe(200);
    expect(res.body.focusPresets).toEqual(presets);
    expect((await as.patch('/api/settings', { focusPresets: [] })).status).toBe(400);
  });
});
