// Phase 4d: calendar and countdowns (D39), played through the slice's "done when": the JLPT and
// departure dates show on the calendar and as countdowns in Spotlight (the departure as "~March"
// until it's known); the course's classes show every week and remind 15 minutes before.

import { monthStart } from '@streakatron/shared/calendar';
import { addDays, startOfWeek, userDay, zonedTime } from '@streakatron/shared/time';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setPushTransport, type PushMessage, type PushTransport } from '../src/services/push';
import { runReminders } from '../src/services/reminders';
import { client, owner, resetDb, setUpOwner, type Client } from './helpers';

let as: Client;
let sent: PushMessage[];
let before: PushTransport;

beforeAll(() => {
  before = setPushTransport(async (_sub, message) => {
    sent.push(message);
    return 'sent';
  });
});
afterAll(() => {
  setPushTransport(before);
});

beforeEach(async () => {
  await resetDb();
  sent = [];
  as = client(await setUpOwner());
});

const SP = { timeZone: owner.timezone, dayStartHour: 4 };
const today = () => userDay(new Date(), SP);
const at = (day: string, time: string) =>
  zonedTime(day, Number(time.slice(0, 2)), SP.timeZone, Number(time.slice(3)));

async function japanese() {
  const res = await as.post('/api/projects', { title: 'Studying Japanese' });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function newEvent(body: Record<string, unknown>) {
  const res = await as.post('/api/events', body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body;
}

describe('the use case', () => {
  it('JLPT and departure on the calendar and counting down in Spotlight', async () => {
    const projectId = await japanese();
    const examDay = addDays(today(), 240);
    const jlpt = await newEvent({ title: 'JLPT N5', date: examDay, projectId });
    const departure = await newEvent({
      title: 'Departure',
      precision: 'month',
      date: addDays(today(), 120),
      projectId,
    });
    // A month is kept as its first day.
    expect(departure.date).toBe(monthStart(addDays(today(), 120)));
    expect(departure.precision).toBe('month');

    // The calendar shows the exam on its day, the departure in its month.
    const exam = await as.get(`/api/calendar?from=${examDay}&to=${addDays(examDay, 6)}`);
    expect(exam.status).toBe(200);
    expect(exam.body.events.map((e: { title: string }) => e.title)).toEqual(['JLPT N5']);
    expect(exam.body.events[0].days).toEqual([examDay]);
    const month = departure.date as string;
    const cal = await as.get(`/api/calendar?from=${month}&to=${addDays(month, 34)}`);
    expect(cal.body.events.find((e: { id: string }) => e.id === departure.id)).toMatchObject({
      precision: 'month',
      days: [],
    });

    // Both count down in Spotlight; the project page lists them.
    for (const e of [jlpt, departure]) {
      expect((await as.post('/api/spotlight', { id: e.id, on: true })).status).toBe(200);
    }
    const spot = (await as.get('/api/spotlight')).body.items;
    expect(
      spot.map((i: { kind: string; event: { title: string } }) => [i.kind, i.event.title]),
    ).toEqual([
      ['event', 'JLPT N5'],
      ['event', 'Departure'],
    ]);
    const list = (await as.get(`/api/events?project=${projectId}`)).body.events;
    expect(list.map((e: { title: string }) => e.title)).toEqual(['Departure', 'JLPT N5']);

    // Once the date is known it becomes a day; the countdown stays.
    const known = addDays(month, 13);
    const fixed = await as.patch(`/api/events/${departure.id}`, { precision: 'day', date: known });
    expect(fixed.body).toMatchObject({ precision: 'day', date: known });
    expect((await as.get('/api/spotlight')).body.items).toHaveLength(2);

    // A date still to be decided counts down too ("Date TBD").
    const tbd = await newEvent({ title: 'Visa interview', precision: 'tbd' });
    expect(tbd.date).toBeNull();
    expect((await as.post('/api/spotlight', { id: tbd.id, on: true })).status).toBe(200);
  });

  it('the course’s classes every week, reminding 15 minutes before', async () => {
    const projectId = await japanese();
    const monday = startOfWeek(today(), 1);
    const course = await newEvent({
      title: 'Course class',
      projectId,
      date: monday,
      startTime: '19:00',
      durationMinutes: 90,
      repeat: { every: 'week', interval: 1, weekdays: [3, 1] },
      reminderMinutes: 15,
    });
    expect(course.repeat).toEqual({ every: 'week', interval: 1, weekdays: [1, 3], until: null });

    const cal = await as.get(`/api/calendar?from=${monday}&to=${addDays(monday, 13)}`);
    expect(cal.body.events[0].days).toEqual([
      monday,
      addDays(monday, 2),
      addDays(monday, 7),
      addDays(monday, 9),
    ]);

    await as.post('/api/push/devices', {
      endpoint: 'https://push.example.com/phone',
      keys: { p256dh: 'k', auth: 'a' },
    });
    const wednesday = addDays(monday, 2);
    expect(await runReminders(at(wednesday, '18:44'))).toBe(0);
    expect(await runReminders(at(wednesday, '18:45'))).toBe(1);
    expect(sent[0]).toMatchObject({
      title: 'Course class',
      url: `/calendar?event=${course.id}`,
    });
    expect(sent[0]!.body).toMatch(/at 19:00–20:30 · Studying Japanese$/);
    // Once per class; not after it started; not on a Tuesday.
    expect(await runReminders(at(wednesday, '18:50'))).toBe(0);
    expect(await runReminders(at(addDays(monday, 1), '18:46'))).toBe(0);
    expect(await runReminders(at(addDays(monday, 7), '18:46'))).toBe(1);

    // A deleted event doesn't remind; undo brings it back.
    await as.del(`/api/events/${course.id}`);
    expect(await runReminders(at(addDays(monday, 9), '18:46'))).toBe(0);
    expect((await as.post(`/api/events/${course.id}/restore`)).status).toBe(200);
    expect(await runReminders(at(addDays(monday, 9), '18:47'))).toBe(1);
  });
});

describe('events', () => {
  it('validates the shape and drops what a month or TBD can’t have', async () => {
    const day = today();
    for (const bad of [
      { title: 'No day', precision: 'day' },
      { title: 'TBD with a day', precision: 'tbd', date: day },
      { title: 'Length without a time', date: day, durationMinutes: 30 },
      { title: 'No weekdays', date: day, repeat: { every: 'week', interval: 1, weekdays: [] } },
      { title: 'Month with time', precision: 'month', date: day, startTime: '10:00' },
      { title: 'Bad time', date: day, startTime: '25:00' },
    ]) {
      expect((await as.post('/api/events', bad)).status, bad.title).toBe(400);
    }
    const e = await newEvent({
      title: 'Class',
      date: day,
      startTime: '10:00',
      durationMinutes: 60,
      repeat: { every: 'day', interval: 1 },
      reminderMinutes: 5,
    });
    const month = await as.patch(`/api/events/${e.id}`, { precision: 'month' });
    expect(month.body).toMatchObject({
      precision: 'month',
      date: monthStart(day),
      startTime: null,
      durationMinutes: null,
      repeat: null,
      reminderMinutes: null,
    });
    const tbd = await as.patch(`/api/events/${e.id}`, { precision: 'tbd' });
    expect(tbd.body.date).toBeNull();
  });

  it('a past event can’t go in the spotlight and leaves it once over', async () => {
    const past = await newEvent({ title: 'Last week', date: addDays(today(), -7) });
    const res = await as.post('/api/spotlight', { id: past.id, on: true });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('spotlight_closed');
  });

  it('are searchable and mentionable, and go with their project into its snapshot', async () => {
    const projectId = await japanese();
    const e = await newEvent({ title: 'JLPT N5', date: addDays(today(), 30), projectId });
    const hits = (await as.get('/api/search?q=jlpt')).body.results;
    expect(JSON.stringify(hits)).toContain(e.id);
    const task = await as.post('/api/tasks', {
      title: 'Book a seat',
      description: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'mention', attrs: { id: e.id, label: 'JLPT N5' } }],
          },
        ],
      },
    });
    expect(task.status).toBe(201);
    const back = await as.get(`/api/entities/${e.id}/backlinks`);
    expect(JSON.stringify(back.body)).toContain('Book a seat');

    const del = await as.del(`/api/projects/${projectId}`);
    expect(del.status).toBe(200);
    expect((await as.get(`/api/events/${e.id}`)).status).toBe(404);
    const snapshots = (await as.get('/api/snapshots')).body.snapshots;
    expect((await as.post(`/api/snapshots/${snapshots[0].id}/restore`)).status).toBe(200);
    expect((await as.get(`/api/events/${e.id}`)).body.title).toBe('JLPT N5');
  });

  it('another account’s events answer 404', async () => {
    const e = await newEvent({ title: 'Mine', date: today() });
    await resetDb();
    as = client(await setUpOwner());
    expect((await as.get(`/api/events/${e.id}`)).status).toBe(404);
    expect((await as.patch(`/api/events/${e.id}`, { title: 'Theirs' })).status).toBe(404);
  });
});

