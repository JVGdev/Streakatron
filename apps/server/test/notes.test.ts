// Phase 4g: the Notes board (D42, D46), played through the slice's "done when": an idea written at
// minute 12 of a session is a post-it on the board after it, with a link to what it mentions;
// dragging it to Tasks makes a task; nothing written mid-focus is lost. Plus sorting (add to a
// task, dismiss, undo) and the "Sort 3 post-its" quest.

import { newId } from '@streakatron/shared/ids';
import { NOTE_GRID, NOTES_CROWDED } from '@streakatron/shared/notes';
import { QUESTS } from '@streakatron/shared/quests';
import type { RichDoc } from '@streakatron/shared/rich';
import { userDay } from '@streakatron/shared/time';
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

const MIN = 60_000;
const today = () => userDay(new Date(), { timeZone: owner.timezone, dayStartHour: 4 });

const para = (...content: object[]) => ({ type: 'paragraph', content });
const text = (t: string) => ({ type: 'text', text: t });
const mention = (id: string, label: string) => ({ type: 'mention', attrs: { id, label } });
const doc = (...content: object[]) => ({ type: 'doc', content }) as RichDoc;

async function newNote(body: Record<string, unknown>) {
  const res = await as.post('/api/notes', body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body;
}

const board = async () => (await as.get('/api/notes')).body.notes as { id: string }[];

const sorted = async () =>
  (
    await db
      .select()
      .from(activity)
      .where(and(eq(activity.userId, userId), eq(activity.type, 'note_sorted')))
  ).length;

describe('the done-when', () => {
  it('an idea at minute 12 is a post-it after the session, links what it mentions, and becomes a task', async () => {
    const essay = (await as.post('/api/tasks', { title: 'Write the essay' })).body;
    const started = await as.post('/api/focus/start', { focusMinutes: 25, breakMinutes: 5 });
    const sessionId = started.body.session.id as string;
    await db
      .update(focusSessions)
      .set({ startedAt: new Date(Date.now() - (11 * MIN + 30_000)) })
      .where(eq(focusSessions.id, sessionId));

    const note = await newNote({
      description: doc(
        para(text('Use the quote from chapter 3')),
        para(text('for '), mention(essay.id, 'Write the essay')),
      ),
    });
    expect(note).toMatchObject({
      title: 'Use the quote from chapter 3',
      focusSessionId: sessionId,
      focusMinute: 12,
      color: 'yellow',
      x: 0,
      y: 0,
    });

    // The session finishes; the note is still on the board, and it links the essay.
    expect((await as.post('/api/focus/finish')).status).toBe(200);
    expect((await board()).map((n) => n.id)).toEqual([note.id]);
    const links = (await as.get(`/api/entities/${essay.id}/backlinks`)).body.backlinks;
    expect(links).toEqual([expect.objectContaining({ kind: 'note', id: note.id })]);

    // Dropped on Tasks: a task in the Inbox, first line as the title, the rest as notes.
    const made = await as.post('/api/convert', { id: note.id, to: 'task' });
    expect(made.status, JSON.stringify(made.body)).toBe(200);
    const task = (await as.get(`/api/tasks/${made.body.to.id}`)).body;
    expect(task).toMatchObject({ title: 'Use the quote from chapter 3', projectId: null });
    expect(task.description.content).toHaveLength(1);
    expect(await board()).toEqual([]);
    expect(await sorted()).toBe(1);

    // Undo puts it back on the board.
    const undo = await as.post('/api/convert/undo', { from: note.id, to: made.body.to.id });
    expect(undo.status, JSON.stringify(undo.body)).toBe(200);
    expect((await board()).map((n) => n.id)).toEqual([note.id]);
  });

  it('a note written in the break after a session keeps the session', async () => {
    const started = await as.post('/api/focus/start', { focusMinutes: 25, breakMinutes: 5 });
    await db
      .update(focusSessions)
      .set({ startedAt: new Date(Date.now() - 20 * MIN) })
      .where(eq(focusSessions.id, started.body.session.id));
    await as.post('/api/focus/finish');
    const note = await newNote({ description: doc(para(text('Break idea'))) });
    expect(note).toMatchObject({ focusSessionId: started.body.session.id, focusMinute: null });

    // Long after the break, a note is just a note.
    await db
      .update(focusSessions)
      .set({ endedAt: new Date(Date.now() - 60 * MIN), startedAt: new Date(Date.now() - 80 * MIN) })
      .where(eq(focusSessions.id, started.body.session.id));
    expect(await newNote({})).toMatchObject({ focusSessionId: null, focusMinute: null });
  });
});

describe('the board', () => {
  it('lays new notes on free spots, moves them on top, and keeps edits', async () => {
    const a = await newNote({ description: doc(para(text('A'))) });
    const b = await newNote({ description: doc(para(text('B'))), color: 'pink' });
    expect(b).toMatchObject({ x: NOTE_GRID, y: 0, color: 'pink' });
    expect(b.z).toBeGreaterThan(a.z);

    const moved = await as.patch(`/api/notes/${a.id}`, { x: 900.4, y: -120 });
    expect(moved.body).toMatchObject({ x: 900, y: -120 });
    expect(moved.body.z).toBeGreaterThan(b.z);
    // The spot it left is free again.
    expect(await newNote({})).toMatchObject({ x: 0, y: 0 });

    const placed = await newNote({ x: -500, y: 300 });
    expect(placed).toMatchObject({ x: -500, y: 300 });

    const edited = await as.patch(`/api/notes/${b.id}`, {
      description: doc(para(text('Renamed')), para(text('more'))),
      color: 'green',
    });
    expect(edited.body).toMatchObject({ title: 'Renamed', color: 'green' });
    expect((await as.patch(`/api/notes/${b.id}`, { x: 3 })).status).toBe(400);
  });

  it('is searchable and its notes resolve as chips', async () => {
    const n = await newNote({ description: doc(para(text('Kanji flashcards idea'))) });
    const hits = (await as.get('/api/search?q=flashcards')).body.results;
    expect(hits).toEqual([expect.objectContaining({ kind: 'note', id: n.id })]);
    const chips = (await as.get(`/api/entities/resolve?ids=${n.id}`)).body.entities;
    expect(chips[0]).toMatchObject({ title: 'Kanji flashcards idea', context: 'Notes' });
  });

  it('keeps other accounts out', async () => {
    const n = await newNote({});
    const other = newId('note');
    expect((await as.get(`/api/notes/${other}`)).status).toBe(404);
    expect((await as.patch(`/api/notes/${other}`, { color: 'blue' })).status).toBe(404);
    expect((await as.get(`/api/notes/${n.id}`)).status).toBe(200);
  });
});

describe('sorting', () => {
  it('adds a note to a task, and undo takes it out again', async () => {
    const task = (
      await as.post('/api/tasks', {
        title: 'Essay',
        description: doc(para(text('Outline'))),
      })
    ).body;
    const note = await newNote({ description: doc(para(text('Quote from chapter 3'))) });

    const added = await as.post(`/api/notes/${note.id}/append`, { taskId: task.id });
    expect(added.status, JSON.stringify(added.body)).toBe(200);
    const after = (await as.get(`/api/tasks/${task.id}`)).body;
    expect(after.descriptionText).toBe('Outline\nQuote from chapter 3');
    expect(await board()).toEqual([]);
    expect(await sorted()).toBe(1);

    const undo = await as.post(`/api/notes/${note.id}/unappend`, { taskId: task.id });
    expect(undo.body.removed).toBe(true);
    expect((await as.get(`/api/tasks/${task.id}`)).body.descriptionText).toBe('Outline');
    expect((await board()).map((n) => n.id)).toEqual([note.id]);
  });

  it('an undo leaves a task edited since as it is', async () => {
    const task = (await as.post('/api/tasks', { title: 'Essay' })).body;
    const note = await newNote({ description: doc(para(text('Idea'))) });
    await as.post(`/api/notes/${note.id}/append`, { taskId: task.id });
    await as.patch(`/api/tasks/${task.id}`, {
      description: doc(para(text('Idea')), para(text('Edited after'))),
    });
    const undo = await as.post(`/api/notes/${note.id}/unappend`, { taskId: task.id });
    expect(undo.body.removed).toBe(false);
    expect((await as.get(`/api/tasks/${task.id}`)).body.descriptionText).toBe('Idea\nEdited after');
  });

  it('won’t add an empty note, and dismissing one isn’t sorting', async () => {
    const task = (await as.post('/api/tasks', { title: 'Essay' })).body;
    const note = await newNote({});
    expect((await as.post(`/api/notes/${note.id}/append`, { taskId: task.id })).status).toBe(400);
    expect((await as.del(`/api/notes/${note.id}`)).status).toBe(200);
    expect(await sorted()).toBe(0);
  });

  it('dismisses with undo, and turns a note into a goal in its project', async () => {
    const note = await newNote({ description: doc(para(text('Never mind'))) });
    expect((await as.del(`/api/notes/${note.id}`)).status).toBe(200);
    expect(await board()).toEqual([]);
    expect((await as.post(`/api/notes/${note.id}/restore`)).status).toBe(200);
    expect(await board()).toHaveLength(1);

    const projectId = (await as.post('/api/projects', { title: 'Japanese' })).body.id;
    const idea = await newNote({ description: doc(para(text('Pass N4'))), projectId });
    const goal = await as.post('/api/convert', { id: idea.id, to: 'goal' });
    expect(goal.status, JSON.stringify(goal.body)).toBe(200);
    expect((await as.get(`/api/goals/${goal.body.to.id}`)).body).toMatchObject({
      title: 'Pass N4',
      projectId,
    });
  });
});

describe('the notes quest (D46)', () => {
  it('"Sort 3 post-its" completes after three sorts', async () => {
    const id = newId('quest');
    await db.insert(questInstances).values({
      id,
      userId,
      type: 'quick',
      template: 'sort_notes',
      periodStart: today(),
      periodEnd: today(),
      target: QUESTS.quick.sortNotes,
      xp: QUESTS.quick.xp,
      tier: 'small',
      offeredAt: new Date(Date.now() - 1000),
    });
    const notes = [];
    for (let i = 0; i < NOTES_CROWDED; i++) {
      notes.push(await newNote({ description: doc(para(text(`Idea ${i}`))) }));
    }
    const task = (await as.post('/api/tasks', { title: 'Essay' })).body;
    await as.del(`/api/notes/${notes[0].id}`);
    await as.post(`/api/notes/${notes[1].id}/append`, { taskId: task.id });
    const last = await as.post('/api/convert', { id: notes[2].id, to: 'task' });
    expect(last.body.game.events).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'quest_done' })]),
    );
    const [q] = await db.select().from(questInstances).where(eq(questInstances.id, id));
    expect(q!.status).toBe('completed');
  });
});
