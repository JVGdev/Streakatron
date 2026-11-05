// The quick note (D46): `n` from any page (or a "Note" button) opens a post-it to write on. It's
// saved from the first character and as you type, so a reload or another device loses nothing; a
// note left empty goes when it's closed. And "Add to task": which task a note's text goes to.

import type { NoteColor } from '@streakatron/shared/notes';
import type { RichDoc } from '@streakatron/shared/rich';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useNoteActions } from '@/lib/actions';
import { useAutosave } from '@/lib/autosave';
import { INK_BUTTON } from '@/lib/notes';
import { searchQuery } from '@/lib/queries';
import { setUi, useUi } from '@/lib/ui-store';
import { NoteColors } from './note-parts';
import { RefIcon } from './entity-icon';
import { RichEditor } from './rich-editor';
import { SaveState } from './sheet-parts';

export function NoteDialogs() {
  const ui = useUi();
  return (
    <>
      {ui.quickNote && <QuickNote at={ui.quickNote} />}
      <Dialog open={!!ui.addToTask} onOpenChange={(o) => !o && setUi({ addToTask: null })}>
        {ui.addToTask && <AddToTask note={ui.addToTask} />}
      </Dialog>
    </>
  );
}

function QuickNote({ at }: { at: { x?: number; y?: number } }) {
  const actions = useNoteActions();
  const [doc, setDoc] = useState<RichDoc | null>(null);
  const [color, setColor] = useState<NoteColor>('yellow');
  const idRef = useRef<string | null>(null);
  const [written, setWritten] = useState(false);

  // The first save writes the note; the rest change it.
  const save = useAutosave(
    { description: doc },
    async (v) => {
      if (idRef.current) return actions.save({ id: idRef.current }, v);
      if (!v.description) return;
      const note = await actions.create({ ...v, color, ...at });
      idRef.current = note.id;
      setWritten(true);
    },
    { what: 'the note', delay: 400 },
  );

  const close = async () => {
    await save.flush();
    setUi({ quickNote: null });
    if (idRef.current && !doc) void actions.dismiss({ id: idRef.current, title: '' });
  };

  const pick = (c: NoteColor) => {
    setColor(c);
    if (idRef.current) void actions.update({ id: idRef.current }, { color: c });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && void close()}>
      <DialogContent
        data-color={color}
        showCloseButton={false}
        aria-describedby={undefined}
        className="postit gap-3 rounded-[2px] border-0 p-5 pt-7 sm:max-w-sm"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void close();
          }
        }}
      >
        <DialogTitle className="sr-only">New note</DialogTitle>
        <RichEditor
          autoFocus
          value={null}
          onChange={setDoc}
          aria-label="Note"
          className="min-h-44 rounded-none border-0 bg-transparent p-0 font-hand text-2xl leading-tight shadow-none focus-within:border-0 focus-within:ring-0 md:text-2xl dark:bg-transparent"
        />
        <div className="flex items-center gap-3">
          <NoteColors value={color} onChange={pick} />
          <span className="flex-1" />
          <span className="[&>span]:text-[#2c2a24]/60">
            <SaveState status={written || doc ? save.status : 'saved'} />
          </span>
          <Button size="sm" className={INK_BUTTON} onClick={() => void close()}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddToTask({ note }: { note: { id: string; title: string } }) {
  const actions = useNoteActions();
  const [q, setQ] = useState('');
  const { data: hits = [] } = useQuery(searchQuery(q, 30));
  const tasks = hits.filter((h) => h.kind === 'task' && !h.closed).slice(0, 8);

  const add = (task: { id: string; title: string }) => {
    setUi({ addToTask: null });
    void actions.appendTo(note, task);
  };

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Add to task</DialogTitle>
        <DialogDescription>
          “{note.title || 'Note'}” goes at the end of the task’s description.
        </DialogDescription>
      </DialogHeader>
      <Input
        autoFocus
        value={q}
        placeholder="Find a task"
        aria-label="Find a task"
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && tasks[0]) add(tasks[0]);
        }}
      />
      <ul className="-mx-2 grid gap-0.5" aria-label="Tasks">
        {tasks.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => add(t)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
            >
              <RefIcon entity={t} />
              <span className="min-w-0 flex-1 truncate">{t.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{t.context}</span>
            </button>
          </li>
        ))}
        {tasks.length === 0 && (
          <li className="px-2 py-1.5 text-sm text-muted-foreground">No open task matches.</li>
        )}
      </ul>
    </DialogContent>
  );
}
