// Notes (D42, D46): post-its on a freeform board. Ideas written down at once (from any page, or
// mid-focus with the session and minute), then sorted: into a task or another entry, onto a task's
// description, or dismissed. Pure: the shape of the board and what a note becomes.

import { textFromDoc, type RichDoc, type RichNode } from '../rich';

export const NOTE_COLORS = ['yellow', 'pink', 'blue', 'green', 'orange', 'lilac'] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

export const NOTE_LIMITS = {
  /** A note's title (its first line) is cut to this many characters. */
  titleLength: 120,
  /** How far from the origin a post-it can be put (board units). */
  coordinate: 1_000_000,
} as const;

/** A post-it's side on the board, and the grid new ones are laid on (board units). */
export const NOTE_SIZE = 192;
export const NOTE_GRID = 224;
/** New notes fill rows this many wide, from the board's origin. */
export const NOTE_GRID_COLUMNS = 5;

/** The board holds too many post-its from this many: the "Sort 3 post-its" quest shows (D46). */
export const NOTES_CROWDED = 12;

/** A note's title: its first line with text, cut to `titleLength` ('' when it has no text). */
export function noteTitle(doc: RichDoc | null | undefined): string {
  const line =
    textFromDoc(doc)
      .split('\n')
      .find((l) => l.trim()) ?? '';
  const t = line.trim().replace(/\s+/g, ' ');
  return t.length > NOTE_LIMITS.titleLength
    ? `${t.slice(0, NOTE_LIMITS.titleLength - 1).trimEnd()}…`
    : t;
}

const hasMention = (n: RichNode): boolean =>
  n.type === 'mention' || (n.content ?? []).some(hasMention);

/**
 * A note as an entry's title and description: the first line is the title and the rest the
 * description. When the first line was cut or links something, the description keeps the whole
 * note, so nothing is lost.
 */
export function splitNote(doc: RichDoc | null | undefined): {
  title: string;
  description: RichDoc | null;
} {
  const title = noteTitle(doc) || 'Note';
  const blocks = doc?.content ?? [];
  const first = blocks.findIndex((b) => textFromDoc(b).trim());
  if (first < 0) return { title, description: null };
  const head = blocks[first]!;
  const whole =
    head.type !== 'paragraph' || hasMention(head) || textFromDoc(head).trim() !== title.trim();
  const rest = whole ? blocks : blocks.slice(first + 1);
  return {
    title,
    description: rest.some((b) => textFromDoc(b).trim()) ? { type: 'doc', content: rest } : null,
  };
}

export interface Spot {
  x: number;
  y: number;
}

/** Where a new note goes: the first grid cell, row by row from the origin, no post-it covers. */
export function freeSpot(taken: readonly Spot[]): Spot {
  const covers = (cell: Spot) =>
    taken.some((t) => Math.abs(t.x - cell.x) < NOTE_SIZE && Math.abs(t.y - cell.y) < NOTE_SIZE);
  for (let i = 0; ; i++) {
    const cell = {
      x: (i % NOTE_GRID_COLUMNS) * NOTE_GRID,
      y: Math.floor(i / NOTE_GRID_COLUMNS) * NOTE_GRID,
    };
    if (!covers(cell)) return cell;
  }
}

/** A post-it's slight tilt, in degrees (-2.5 to 2.5), the same every time for the same note. */
export function noteTilt(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 51) - 25) / 10;
}

/** The minute of a session a note was written in: the 12th minute is 11:00 to 11:59 in. */
export const noteMinute = (focusedMs: number) => Math.floor(Math.max(0, focusedMs) / 60_000) + 1;

/** A task's description with a note added at its end. */
export function appendNote(description: RichDoc | null, note: RichDoc): RichDoc {
  return { type: 'doc', content: [...(description?.content ?? []), ...(note.content ?? [])] };
}

/**
 * A task's description with a note that was added at its end taken out again; undefined when the
 * end isn't that note anymore (edited since), so an undo leaves the task as it is.
 */
export function removeAppended(
  description: RichDoc | null,
  note: RichDoc,
): RichDoc | null | undefined {
  const blocks = description?.content ?? [];
  const tail = note.content ?? [];
  if (!tail.length || blocks.length < tail.length) return undefined;
  const start = blocks.length - tail.length;
  const same = tail.every((b, i) => JSON.stringify(b) === JSON.stringify(blocks[start + i]));
  if (!same) return undefined;
  const left = blocks.slice(0, start);
  return left.length ? { type: 'doc', content: left } : null;
}
