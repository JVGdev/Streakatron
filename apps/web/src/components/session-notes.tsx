// The notes of a focus session (D46) on the focus page: written mid-session or in its break with
// "Note" (or N), shown as small post-its, sorted later on the Notes board.

import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { StickyNote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOpenSheet } from '@/hooks/use-open-task';
import { notesQuery } from '@/lib/queries';
import { newNote } from '@/lib/ui-store';
import { PostItMini } from './note-parts';

export function SessionNotes({ sessionId, board }: { sessionId: string; board?: boolean }) {
  const { data: notes = [] } = useQuery(notesQuery);
  const open = useOpenSheet();
  const mine = notes.filter((n) => n.focusSessionId === sessionId);
  return (
    <div className="grid w-full justify-items-center gap-3">
      {mine.length > 0 && (
        <div className="flex flex-wrap justify-center gap-3 px-2">
          {mine.map((n) => (
            <PostItMini key={n.id} note={n} onOpen={() => open('note', n.id)} />
          ))}
        </div>
      )}
      <div className="flex flex-wrap justify-center gap-1">
        <Button variant="ghost" size="sm" onClick={() => newNote()}>
          <StickyNote />
          Note
          <kbd className="ml-1 rounded border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
            N
          </kbd>
        </Button>
        {board && mine.length > 0 && (
          <Button variant="ghost" size="sm" asChild>
            <Link to="/notes">Notes board</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
