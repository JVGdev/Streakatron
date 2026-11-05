// A task's repeat (D43), in the task sheet: on a schedule (the calendar's rule) or some time after
// it's done. Edited in a popover and saved with one click, so trying options doesn't save each one.

import type { Repeat, RepeatUnit } from '@streakatron/shared/calendar';
import {
  AFTER_DONE_LIMITS,
  describeTaskRepeat,
  type AfterDoneUnit,
  type TaskRepeat,
} from '@streakatron/shared/repeats';
import { weekdayOf } from '@streakatron/shared/time';
import { useQuery } from '@tanstack/react-query';
import { Repeat2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDayShort } from '@/lib/days';
import { useTaskActions } from '@/lib/actions';
import { meQuery, type Task } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { RepeatDetails } from './event-fields';

type Choice = 'none' | RepeatUnit | 'after_done';

const CHOICES: { value: Choice; label: string }[] = [
  { value: 'none', label: 'Doesn’t repeat' },
  { value: 'day', label: 'Every day' },
  { value: 'week', label: 'Every week' },
  { value: 'month', label: 'Every month' },
  { value: 'year', label: 'Every year' },
  { value: 'after_done', label: 'Some time after it’s done' },
];

const AFTER_UNITS: AfterDoneUnit[] = ['day', 'week', 'month'];

const choiceOf = (r: TaskRepeat | null): Choice =>
  !r ? 'none' : r.kind === 'after_done' ? 'after_done' : r.every;

export function TaskRepeatField({
  id,
  value,
  date,
  onChange,
}: {
  id?: string;
  value: TaskRepeat | null;
  /** The day the repeat counts from: the task's date, or today. */
  date: string;
  onChange: (r: TaskRepeat | null) => void;
}) {
  const { data: me } = useQuery(meQuery);
  const weekStart = me?.settings.weekStart ?? 1;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<TaskRepeat | null>(value);

  const pick = (c: Choice) => {
    if (c === 'none') return setDraft(null);
    if (c === 'after_done') {
      return setDraft({ kind: 'after_done', every: 'day', interval: draft?.interval ?? 1 });
    }
    const rule: Repeat = {
      every: c,
      interval: draft?.kind === 'schedule' ? draft.interval : 1,
      until: draft?.kind === 'schedule' ? (draft.until ?? null) : null,
      ...(c === 'week'
        ? {
            weekdays:
              draft?.kind === 'schedule' && draft.weekdays?.length
                ? draft.weekdays
                : [weekdayOf(date)],
          }
        : {}),
    };
    setDraft({ kind: 'schedule', ...rule });
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        if (o) setDraft(value);
        setOpen(o);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            'h-8 min-w-0 justify-start gap-2 px-2 font-normal',
            !value && 'text-muted-foreground',
          )}
        >
          <Repeat2 className="text-muted-foreground" />
          <span className="truncate">{describeTaskRepeat(value, date)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="grid w-[min(20rem,calc(100vw-2rem))] gap-3">
        <Select value={choiceOf(draft)} onValueChange={(c) => pick(c as Choice)}>
          <SelectTrigger className="h-9 w-full" aria-label="Repeat">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CHOICES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {draft?.kind === 'schedule' && (
          <RepeatDetails
            date={date}
            weekStart={weekStart}
            value={draft}
            onChange={(r) => setDraft({ kind: 'schedule', ...r })}
          />
        )}
        {draft?.kind === 'after_done' && (
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Input
                aria-label="How many"
                type="number"
                min={AFTER_DONE_LIMITS.interval.min}
                max={AFTER_DONE_LIMITS.interval.max}
                className="h-8 w-16"
                value={draft.interval}
                onChange={(e) => {
                  const n = Math.round(Number(e.target.value));
                  const { min, max } = AFTER_DONE_LIMITS.interval;
                  if (n >= min && n <= max) setDraft({ ...draft, interval: n });
                }}
              />
              <Select
                value={draft.every}
                onValueChange={(u) => setDraft({ ...draft, every: u as AfterDoneUnit })}
              >
                <SelectTrigger className="h-8 w-28" aria-label="Unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AFTER_UNITS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                      {draft.interval === 1 ? '' : 's'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-muted-foreground">after it’s done</span>
            </div>
            <p className="px-1 text-xs text-muted-foreground">
              The next one comes when you complete this one.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={JSON.stringify(draft) === JSON.stringify(value)}
            onClick={() => {
              setOpen(false);
              onChange(draft);
            }}
          >
            {draft ? 'Save' : 'Stop repeating'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * An occurrence that came while earlier ones are still open (D43): says so, with "Skip it" (the
 * old one is deleted, with undo) and a way to open it.
 */
export function EarlierOpen({
  task,
  onOpen,
  compact = false,
}: {
  task: Pick<Task, 'earlierOpen' | 'title'>;
  onOpen?: (id: string) => void;
  compact?: boolean;
}) {
  const actions = useTaskActions();
  const { data: me } = useQuery(meQuery);
  const today = me?.today ?? '';
  const earlier = task.earlierOpen;
  if (!earlier.length) return null;
  const first = earlier[0]!;
  const when =
    earlier.length === 1
      ? `The one from ${formatDayShort(first.day, today)} is`
      : `${earlier.length} earlier ones are`;
  return (
    <div
      role="status"
      className={cn(
        'flex flex-wrap items-center gap-x-2 gap-y-1 text-amber-700 dark:text-amber-400',
        compact
          ? 'text-xs'
          : 'rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm',
      )}
    >
      <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
      <span>{when} still open.</span>
      <span className="flex items-center gap-1">
        <button
          type="button"
          className="font-semibold underline-offset-2 hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            void actions.skipEarlier(earlier.map((o) => o.id));
          }}
        >
          {earlier.length === 1 ? 'Skip it' : 'Skip them'}
        </button>
        {onOpen && (
          <>
            <span aria-hidden>·</span>
            <button
              type="button"
              className="underline-offset-2 hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                onOpen(first.id);
              }}
            >
              Open it
            </button>
          </>
        )}
      </span>
    </div>
  );
}
