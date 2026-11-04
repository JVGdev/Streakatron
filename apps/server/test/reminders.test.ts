// Phase 4c: reminders (D38), played through the slice's "done when": Duolingo not done by 10:00
// notifies every device, again every 3 hours, none after it's ticked (also from the notification's
// Done); "check the visa status" reminds on its day and time. The push service is faked.

import { addDays, userDay, zonedTime } from '@streakatron/shared/time';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/client';
import { activity, commitments, focusSessions, pushSubscriptions } from '../src/db/schema';
import {
  deviceLabel,
  setPushTransport,
  type PushMessage,
  type PushTransport,
} from '../src/services/push';
import { runReminders } from '../src/services/reminders';
import { client, owner, resetDb, setUpOwner, type Client } from './helpers';

let as: Client;
let userId: string;
let sent: { device: string; message: PushMessage }[];
let gone = new Set<string>();
let before: PushTransport;

beforeAll(() => {
  before = setPushTransport(async (sub, message) => {
    if (gone.has(sub.endpoint)) return 'gone';
    sent.push({ device: name(sub.endpoint), message });
    return 'sent';
  });
});
afterAll(() => {
  setPushTransport(before);
});

beforeEach(async () => {
  await resetDb();
  sent = [];
  gone = new Set();
  as = client(await setUpOwner());
  userId = (await as.get('/api/me')).body.user.id;
});

const SP = { timeZone: owner.timezone, dayStartHour: 4 };
const today = () => userDay(new Date(), SP);
/** Today (the user's), at a São Paulo wall-clock time. */
const at = (time: string, day = today()) =>
  zonedTime(day, Number(time.slice(0, 2)), SP.timeZone, Number(time.slice(3)));

const device = (label: string, n: number) => ({
  endpoint: `https://push.example.com/${label}-${n}`,
  keys: { p256dh: `key-${n}`, auth: `auth-${n}` },
});
/** "PC" from the fake endpoint. */
const name = (endpoint: string) => endpoint.split('/').pop()!.split('-')[0]!;

async function twoDevices() {
  expect((await as.post('/api/push/devices', device('PC', 1))).status).toBe(201);
  expect((await as.post('/api/push/devices', device('Phone', 2))).status).toBe(201);
}

const duolingoReminder = { kind: 'repeat', from: '10:00', everyMinutes: 180, until: '22:00' };

async function duolingo() {
  const res = await as.post('/api/commitments', {
    title: 'Duolingo lesson',
    reminder: duolingoReminder,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as { id: string; reminder: unknown };
}

const titles = () => sent.map((s) => `${s.device}: ${s.message.title}`);

describe('devices', () => {
  it('are named from the browser', () => {
    const chrome =
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
    const android =
      'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36';
    const iphone =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
    expect(deviceLabel(chrome)).toBe('Chrome on Linux');
    expect(deviceLabel(android)).toBe('Chrome on Android');
    expect(deviceLabel(iphone)).toBe('Safari on iPhone');
    expect(
      deviceLabel('Mozilla/5.0 (Windows NT 10.0; rv:140.0) Gecko/20100101 Firefox/140.0'),
    ).toBe('Firefox on Windows');
    expect(deviceLabel(undefined)).toBe('A browser');
  });

  it('subscribe once per endpoint, list, remove; another account can’t remove them', async () => {
    const key = await as.get('/api/push/key');
    expect(key.body.publicKey).toMatch(/^[A-Za-z0-9_-]{80,}$/);
    // The keys are kept: the same one comes back.
    expect((await as.get('/api/push/key')).body.publicKey).toBe(key.body.publicKey);

    await twoDevices();
    // The same browser subscribing again replaces its row.
    await as.post('/api/push/devices', {
      ...device('PC', 1),
      keys: { p256dh: 'new', auth: 'new' },
    });
    const list = (await as.get('/api/push/devices')).body.devices as {
      id: string;
      endpoint: string;
    }[];
    expect(list.map((d) => name(d.endpoint)).sort()).toEqual(['PC', 'Phone']);

    const test = await as.post('/api/push/test');
    expect(test.body).toEqual({ sent: 2, devices: 2 });

    // Another account's (here: a fresh one's) ids answer 404.
    await resetDb();
    as = client(await setUpOwner());
    expect((await as.del(`/api/push/devices/${list[0]!.id}`)).status).toBe(404);
  });

  it('a device the push service says is gone is removed', async () => {
    await twoDevices();
    gone.add(device('Phone', 2).endpoint);
    expect((await as.post('/api/push/test')).body).toEqual({ sent: 1, devices: 2 });
    const left = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));
    expect(left.map((d) => name(d.endpoint))).toEqual(['PC']);
  });
});

