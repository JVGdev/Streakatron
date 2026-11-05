import { describe, expect, it } from 'vitest';
import type { RichDoc } from '../rich';
import {
  appendNote,
  freeSpot,
  NOTE_GRID,
  NOTE_GRID_COLUMNS,
  NOTE_LIMITS,
  noteMinute,
  noteTilt,
  noteTitle,
  removeAppended,
  splitNote,
} from './index';

const p = (...content: RichDoc['content'] & object) => ({ type: 'paragraph', content });
const t = (text: string) => ({ type: 'text', text });
const doc = (...content: object[]): RichDoc => ({ type: 'doc', content: content as never });
const mention = {
  type: 'mention',
  attrs: { id: 'tsk_01JC3Z0000000000000000000A', label: 'Essay' },
};

describe('noteTitle', () => {
  it('is the first line with text', () => {
    expect(noteTitle(doc(p(), p(t('  Idea:  try  flashcards ')), p(t('more'))))).toBe(
      'Idea: try flashcards',
    );
    expect(noteTitle(null)).toBe('');
  });

  it('is cut when long', () => {
    const title = noteTitle(doc(p(t('a'.repeat(300)))));
    expect(title).toHaveLength(NOTE_LIMITS.titleLength);
    expect(title.endsWith('…')).toBe(true);
  });
});

describe('splitNote', () => {
  it('makes the first line the title and the rest the description', () => {
    expect(splitNote(doc(p(t('Buy cards')), p(t('the blue ones'))))).toEqual({
      title: 'Buy cards',
      description: doc(p(t('the blue ones'))),
    });
    expect(splitNote(doc(p(t('Just this'))))).toEqual({ title: 'Just this', description: null });
  });

  it('keeps the whole note when the first line links something or was cut', () => {
    const linked = doc(p(t('See '), mention), p(t('why')));
    expect(splitNote(linked).description).toEqual(linked);
    const long = doc(p(t('b'.repeat(300))));
    expect(splitNote(long).description).toEqual(long);
  });

  it('is a "Note" with nothing written', () => {
    expect(splitNote(null)).toEqual({ title: 'Note', description: null });
  });
});

describe('freeSpot', () => {
  it('fills the grid row by row from the origin', () => {
    expect(freeSpot([])).toEqual({ x: 0, y: 0 });
    expect(freeSpot([{ x: 0, y: 0 }])).toEqual({ x: NOTE_GRID, y: 0 });
    const row = Array.from({ length: NOTE_GRID_COLUMNS }, (_, i) => ({ x: i * NOTE_GRID, y: 0 }));
    expect(freeSpot(row)).toEqual({ x: 0, y: NOTE_GRID });
  });

  it('skips a cell a post-it moved near covers, and reuses a freed one', () => {
    expect(freeSpot([{ x: 10, y: -30 }])).toEqual({ x: NOTE_GRID, y: 0 });
    expect(freeSpot([{ x: NOTE_GRID, y: 0 }])).toEqual({ x: 0, y: 0 });
  });
});

describe('noteTilt and noteMinute', () => {
  it('tilts the same note the same way, slightly', () => {
    const a = noteTilt('not_01JC3Z0000000000000000000A');
    expect(noteTilt('not_01JC3Z0000000000000000000A')).toBe(a);
    for (const id of ['not_1', 'not_2', 'not_abc', 'not_zzz']) {
      expect(Math.abs(noteTilt(id))).toBeLessThanOrEqual(2.5);
    }
  });

  it('counts minutes from 1', () => {
    expect(noteMinute(0)).toBe(1);
    expect(noteMinute(11 * 60_000 + 30_000)).toBe(12);
  });
});

describe('appendNote / removeAppended', () => {
  const note = doc(p(t('idea')), p(t('two')));

  it('adds a note at the end and takes it out again', () => {
    const task = doc(p(t('task notes')));
    const added = appendNote(task, note);
    expect(added.content).toHaveLength(3);
    expect(removeAppended(added, note)).toEqual(task);
    expect(removeAppended(appendNote(null, note), note)).toBeNull();
  });

  it('leaves the task alone once its end changed', () => {
    const added = appendNote(doc(p(t('x'))), note);
    const edited = { ...added, content: [...added.content!, p(t('later'))] };
    expect(removeAppended(edited, note)).toBeUndefined();
  });
});
