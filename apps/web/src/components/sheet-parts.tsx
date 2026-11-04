// Pieces every detail sheet (task, goal, area) shares: the save state and the title field.

import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export function SaveState({ status }: { status: string }) {
  const text =
    status === 'saving' || status === 'pending'
      ? 'Saving…'
      : status === 'error'
        ? 'Not saved'
        : 'Saved';
  return (
    <span
      className={cn('text-xs text-muted-foreground', status === 'error' && 'text-destructive')}
      aria-live="polite"
    >
      {text}
    </span>
  );
}

/** The sticky bar on top of a sheet: where the thing lives, its save state, close. */
export function SheetBar({
  children,
  status,
  onClose,
}: {
  children: ReactNode;
  status: string;
  onClose: () => void;
}) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 px-4 py-2.5 backdrop-blur sm:px-6">
      <div className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{children}</div>
      <SaveState status={status} />
      <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
        <X />
      </Button>
    </div>
  );
}

/** A title edited in place: one line, saved as you type; an empty one isn't saved. */
export function TitleField({
  value,
  onChange,
  what,
  struck,
}: {
  value: string;
  onChange: (title: string) => void;
  /** “A task needs a title”. */
  what: string;
  struck?: boolean;
}) {
  return (
    <div className="min-w-0 flex-1">
      <Textarea
        aria-label="Title"
        value={value}
        maxLength={200}
        rows={1}
        onChange={(e) => onChange(e.target.value.replace(/\n/g, ' '))}
        onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
        className={cn(
          'min-h-0 resize-none border-transparent px-1 py-1 font-display text-2xl font-semibold tracking-tight md:text-2xl shadow-none focus-visible:border-input dark:bg-transparent',
          struck && 'text-muted-foreground line-through',
        )}
      />
      {!value.trim() && (
        <p className="px-1 text-xs text-destructive">A {what} needs a title; this isn’t saved.</p>
      )}
    </div>
  );
}
