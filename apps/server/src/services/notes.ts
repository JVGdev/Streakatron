// Notes (D42, D46): post-its on a freeform board. Written from any page; one written while a
// focus session runs keeps the session and its minute, one written in the break after keeps the
// session. Sorting one (into an entry, onto a task, or dismissed) soft-deletes it and logs
// `note_sorted` (no XP; the "Sort 3 post-its" quest counts it). Turning one into an entry is
// `convertEntry` (services/convert.ts).

import { focusedMs } from '@streakatron/shared/focus';
import { newId } from '@streakatron/shared/ids';
import {
  appendNote,
  freeSpot,
  noteMinute,
  noteTitle,
  removeAppended,
} from '@streakatron/shared/notes';
import { textFromDoc, type RichDoc } from '@streakatron/shared/rich';
import type { NoteCreate, NotePatch } from '@streakatron/shared/schemas';
import { and, asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { focusSessions, notes, tasks } from '../db/schema';
import { defined, invalid, notFound, type Conn, type Tx } from './common';
import { logActivity } from './game';
import { writeLinks } from './links';
import { ownedProject } from './projects';

type NoteRow = typeof notes.$inferSelect;

export const noteView = ({ userId: _, deletedAt: __, ...n }: NoteRow) => n;
export type NoteView = ReturnType<typeof noteView>;

/** A note written this long after a session's break should have ended still belongs to it. */
const BREAK_GRACE_MS = 2 * 60_000;

async function ownedNote(conn: Conn, userId: string, id: string, { deleted = false } = {}) {
  const [row] = await conn
    .select()
    .from(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))
    .for('update');
  if (!row || (row.deletedAt !== null) !== deleted) throw notFound('note');
  return row;
}

const textColumns = (doc: RichDoc | null | undefined) =>
  doc === undefined
    ? {}
    : { description: doc, descriptionText: doc ? textFromDoc(doc) : '', title: noteTitle(doc) };

/** The top of the stack: a note put or moved goes above the rest. */
async function nextZ(tx: Tx, userId: string) {
  const [row] = await tx
    .select({ z: sql<number>`coalesce(max(${notes.z}), 0)::int` })
    .from(notes)
    .where(and(eq(notes.userId, userId), isNull(notes.deletedAt)));
  return (row?.z ?? 0) + 1;
}

/** The session a note written now belongs to: the open one, or the last one while in its break. */
async function sessionNow(tx: Tx, userId: string, now: Date) {
  const [last] = await tx
    .select()
    .from(focusSessions)
    .where(eq(focusSessions.userId, userId))
    .orderBy(desc(focusSessions.startedAt))
    .limit(1);
  if (!last) return null;
  if (last.status === 'running' || last.status === 'paused') {
    return { id: last.id, minute: noteMinute(focusedMs(last, now)) };
  }
  if (last.status === 'completed' && last.endedAt) {
    const breakEnds = last.endedAt.getTime() + last.breakMinutes * 60_000 + BREAK_GRACE_MS;
    if (now.getTime() <= breakEnds) return { id: last.id, minute: null };
  }
  return null;
}

/** Every note on the board, bottom of the stack first. */
export async function listNotes(userId: string) {
  const rows = await db
    .select()
    .from(notes)
    .where(and(eq(notes.userId, userId), isNull(notes.deletedAt)))
    .orderBy(asc(notes.z), asc(notes.createdAt));
  return rows.map(noteView);
}

export async function getNote(userId: string, id: string) {
  return noteView(await ownedNote(db, userId, id));
}

export async function createNote(userId: string, input: NoteCreate) {
  return db.transaction(async (tx) => {
    if (input.projectId) await ownedProject(tx, userId, input.projectId);
    // One writer per user, so two notes written at once don't take the same free spot.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'notes:' + userId}))`);
    let spot: { x: number; y: number };
    if (input.x !== undefined && input.y !== undefined) {
      spot = { x: Math.round(input.x), y: Math.round(input.y) };
    } else {
      const taken = await tx
        .select({ x: notes.x, y: notes.y })
        .from(notes)
        .where(and(eq(notes.userId, userId), isNull(notes.deletedAt)));
      spot = freeSpot(taken);
    }
    const session = await sessionNow(tx, userId, new Date());
    const id = newId('note');
    const description = input.description ?? null;
    const [row] = await tx
      .insert(notes)
      .values({
        id,
        userId,
        ...textColumns(description),
        color: input.color ?? 'yellow',
        projectId: input.projectId ?? null,
        focusSessionId: session?.id ?? null,
        focusMinute: session?.minute ?? null,
        ...spot,
        z: await nextZ(tx, userId),
      })
      .returning();
    await writeLinks(tx, userId, id, description);
    return noteView(row!);
  });
}