describe('the calendar', () => {
  it('done tasks on their days, focus minutes and commitments met per day', async () => {
    const day = today();
    const t = await as.post('/api/tasks', { title: 'Hiragana row', scheduledDate: day });
    await as.post(`/api/tasks/${t.body.id}/complete`);
    const c = await as.post('/api/commitments', { title: 'Duolingo lesson' });
    await as.post(`/api/commitments/${c.body.id}/entries`, {});

    const cal = await as.get(`/api/calendar?from=${addDays(day, -3)}&to=${addDays(day, 3)}`);
    expect(cal.body.doneTasks.map((x: { title: string }) => x.title)).toEqual(['Hiragana row']);
    expect(cal.body.days[day]).toMatchObject({ commitmentsMet: [c.body.id] });
  });

  it('limits the range', async () => {
    expect((await as.get('/api/calendar?from=2026-01-01&to=2026-12-31')).status).toBe(400);
    expect((await as.get('/api/calendar?from=2026-02-01&to=2026-01-01')).status).toBe(400);
  });
});

describe('goals', () => {
  it('a deadline can be a month', async () => {
    const projectId = await japanese();
    const g = await as.post('/api/goals', {
      projectId,
      title: 'Pass JLPT N5',
      kind: 'outcome',
      dueDate: '2027-07-19',
      duePrecision: 'month',
    });
    expect(g.status).toBe(201);
    expect(g.body).toMatchObject({ dueDate: '2027-07-01', duePrecision: 'month' });
    const day = await as.patch(`/api/goals/${g.body.id}`, {
      dueDate: '2027-07-04',
      duePrecision: 'day',
    });
    expect(day.body).toMatchObject({ dueDate: '2027-07-04', duePrecision: 'day' });
  });
});
