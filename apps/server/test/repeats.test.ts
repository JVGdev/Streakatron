// Phase 4e: recurring tasks (D43) and turning entries into each other (D44), played through the
// slice's "done when": "Problem set every Friday" and "pay the installment on the 5th" come back
// after each completion; "review topic 3 in 2 days" reappears two days after it's done; a Friday
// missed still shows the next Friday's with "Skip it"; a daily task turned into a commitment (and
// back) keeps its title, project and days.

import { addDays, userDay, weekdayOf } from '@streakatron/shared/time';
import { beforeEach, describe, expect, it } from 'vitest';
import { runRepeats } from '../src/services/repeats';
import { client, owner, resetDb, setUpOwner, type Client } from './helpers';

let as: Client;

beforeEach(async () => {
  await resetDb();
  as = client(await setUpOwner());
});

const SP = { timeZone: owner.timezone, dayStartHour: 4 };
const today = () => userDay(new Date(), SP);
/** Noon in São Paulo on `day` (a safe "now" for the job). */
const noonOn = (day: string) => new Date(`${day}T12:00:00-03:00`);

async function project(title = 'Linear Algebra') {
  const res = await as.post('/api/projects', { title });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function newTask(body: Record<string, unknown>) {
  const res = await as.post('/api/tasks', body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body;
}

interface Occurrence {
  id: string;
  seriesId: string;
  seriesDate: string;
  dueDate: string | null;
  scheduledDate: string | null;
  remindAt: string;
  completedAt: string | null;
  spotlightedAt: string | null;
  columnId: string | null;
  earlierOpen: unknown;
}

/** A series' occurrences (top-level, deleted ones left out), oldest first. */
async function series(seriesId: string) {
  const res = await as.get('/api/tasks?status=any');
  const tasks: Occurrence[] = res.body.tasks;
  return tasks
    .filter((t) => t.seriesId === seriesId)
    .sort((a, b) => a.seriesDate.localeCompare(b.seriesDate));
}

describe('recurring tasks', () => {
  it('"Problem set every Friday" comes back after each completion', async () => {
    const projectId = await project();
    const friday = addDays(today(), (5 - weekdayOf(today()) + 7) % 7);
    const set = await newTask({
      title: 'Problem set',
      projectId,
      dueDate: friday,
      repeat: { kind: 'schedule', every: 'week', interval: 1, weekdays: [5] },
    });
    expect(set.seriesDate).toBe(friday);
    expect(set.series.repeat).toMatchObject({ kind: 'schedule', weekdays: [5] });

    expect((await as.post(`/api/tasks/${set.id}/complete`)).status).toBe(200);
    let all = await series(set.seriesId);
    expect(all.map((t) => t.dueDate)).toEqual([friday, addDays(friday, 7)]);
    expect(all[1]!.completedAt).toBeNull();
    expect(all[1]!.columnId).not.toBeNull();

    // The next one done too: the week after.
    await as.post(`/api/tasks/${all[1]!.id}/complete`);
    all = await series(set.seriesId);
    expect(all.map((t) => t.dueDate)).toEqual([friday, addDays(friday, 7), addDays(friday, 14)]);

    // Completing an older one again doesn't make another.
    await as.post(`/api/tasks/${set.id}/reopen`);
    await as.post(`/api/tasks/${set.id}/complete`);
    expect(await series(set.seriesId)).toHaveLength(3);

    // On the calendar ahead, after the newest.
    const cal = await as.get(`/api/calendar?from=${addDays(friday, 15)}&to=${addDays(friday, 30)}`);
    expect(cal.body.ahead).toEqual([
      expect.objectContaining({
        title: 'Problem set',
        days: [addDays(friday, 21), addDays(friday, 28)],
      }),
    ]);
  });

  it('"pay the installment on the 5th" moves its reminder and scheduled date along', async () => {
    const fifth = `${today().slice(0, 7)}-05`;
    const pay = await newTask({
      title: 'Pay the installment',
      dueDate: fifth,
      scheduledDate: addDays(fifth, -2),
      remindAt: new Date(`${addDays(fifth, -1)}T09:00:00-03:00`).toISOString(),
      repeat: { kind: 'schedule', every: 'month', interval: 1 },
    });
    expect(pay.series.repeat).toMatchObject({ every: 'month' });
    await as.post(`/api/tasks/${pay.id}/complete`);
    const [, next] = await series(pay.seriesId);
    const nextFifth = (() => {
      const [y, m] = fifth.split('-').map(Number) as [number, number];
      return m === 12 ? `${y + 1}-01-05` : `${y}-${String(m + 1).padStart(2, '0')}-05`;
    })();
    expect(next!.dueDate).toBe(nextFifth);
    expect(next!.scheduledDate).toBe(addDays(nextFifth, -2));
    expect(new Date(next!.remindAt).toISOString()).toBe(
      new Date(`${addDays(nextFifth, -1)}T09:00:00-03:00`).toISOString(),
    );
  });

  it('"review topic 3 in 2 days" reappears two days after it’s done', async () => {
    const review = await newTask({
      title: 'Review topic 3',
      repeat: { kind: 'after_done', every: 'day', interval: 2 },
    });
    // No date given: it's due today.
    expect(review.dueDate).toBe(today());
    // Nothing comes while it's open, whatever the day.
    expect(await runRepeats(noonOn(addDays(today(), 10)))).toBe(0);
    await as.post(`/api/tasks/${review.id}/complete`);
    const [, next] = await series(review.seriesId);
    expect(next!.dueDate).toBe(addDays(today(), 2));
  });

  it('a missed Friday: the next one still comes, saying the old one is open', async () => {
    const lastWeek = addDays(today(), -7);
    const set = await newTask({
      title: 'Problem set',
      dueDate: lastWeek,
      repeat: { kind: 'schedule', every: 'week', interval: 1, weekdays: [weekdayOf(lastWeek)] },
    });
    expect(await runRepeats(noonOn(today()))).toBe(1);
    expect(await runRepeats(noonOn(today()))).toBe(0);
    const [old, current] = await series(set.seriesId);
    expect(old!.completedAt).toBeNull();
    expect(current!.dueDate).toBe(today());
    expect(current!.earlierOpen).toEqual([{ id: set.id, day: lastWeek }]);

    // "Skip it" deletes the old one.
    expect((await as.del(`/api/tasks/${old!.id}`)).status).toBe(200);
    const after = (await as.get(`/api/tasks/${current!.id}`)).body;
    expect(after.earlierOpen).toEqual([]);
  });

  it('weeks away: only the latest missed day is made', async () => {
    const start = addDays(today(), -28);
    const set = await newTask({
      title: 'Problem set',
      dueDate: start,
      repeat: { kind: 'schedule', every: 'week', interval: 1, weekdays: [weekdayOf(start)] },
    });
    expect(await runRepeats(noonOn(today()))).toBe(1);
    const all = await series(set.seriesId);
    expect(all.map((t) => t.seriesDate)).toEqual([start, today()]);
  });

  it('undoing a completion takes the next one back; editing keeps it', async () => {
    const projectId = await project();
    const set = await newTask({
      title: 'Problem set',
      projectId,
      repeat: { kind: 'schedule', every: 'day', interval: 1 },
    });
    await as.post('/api/tasks', { title: 'Part a', parentTaskId: set.id });
    await as.post('/api/spotlight', { id: set.id, on: true });

    await as.post(`/api/tasks/${set.id}/complete`);
    let all = await series(set.seriesId);
    expect(all).toHaveLength(2);
    // Subtasks come along, open; the spotlight moves on.
    const subs = await as.get(`/api/tasks?parent=${all[1]!.id}`);
    expect(subs.body.tasks.map((t: { title: string }) => t.title)).toEqual(['Part a']);
    expect(all[1]!.spotlightedAt).not.toBeNull();
    expect(all[0]!.spotlightedAt).toBeNull();

    await as.post(`/api/tasks/${set.id}/reopen`);
    all = await series(set.seriesId);
    expect(all).toHaveLength(1);
    expect(all[0]!.spotlightedAt).not.toBeNull();

    // Once the next one is edited, a reopen leaves it.
    await as.post(`/api/tasks/${set.id}/complete`);
    const [, next] = await series(set.seriesId);
    await as.patch(`/api/tasks/${next!.id}`, { title: 'Problem set (hard)' });
    await as.post(`/api/tasks/${set.id}/reopen`);
    expect(await series(set.seriesId)).toHaveLength(2);
  });

  it('"Doesn’t repeat" stops the series; subtasks can’t repeat', async () => {
    const set = await newTask({
      title: 'Problem set',
      repeat: { kind: 'schedule', every: 'day', interval: 1 },
    });
    const off = await as.patch(`/api/tasks/${set.id}`, { repeat: null });
    expect(off.body.series).toBeNull();
    await as.post(`/api/tasks/${set.id}/complete`);
    expect(await series(set.seriesId)).toHaveLength(1);
    expect(await runRepeats(noonOn(addDays(today(), 3)))).toBe(0);

    const sub = await as.post('/api/tasks', { title: 'Part', parentTaskId: set.id });
    const res = await as.patch(`/api/tasks/${sub.body.id}`, {
      repeat: { kind: 'after_done', every: 'day', interval: 1 },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_repeat');
  });

  it('changing the rule on an occurrence changes the series', async () => {
    const set = await newTask({
      title: 'Problem set',
      dueDate: today(),
      repeat: { kind: 'schedule', every: 'day', interval: 1 },
    });
    await as.patch(`/api/tasks/${set.id}`, {
      repeat: { kind: 'after_done', every: 'week', interval: 1 },
    });
    await as.post(`/api/tasks/${set.id}/complete`);
    const [, next] = await series(set.seriesId);
    expect(next!.dueDate).toBe(addDays(today(), 7));
  });
});

describe('turn into (D44)', () => {
  it('a daily task becomes a commitment and back, keeping title, project and days', async () => {
    const projectId = await project('Studying Japanese');
    const duo = await newTask({
      title: 'Duolingo',
      projectId,
      repeat: { kind: 'schedule', every: 'week', interval: 1, weekdays: [1, 3, 5] },
    });
    // Mentioned elsewhere.
    const note = await newTask({
      title: 'Plan',
      description: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'mention', attrs: { id: duo.id, label: 'Duolingo' } }],
          },
        ],
      },
    });

    const res = await as.post('/api/convert', { id: duo.id, to: 'commitment' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.kept).toContain('On Mon, Wed, Fri');
    const cmt = (await as.get(`/api/commitments/${res.body.to.id}`)).body;
    expect(cmt).toMatchObject({
      title: 'Duolingo',
      projectId,
      measure: 'check',
      period: 'day',
      schedule: { days: [1, 3, 5] },
    });
    expect((await as.get(`/api/tasks/${duo.id}`)).status).toBe(404);
    const mentioned = (await as.get(`/api/tasks/${note.id}`)).body;
    expect(JSON.stringify(mentioned.description)).toContain(res.body.to.id);
    const back = await as.get(`/api/entities/${res.body.to.id}/backlinks`);
    expect(back.status).toBe(200);
    expect(JSON.stringify(back.body)).toContain(note.id);
    // The series stopped with the task: nothing more is made.
    expect(await runRepeats(noonOn(addDays(today(), 14)))).toBe(0);

    // And back to a task.
    const again = await as.post('/api/convert', { id: res.body.to.id, to: 'task' });
    expect(again.status).toBe(200);
    const task = (await as.get(`/api/tasks/${again.body.to.id}`)).body;
    expect(task).toMatchObject({ title: 'Duolingo', projectId });
    expect(task.series.repeat).toMatchObject({
      kind: 'schedule',
      every: 'week',
      weekdays: [1, 3, 5],
    });
    expect([1, 3, 5]).toContain(weekdayOf(task.dueDate));
  });

  it('undo brings the old entry and its mentions back', async () => {
    const projectId = await project();
    const t = await newTask({
      title: 'Exam',
      projectId,
      dueDate: addDays(today(), 30),
      repeat: {
        kind: 'schedule',
        every: 'week',
        interval: 1,
        weekdays: [weekdayOf(addDays(today(), 30))],
      },
    });
    await as.post('/api/tasks', { title: 'Study ch. 1', parentTaskId: t.id });
    const note = await newTask({
      title: 'Plan',
      description: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'mention', attrs: { id: t.id, label: 'Exam' } }] },
        ],
      },
    });
    const res = await as.post('/api/convert', { id: t.id, to: 'event' });
    expect(res.status).toBe(200);
    expect(res.body.dropped).toContain('1 subtask');
    const ev = (await as.get(`/api/events/${res.body.to.id}`)).body;
    expect(ev).toMatchObject({ title: 'Exam', date: addDays(today(), 30), precision: 'day' });

    const undo = await as.post('/api/convert/undo', { from: t.id, to: res.body.to.id });
    expect(undo.status, JSON.stringify(undo.body)).toBe(200);
    expect((await as.get(`/api/events/${res.body.to.id}`)).status).toBe(404);
    const restored = (await as.get(`/api/tasks/${t.id}`)).body;
    expect(restored.series).not.toBeNull();
    expect(restored.subtasks).toEqual({ total: 1, done: 0 });
    const mentioned = (await as.get(`/api/tasks/${note.id}`)).body;
    expect(JSON.stringify(mentioned.description)).toContain(t.id);
    // Only once.
    expect((await as.post('/api/convert/undo', { from: t.id, to: res.body.to.id })).status).toBe(
      409,
    );
  });

  it('a goal needs a project; done and same-kind conversions are refused', async () => {
    const inbox = await newTask({ title: 'Learn kana', dueDate: addDays(today(), 10) });
    const no = await as.post('/api/convert', { id: inbox.id, to: 'goal' });
    expect(no.status).toBe(400);
    expect(no.body.error.code).toBe('needs_project');
    const projectId = await project();
    const ok = await as.post('/api/convert', { id: inbox.id, to: 'goal', projectId });
    expect(ok.status).toBe(200);
    const goal = (await as.get(`/api/goals/${ok.body.to.id}`)).body;
    expect(goal).toMatchObject({ projectId, kind: 'outcome', dueDate: addDays(today(), 10) });

    const done = await newTask({ title: 'Done one' });
    await as.post(`/api/tasks/${done.id}/complete`);
    expect((await as.post('/api/convert', { id: done.id, to: 'event' })).status).toBe(400);
    expect((await as.post('/api/convert', { id: ok.body.to.id, to: 'goal' })).status).toBe(400);
  });

  it('a minutes commitment becomes a time goal; spotlight carries to an event', async () => {
    const projectId = await project();
    const listening = await as.post('/api/commitments', {
      title: 'Listening',
      projectId,
      measure: 'minutes',
      target: 15,
    });
    const res = await as.post('/api/convert', { id: listening.body.id, to: 'goal' });
    const goal = (await as.get(`/api/goals/${res.body.to.id}`)).body;
    expect(goal).toMatchObject({ kind: 'time', targetMinutes: 105, period: 'week' });

    const g2 = await as.post('/api/goals', {
      projectId,
      title: 'JLPT',
      kind: 'outcome',
      dueDate: addDays(today(), 200),
    });
    await as.post('/api/spotlight', { id: g2.body.id, on: true });
    const asEvent = await as.post('/api/convert', { id: g2.body.id, to: 'event' });
    const ev = (await as.get(`/api/events/${asEvent.body.to.id}`)).body;
    expect(ev.spotlightedAt).not.toBeNull();
    const spot = (await as.get('/api/spotlight')).body;
    expect(JSON.stringify(spot)).toContain(asEvent.body.to.id);
  });
});