export async function updateNote(userId: string, id: string, patch: NotePatch) {
  return db.transaction(async (tx) => {
    await ownedNote(tx, userId, id);
    if (patch.projectId) await ownedProject(tx, userId, patch.projectId);
    const { description, x, y, ...rest } = patch;
    const moved =
      x !== undefined && y !== undefined
        ? { x: Math.round(x), y: Math.round(y), z: await nextZ(tx, userId) }
        : {};
    const [row] = await tx
      .update(notes)
      .set({ ...defined(rest), ...moved, ...textColumns(description) })
      .where(eq(notes.id, id))
      .returning();
    await writeLinks(tx, userId, id, description);
    return noteView(row!);
  });
}

/**
 * Mark a note sorted: off the board (undoable), and one more for the notes quest. A note with
 * nothing written (a quick note left empty) just goes: that isn't sorting.
 */
export async function sortNote(tx: Tx, userId: string, id: string, written = true) {
  const deletedAt = new Date();
  await tx.update(notes).set({ deletedAt }).where(eq(notes.id, id));
  if (written) await logActivity(tx, userId, [{ type: 'note_sorted', entityId: id }]);
  return deletedAt;
}

/** Dismiss: off the board, back with Undo (purged after 30 days). Counts as sorting it. */
export async function dismissNote(userId: string, id: string) {
  return db.transaction(async (tx) => {
    const note = await ownedNote(tx, userId, id);
    const written = note.descriptionText.trim() !== '';
    return { id, deletedAt: await sortNote(tx, userId, id, written) };
  });
}

/** Undo: back on the board where it was. */
export async function restoreNote(userId: string, id: string) {
  return db.transaction(async (tx) => {
    await ownedNote(tx, userId, id, { deleted: true });
    const [row] = await tx
      .update(notes)
      .set({ deletedAt: null })
      .where(and(eq(notes.id, id), isNotNull(notes.deletedAt)))
      .returning();
    return noteView(row!);
  });
}

async function liveTask(tx: Tx, userId: string, taskId: string) {
  const [task] = await tx
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId), isNull(tasks.deletedAt)))
    .for('update');
  if (!task) throw notFound('task');
  return task;
}

/** Add a note to the end of a task's description; the note leaves the board. */
export async function appendNoteToTask(userId: string, id: string, taskId: string) {
  return db.transaction(async (tx) => {
    const note = await ownedNote(tx, userId, id);
    if (!note.description || !note.descriptionText.trim()) {
      throw invalid('empty_note', 'There’s nothing written on that note.');
    }
    const task = await liveTask(tx, userId, taskId);
    const description = appendNote(task.description, note.description);
    await tx
      .update(tasks)
      .set({ description, descriptionText: textFromDoc(description) })
      .where(eq(tasks.id, taskId));
    await writeLinks(tx, userId, taskId, description);
    await sortNote(tx, userId, id);
    return { id, taskId, taskTitle: task.title };
  });
}

/**
 * Undo adding a note to a task: the note comes back, and leaves the task's description again while
 * it's still at the end (`removed: false` when the task was edited since and keeps it).
 */
export async function undoAppendNote(userId: string, id: string, taskId: string) {
  return db.transaction(async (tx) => {
    const note = await ownedNote(tx, userId, id, { deleted: true });
    const task = await liveTask(tx, userId, taskId);
    const left = note.description ? removeAppended(task.description, note.description) : undefined;
    if (left !== undefined) {
      await tx
        .update(tasks)
        .set({ description: left, descriptionText: left ? textFromDoc(left) : '' })
        .where(eq(tasks.id, taskId));
      await writeLinks(tx, userId, taskId, left);
    }
    const [row] = await tx
      .update(notes)
      .set({ deletedAt: null })
      .where(eq(notes.id, id))
      .returning();
    return { note: noteView(row!), removed: left !== undefined };
  });
}

/** How many post-its are on the board (the notes quest shows when it's crowded). */
export async function notesOnBoard(conn: Conn, userId: string) {
  const [row] = await conn
    .select({ n: sql<number>`count(*)::int` })
    .from(notes)
    .where(and(eq(notes.userId, userId), isNull(notes.deletedAt)));
  return row?.n ?? 0;
}
