// A note (D46) opened from the board, a mention chip or search, in a side sheet over any page
// (`?note=not_…`). Its text saves as you type; the colour and project when changed. Sorting it is
// here too: make it a task, add it to a task, turn it into something else, or dismiss it.

import { noteTitle } from '@streakatron/shared/notes';
import type { RichDoc } from '@streakatron/shared/rich';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ListPlus, ListTodo, StickyNote, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { useOpenSheet } from '@/hooks/use-open-task';
import { useNoteActions } from '@/lib/actions';
import { ApiError } from '@/lib/api';
import { useAutosave } from '@/lib/autosave';
import { noteQuery, projectsQuery, type Note } from '@/lib/queries';
import { setUi } from '@/lib/ui-store';
import { Backlinks } from './backlinks';
import { EntityIcon } from './entity-icon';
import { EventProjectField } from './event-fields';
import { NoteColors } from './note-parts';
import { RichEditor } from './rich-editor';
import { SheetBar } from './sheet-parts';
import { TurnInto } from './turn-into';

export function NoteSheet({ noteId }: { noteId: string | undefined }) {
  const open = useOpenSheet();
  const { data, error, isFetchedAfterMount } = useQuery({
    ...noteQuery(noteId ?? ''),
    enabled: !!noteId,
  });

  useEffect(() => {
    if (error instanceof ApiError && error.status === 404) {
      toast.error('That note isn’t on the board anymore.');
      open('note', undefined);
    }
  }, [error, open]);

  return (
    <Sheet open={!!noteId} onOpenChange={(o) => !o && open('note', undefined)}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl"
        aria-describedby={undefined}
      >
        {/* Fresh data only: the editor starts from it (see task-sheet.tsx). */}
        {data && data.id === noteId && isFetchedAfterMount ? (
          <NoteEditor key={data.id} note={data} />
        ) : (
          <div className="p-6">
            <SheetTitle className="sr-only">Note</SheetTitle>
            <div className="h-48 w-48 animate-pulse rounded bg-muted" />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function NoteEditor({ note }: { note: Note }) {
  const actions = useNoteActions();
  const open = useOpenSheet();
  const { data: projects = [] } = useQuery(projectsQuery);
  const project = projects.find((p) => p.id === note.projectId);
  const [description, setDescription] = useState<RichDoc | null>(note.description);
  const save = useAutosave({ description }, (v) => actions.save(note, v), { what: 'the note' });
  const title = noteTitle(description);
  const written = !!title;
  const close = () => open('note', undefined);

  /** Flush the text, close the sheet, then sort the note. */
  const sortWith = async (fn: () => unknown) => {
    await save.flush();
    close();
    fn();
  };

  return (
    <div className="flex min-h-full flex-col">
      <SheetBar status={save.status} onClose={close}>
        {project ? (
          <Link
            to="/projects/$projectId"
            params={{ projectId: project.id }}
            className="inline-flex items-center gap-1.5 hover:underline"
          >
            <EntityIcon icon={project.icon} color={project.color} size="sm" />
            {project.title}
          </Link>
        ) : (
          <Link to="/notes" className="inline-flex items-center gap-1.5 hover:underline">
            <StickyNote className="size-3.5" />
            Notes
          </Link>
        )}
      </SheetBar>

      <div className="grid gap-6 px-4 py-5 sm:px-6">
        <SheetTitle className="sr-only">{title || 'Note'}</SheetTitle>
        <div className="grid justify-items-start gap-3">
          <div data-color={note.color} className="postit w-full max-w-sm rounded-[2px] p-5 pt-7">
            <RichEditor
              aria-label="Note"
              value={note.description}
              onChange={setDescription}
              selfId={note.id}
              className="min-h-56 rounded-none border-0 bg-transparent p-0 font-hand text-2xl leading-tight shadow-none focus-within:border-0 focus-within:ring-0 md:text-2xl dark:bg-transparent"
            />
          </div>
          <NoteColors
            value={note.color}
            onChange={(color) => void actions.update(note, { color })}
          />
          {note.focusSessionId && (
            <p className="text-sm text-muted-foreground">
              {note.focusMinute
                ? `Written in minute ${note.focusMinute} of a focus session.`
                : 'Written in the break after a focus session.'}
            </p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label>Project</Label>
          <EventProjectField
            value={note.projectId}
            onChange={(projectId) => void actions.update(note, { projectId })}
          />
        </div>

        <Backlinks id={note.id} />
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t px-4 py-3 sm:px-6">
        <Button
          size="sm"
          disabled={!written}
          onClick={() => void sortWith(() => actions.toTask({ id: note.id, title }))}
        >
          <ListTodo />
          Make a task
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!written}
          onClick={() => void sortWith(() => setUi({ addToTask: { id: note.id, title } }))}
        >
          <ListPlus />
          Add to task…
        </Button>
        <span className="flex-1" />
        {written && (
          <TurnInto
            id={note.id}
            beforeOpen={save.flush}
            source={{ kind: 'note', title, projectId: note.projectId }}
          />
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void sortWith(() => actions.dismiss({ id: note.id, title }))}
        >
          <X />
          <span className="max-sm:sr-only">Dismiss</span>
        </Button>
      </div>
    </div>
  );
}
