// A commitment's details, in a side sheet opened by `?commitment=` from anywhere (Today, a mention,
// the palette): today's entries, its streak and the last 4 weeks, what it asks, its description.

import { amountText, progressText, targetText } from '@streakatron/shared/commitments';
import type { RichDoc } from '@streakatron/shared/rich';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  Archive,
  ArchiveRestore,
  Flame,
  Pencil,
  Play,
  Repeat,
  Timer,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useQuickFocus } from '@/hooks/use-focus';
import { useOpenSheet } from '@/hooks/use-open-task';
import { useCommitmentActions } from '@/lib/actions';
import { ApiError } from '@/lib/api';
import { useAutosave } from '@/lib/autosave';
import { commitmentQuery, meQuery, type CommitmentDetail } from '@/lib/queries';
import { editCommitment } from '@/lib/ui-store';
import { cn } from '@/lib/utils';
import { Backlinks } from './backlinks';
import { doneToday } from '@/lib/commitments';
import { CommitmentControl, LogPopover } from './commitment-row';
import { EntityIcon } from './entity-icon';
import { RichEditor } from './rich-editor';
import { SheetBar, TitleField } from './sheet-parts';

export function CommitmentSheet({ commitmentId }: { commitmentId: string | undefined }) {
  const open = useOpenSheet();
  const { data, error, isFetchedAfterMount } = useQuery({
    ...commitmentQuery(commitmentId ?? ''),
    enabled: !!commitmentId,
  });

  useEffect(() => {
    if (error instanceof ApiError && error.status === 404) {
      toast.error('That commitment doesn’t exist anymore.');
      open('commitment', undefined);
    }
  }, [error, open]);

  return (
    <Sheet open={!!commitmentId} onOpenChange={(o) => !o && open('commitment', undefined)}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl"
        aria-describedby={undefined}
      >
        {/* Fresh data only: the editors start from it (see task-sheet.tsx). */}
        {data && data.id === commitmentId && isFetchedAfterMount ? (
          <CommitmentEditor key={data.id} commitment={data} />
        ) : (
          <div className="p-6">
            <SheetTitle className="sr-only">Commitment</SheetTitle>
            <div className="h-6 w-2/3 animate-pulse rounded bg-muted" />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

const time = new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' });

function CommitmentEditor({ commitment: c }: { commitment: CommitmentDetail }) {
  const actions = useCommitmentActions();
  const open = useOpenSheet();
  const quickFocus = useQuickFocus();
  const { data: me } = useQuery(meQuery);
  const { data: live = c } = useQuery({ ...commitmentQuery(c.id), initialData: c });
  const weekStart = me?.settings.weekStart ?? 1;
  const archived = !!live.archivedAt;

  const [title, setTitle] = useState(c.title);
  const [description, setDescription] = useState<RichDoc | null>(c.description);
  const save = useAutosave(
    { title, description },
    (v) => (v.title.trim() ? actions.save(c.id, v) : Promise.resolve()),
    { what: 'the commitment' },
  );
  const close = () => open('commitment', undefined);

  return (
    <div className="flex min-h-full flex-col">
      <SheetBar status={save.status} onClose={close}>
        {live.project ? (
          <Link
            to="/projects/$projectId"
            params={{ projectId: live.project.id }}
            className="inline-flex items-center gap-1.5 hover:underline"
          >
            <EntityIcon icon={live.project.icon} color={live.project.color} size="sm" />
            {live.project.title}
          </Link>
        ) : (
          <Link to="/commitments" className="hover:underline">
            Commitments
          </Link>
        )}
      </SheetBar>

      <div className="grid gap-6 px-4 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          <Repeat className="mt-2.5 size-5 shrink-0 text-ember" aria-hidden />
          <SheetTitle className="sr-only">{c.title}</SheetTitle>
          <SheetDescription className="sr-only">Commitment details</SheetDescription>
          <TitleField value={title} onChange={setTitle} what="commitment" />
        </div>

        {archived ? (
          <p className="rounded-2xl border-2 border-dashed px-4 py-3 text-sm text-muted-foreground">
            Archived: it doesn’t show on Today and can’t be logged on.
          </p>
        ) : (
          <section
            aria-label="Today"
            className="flex flex-wrap items-center gap-4 rounded-2xl border-2 bg-card p-4 shadow-ledge"
          >
            <CommitmentControl commitment={live} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase">
                Today
              </div>
              <div
                className={cn(
                  'font-display text-xl font-semibold',
                  doneToday(live) && 'text-ember',
                )}
              >
                {live.day.scheduled ? progressText(live, live.day.progress) : 'Nothing asked today'}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {live.measure !== 'check' && (
                <LogPopover commitment={live}>
                  <Button variant="outline" size="sm">
                    {live.measure === 'minutes' ? 'Log minutes' : 'Add…'}
                  </Button>
                </LogPopover>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void quickFocus({ commitmentId: c.id })}
              >
                <Play />
                Focus
              </Button>
            </div>
            {live.entries.length > 0 && (
              <ul className="grid w-full gap-1 border-t pt-3 text-sm" aria-label="Today’s entries">
                {live.entries.map((e) => (
                  <li key={e.id} className="flex items-center gap-2">
                    {e.source === 'focus' && (
                      <Timer className="size-3.5 text-muted-foreground" aria-label="From focus" />
                    )}
                    <span className="font-semibold">
                      {live.measure === 'check' ? 'Done' : `+${amountText(live, e.amount)}`}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {time.format(new Date(e.createdAt))}
                    </span>
                    <span className="flex-1" />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove this entry"
                      onClick={() => void actions.unlog(c.id, e.id)}
                    >
                      <X />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <dl className="grid grid-cols-[7rem_1fr] items-center gap-x-3 gap-y-2.5 text-sm">
          <dt className="text-muted-foreground">Asks for</dt>
          <dd className="flex items-center gap-2">
            {targetText(live, weekStart)}
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              aria-label="Edit what it asks for"
              onClick={() => editCommitment(c.id)}
            >
              <Pencil />
            </Button>
          </dd>
          <dt className="text-muted-foreground">Streak</dt>
          <dd className="flex items-center gap-1.5">
            <Flame className="size-4 text-ember" aria-hidden />
            {live.streak.current} {live.streak.unit}
            {live.streak.current === 1 ? '' : 's'}
            {live.streak.longest > live.streak.current && (
              <span className="text-muted-foreground">· best {live.streak.longest}</span>
            )}
          </dd>
        </dl>

        <History commitment={live} />

        <div className="grid gap-1.5">
          <Label className="text-muted-foreground">Description</Label>
          <RichEditor
            aria-label="Description"
            value={c.description}
            onChange={setDescription}
            selfId={c.id}
            placeholder="Why you keep it, how you do it… Type @ to link things."
          />
        </div>

        <Backlinks id={c.id} />
      </div>

      <div className="mt-auto flex items-center gap-2 border-t px-4 py-3 sm:px-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void actions.archive({ id: c.id, title }, !archived)}
        >
          {archived ? <ArchiveRestore /> : <Archive />}
          {archived ? 'Unarchive' : 'Archive'}
        </Button>
        <span className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={async () => {
            await save.flush();
            close();
            void actions.delete({ id: c.id, title });
          }}
        >
          <Trash2 />
          Delete
        </Button>
      </div>
    </div>
  );
}

const day = new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' });

/** The last 4 weeks, a square a day: met, partly done, missed, or not asked. */
function History({ commitment: c }: { commitment: CommitmentDetail }) {
  return (
    <section aria-label="Last 4 weeks" className="grid gap-2">
      <h3 className="text-sm font-medium text-muted-foreground">Last 4 weeks</h3>
      <div className="grid w-fit grid-cols-7 gap-1.5">
        {c.history.map((h) => {
          const label = `${day.format(new Date(`${h.day}T12:00:00Z`))}: ${
            h.met
              ? 'done'
              : h.amount > 0
                ? `${amountText(c, h.amount)}`
                : h.scheduled
                  ? 'missed'
                  : 'not asked'
          }`;
          return (
            <span
              key={h.day}
              title={label}
              aria-label={label}
              role="img"
              className={cn(
                'size-5 rounded-md',
                h.met
                  ? 'bg-ember'
                  : h.amount > 0
                    ? 'bg-ember/35'
                    : h.scheduled
                      ? 'bg-muted'
                      : 'border-2 border-dashed border-muted',
              )}
            />
          );
        })}
      </div>
    </section>
  );
}