describe('commitment reminders', () => {
  it('Duolingo: 10:00 on every device, every 3 h, none after it’s ticked', async () => {
    await twoDevices();
    const c = await duolingo();
    expect(c.reminder).toEqual(duolingoReminder);

    expect(await runReminders(at('09:59'))).toBe(0);
    expect(await runReminders(at('10:00'))).toBe(1);
    expect(titles().sort()).toEqual(['PC: Duolingo lesson', 'Phone: Duolingo lesson']);
    expect(sent[0]!.message).toMatchObject({
      body: 'Not done yet today.',
      tag: c.id,
      target: { kind: 'commitment', id: c.id },
      actions: [
        { action: 'done', title: 'Done' },
        { action: 'snooze', title: 'Snooze 1 h' },
      ],
    });
    // Once per slot, however often the job runs.
    expect(await runReminders(at('10:01'))).toBe(0);
    expect(await runReminders(at('12:59'))).toBe(0);
    expect(await runReminders(at('13:00'))).toBe(1);

    // Ticked (the notification's Done is the same entry call): nothing more today.
    const done = await as.post(`/api/commitments/${c.id}/entries`, {});
    expect(done.status).toBe(201);
    expect(await runReminders(at('16:00'))).toBe(0);
    expect(await runReminders(at('22:00'))).toBe(0);
  });

  it('a missed slot past the grace is skipped, not sent late; nothing past the day end', async () => {
    await twoDevices();
    await duolingo();
    expect(await runReminders(at('11:30'))).toBe(0);
    expect(await runReminders(at('22:30'))).toBe(1);
    expect(await runReminders(at('23:59'))).toBe(0);
  });

  it('Snooze 1 h holds it for an hour, then reminds once', async () => {
    await twoDevices();
    const c = await duolingo();
    expect(await runReminders(at('10:00'))).toBe(1);
    const snoozed = await as.post('/api/reminders/snooze', { id: c.id });
    expect(snoozed.status).toBe(200);
    // Snoozed at the real "now"; moved to "snoozed at 12:30" to play the day.
    await db
      .update(commitments)
      .set({ remindAgainAt: at('13:30') })
      .where(eq(commitments.id, c.id));
    expect(await runReminders(at('13:00'))).toBe(0); // inside the snoozed hour
    expect(await runReminders(at('13:30'))).toBe(1);
    expect(await runReminders(at('13:31'))).toBe(0);
    expect(await runReminders(at('16:00'))).toBe(1);
  });

  it('counts say where they stand; minutes get no Done; unscheduled and parked ones rest', async () => {
    await twoDevices();
    const anki = await as.post('/api/commitments', {
      title: 'Anki reviews',
      measure: 'count',
      target: 20,
      unit: 'cards',
      reminder: { kind: 'once', at: '10:00' },
    });
    await as.post(`/api/commitments/${anki.body.id}/entries`, { amount: 5 });
    await as.post('/api/commitments', {
      title: 'Listening',
      measure: 'minutes',
      target: 15,
      reminder: { kind: 'once', at: '10:00' },
    });
    const project = await as.post('/api/projects', { title: 'Course', status: 'parked' });
    await as.post('/api/commitments', {
      title: 'Course class',
      projectId: project.body.id,
      reminder: { kind: 'once', at: '10:00' },
    });
    const weekday = new Date(`${today()}T12:00:00Z`).getUTCDay();
    await as.post('/api/commitments', {
      title: 'Not today',
      schedule: { days: [(weekday + 1) % 7] },
      reminder: { kind: 'once', at: '10:00' },
    });

    expect(await runReminders(at('10:00'))).toBe(2);
    const pc = sent.filter((s) => s.device === 'PC').map((s) => s.message);
    expect(pc.map((m) => [m.title, m.body, m.actions?.map((a) => a.action)])).toEqual(
      expect.arrayContaining([
        ['Anki reviews', '5 of 20 cards today.', ['plus1', 'snooze']],
        ['Listening', '0 of 15 min today.', ['snooze']],
      ]),
    );
    expect(pc).toHaveLength(2);
  });

  it('a reminder is checked when saved', async () => {
    const res = await as.post('/api/commitments', {
      title: 'Bad',
      reminder: { kind: 'repeat', from: '22:00', everyMinutes: 60, until: '10:00' },
    });
    expect(res.status).toBe(400);
    // Changing the reminder clears a snooze.
    const c = await duolingo();
    await as.post('/api/reminders/snooze', { id: c.id });
    const patched = await as.patch(`/api/commitments/${c.id}`, { reminder: null });
    expect(patched.body).toMatchObject({ reminder: null, remindAgainAt: null });
  });
});

