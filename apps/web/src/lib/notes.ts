// Post-its (D46) on the web: colour names, where a note came from, and ink for buttons on paper.

import type { NoteColor } from '@streakatron/shared/notes';
import type { Note } from './queries';

export const NOTE_COLOR_LABEL: Record<NoteColor, string> = {
  yellow: 'Yellow',
  pink: 'Pink',
  blue: 'Blue',
  green: 'Green',
  orange: 'Orange',
  lilac: 'Lilac',
};

/** Where a note came from, in a few words ("Focus · min 12"). */
export function noteOrigin(note: Pick<Note, 'focusSessionId' | 'focusMinute'>) {
  if (!note.focusSessionId) return null;
  return note.focusMinute ? `Focus · min ${note.focusMinute}` : 'Focus · break';
}

/** Ink on paper, for buttons on a post-it. */
export const INK_BUTTON = 'bg-[#2c2a24] text-[#fff8d6] shadow-none hover:bg-[#2c2a24]/85';