describe('task reminders', () => {
  it('“check the visa status” reminds on its day and time, once, while open', async () => {
    await twoDevices();
    const remindAt = at('15:30').toISOString();
    const task = await as.post('/api/tasks', { title: 'Check the visa status', remindAt });
    expect(task.status).toBe(201);
    expect(task.body.remindAt).toBe(remindAt);

    expect(await runReminders(at('15:29'))).toBe(0);
    expect(await runReminders(at('15:31'))).toBe(1);
    expect(sent[0]!.message).toMatchObject({
      title: 'Check the visa status',
      body: 'Reminder',
      target: { kind: 'task', id: task.body.id },
      url: `/today?task=${task.body.id}`,
    });
    expect(await runReminders(at('15:32'))).toBe(0);

    // Snoozed: an hour after now. Moved back to a time today to play it.
    const s = await as.post('/api/reminders/snooze', { id: task.body.id });
    expect(new Date(s.body.until).getTime()).toBeGreaterThan(Date.now() + 59 * 60_000);
    await as.patch(`/api/tasks/${task.body.id}`, { remindAt: at('16:30').toISOString() });
    expect(await runReminders(at('16:30'))).toBe(1);

    // Done: no more.
    await as.patch(`/api/tasks/${task.body.id}`, { remindAt: at('17:00').toISOString() });
    await as.post(`/api/tasks/${task.body.id}/complete`);
    expect(await runReminders(at('17:00'))).toBe(0);
  });

  it('only snoozes this account’s things', async () => {
    const task = await as.post('/api/tasks', { title: 'Mine' });
    await resetDb();
    as = client(await setUpOwner());
    expect((await as.post('/api/reminders/snooze', { id: task.body.id })).status).toBe(404);
  });
});

describe('focus ended and the streak nudge', () => {
  it('a running session’s planned end is pushed once (with the tab closed)', async () => {
    await twoDevices();
    const res = await as.post('/api/focus/start', { focusMinutes: 25, breakMinutes: 5 });
    const id = res.body.session.id as string;
    const started = at('10:00');
    await db.update(focusSessions).set({ startedAt: started }).where(eq(focusSessions.id, id));
    expect(await runReminders(at('10:24'))).toBe(0);
    expect(await runReminders(at('10:25'))).toBe(1);
    expect(sent[0]!.message).toMatchObject({ title: 'Focus session done', tag: `focus-${id}` });
    expect(await runReminders(at('10:26'))).toBe(0);

    // Turned off in Settings: none.
    await as.patch('/api/settings', { notifications: { focusEnded: false, streakNudgeAt: null } });
    await db
      .update(focusSessions)
      .set({ startedAt: at('11:00') })
      .where(eq(focusSessions.id, id));
    expect(await runReminders(at('11:25'))).toBe(0);
  });

  it('the evening nudge comes once, only when the streak is alive and today isn’t active', async () => {
    await twoDevices();
    await as.patch('/api/settings', {
      notifications: { focusEnded: true, streakNudgeAt: '20:00' },
    });
    // No streak yet: nothing to keep.
    expect(await runReminders(at('20:00'))).toBe(0);

    // Yesterday was active (a task done, moved back a day): the streak is 1 and today isn't active.
    const t = await as.post('/api/tasks', { title: 'Yesterday’s task' });
    await as.post(`/api/tasks/${t.body.id}/complete`);
    await db
      .update(activity)
      .set({ localDate: addDays(today(), -1) })
      .where(eq(activity.userId, userId));
    expect(await runReminders(at('19:59'))).toBe(0);
    expect(await runReminders(at('20:00'))).toBe(1);
    expect(sent[0]!.message.title).toBe('Keep your 1-day streak');
    // At most one a day.
    expect(await runReminders(at('20:30'))).toBe(0);

    // A day that's already active gets none.
    const tomorrow = addDays(today(), 1);
    const t2 = await as.post('/api/tasks', { title: 'Today’s task' });
    await as.post(`/api/tasks/${t2.body.id}/complete`);
    await db.update(activity).set({ localDate: tomorrow }).where(eq(activity.entityId, t2.body.id));
    expect(await runReminders(at('20:00', tomorrow))).toBe(0);
  });
});
