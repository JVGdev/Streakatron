// A commitment in a list (Today, the commitments page, a project): the control its measure needs
// (a tick, +1, minutes typed in), where it stands, its streak, and a focus start (D31).

import { amountText, progressText, targetText } from '@streakatron/shared/commitments';
import { Check, Flame, Play, Plus } from 'lucide-react';
import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useOpenSheet } from '@/hooks/use-open-task';
import { useQuickFocus } from '@/hooks/use-focus';
import { useCommitmentActions } from '@/lib/actions';
import { doneToday } from '@/lib/commitments';
import type { Commitment } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { EntityIcon } from './entity-icon';

type Row = Pick<
  Commitment,
  'id' | 'title' | 'measure' | 'target' | 'unit' | 'period' | 'schedule' | 'day' | 'streak'
> & {
  entries: Commitment['entries'];
  project?: Commitment['project'];
  archivedAt?: string | null;
};

export function CommitmentRow({
  commitment: c,
  tile,
  showProject = true,
  weekStart = 1,
}: {
  commitment: Row;
  /** A roomy card of its own (Today). */
  tile?: boolean;
  showProject?: boolean;
  weekStart?: number;
}) {
  const open = useOpenSheet();
  const quickFocus = useQuickFocus();
  const archived = !!c.archivedAt;
  const showBar = c.measure !== 'check' || c.period === 'week';

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      open('commitment', c.id);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      data-task-row
      onClick={() => open('commitment', c.id)}
      onKeyDown={onKeyDown}
      className={cn(
        'group flex cursor-pointer items-center gap-3 outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        tile
          ? 'gap-3.5 rounded-2xl border-2 border-muted bg-background p-3 transition-colors hover:border-input'
          : 'rounded-xl px-2 py-2 hover:bg-muted/60 focus-visible:bg-muted',
      )}
    >
      {archived ? (
        <span className="size-8 shrink-0" />
      ) : (
        <CommitmentControl commitment={c} size={tile ? 'lg' : 'md'} />
      )}
      <div className="min-w-0 flex-1">
        <div className={cn('break-words', tile ? 'text-base leading-6 font-bold' : 'text-sm')}>
          {c.title}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-muted-foreground">
          <span className={cn(doneToday(c) && 'text-ember')}>
            {c.day.scheduled ? progressText(c, c.day.progress) : targetText(c, weekStart)}
          </span>
          {c.day.scheduled && <span className="max-sm:hidden">{targetText(c, weekStart)}</span>}
          {c.streak.current > 0 && (
            <span className="inline-flex items-center gap-1" title="Its streak">
              <Flame className="size-3.5 text-ember" aria-hidden />
              {c.streak.current} {c.streak.unit === 'day' ? 'd' : 'wk'}
              <span className="sr-only">streak</span>
            </span>
          )}
          {showProject && c.project && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <EntityIcon icon={c.project.icon} color={c.project.color} size="sm" />
              <span className="truncate">{c.project.title}</span>
            </span>
          )}
        </div>
        {showBar && c.day.scheduled && !archived && (
          <div className="mt-1.5 h-1.5 max-w-56 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-ember transition-[width]"
              style={{ width: `${Math.min(100, (c.day.progress / c.target) * 100)}%` }}
            />
          </div>
        )}
      </div>
      {!archived && (
        <div className="flex shrink-0 items-center gap-1">
          {c.measure === 'count' && <LogButton commitment={c} />}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Focus on “${c.title}”`}
            title="Start a focus session on it"
            className="text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 focus-visible:opacity-100 max-md:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              void quickFocus({ commitmentId: c.id });
            }}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <Play />
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * The round button on the left: a tick for checks (ticking again unticks today's), +1 for
 * amounts, and "log minutes" for minutes.
 */
export function CommitmentControl({
  commitment: c,
  size = 'md',
}: {
  commitment: Row;
  size?: 'md' | 'lg';
}) {
  const actions = useCommitmentActions();
  const [busy, setBusy] = useState(false);
  const round = cn(
    'grid shrink-0 place-items-center rounded-full border-2 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
    size === 'md' ? 'size-6' : 'size-8 border-[3px]',
  );
  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    await fn();
    setBusy(false);
  };
  const stop = {
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
    onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation(),
  };

  if (c.measure === 'check') {
    const ticked = c.day.today > 0;
    const last = c.entries.at(-1);
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={ticked}
        aria-label={ticked ? `Untick “${c.title}” for today` : `Tick “${c.title}” for today`}
        disabled={busy || (!ticked && !c.day.scheduled)}
        {...stop}
        onClick={(e) => {
          e.stopPropagation();
          void run(() => (ticked && last ? actions.unlog(c.id, last.id) : actions.log(c.id)));
        }}
        className={cn(
          round,
          ticked
            ? 'border-ember bg-ember text-white shadow-[0_2px_0_var(--ember-shade)]'
            : 'group/check border-dashed border-muted-foreground/45 bg-card hover:border-solid hover:border-ember hover:bg-glow/60',
        )}
      >
        <Check
          className={cn(
            'stroke-[3.5]',
            size === 'md' ? 'size-3.5' : 'size-4',
            ticked ? 'opacity-100' : 'text-ember opacity-0 group-hover/check:opacity-80',
          )}
        />
      </button>
    );
  }

  if (c.measure === 'count') {
    return (
      <button
        type="button"
        aria-label={`Add 1 to “${c.title}”`}
        disabled={busy}
        {...stop}
        onClick={(e) => {
          e.stopPropagation();
          void run(() => actions.log(c.id, 1));
        }}
        className={cn(
          round,
          'border-ember/60 bg-card font-display text-xs font-bold text-ember hover:bg-glow/60',
          doneToday(c) && 'border-ember bg-ember text-white',
        )}
      >
        +1
      </button>
    );
  }

  return (
    <LogPopover commitment={c}>
      <button
        type="button"
        aria-label={`Log minutes on “${c.title}”`}
        {...stop}
        className={cn(
          round,
          'border-ember/60 bg-card text-ember hover:bg-glow/60',
          doneToday(c) && 'border-ember bg-ember text-white',
        )}
      >
        <Plus className={size === 'md' ? 'size-3.5' : 'size-4'} strokeWidth={3} />
      </button>
    </LogPopover>
  );
}

/** "+N" for amounts: a popover to type how many. */
function LogButton({ commitment: c }: { commitment: Row }) {
  return (
    <LogPopover commitment={c}>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs font-bold text-muted-foreground"
        aria-label={`Add an amount to “${c.title}”`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        +N
      </Button>
    </LogPopover>
  );
}

const MINUTE_CHIPS = [5, 10, 15, 30];

/** Type an amount or minutes (work done elsewhere: Duolingo, Anki, a course). */
export function LogPopover({
  commitment: c,
  children,
}: {
  commitment: Pick<Row, 'id' | 'title' | 'measure' | 'unit' | 'target' | 'day'>;
  children: React.ReactNode;
}) {
  const actions = useCommitmentActions();
  const [open, setOpen] = useState(false);
  const left = Math.max(0, c.target - c.day.progress);
  const [value, setValue] = useState('');
  const n = Math.round(Number(value));
  const valid = Number.isFinite(n) && n >= 1 && (c.measure !== 'minutes' || n <= 1440);

  async function add(amount: number) {
    setOpen(false);
    setValue('');
    await actions.log(c.id, amount);
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (valid) void add(n);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        className="w-64"
        align="start"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <form onSubmit={submit} className="grid gap-3">
          <label className="grid gap-1.5 text-sm font-bold">
            {c.measure === 'minutes' ? 'Minutes done' : `How many${c.unit ? ` ${c.unit}` : ''}?`}
            <div className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={c.measure === 'minutes' ? 1440 : undefined}
                autoFocus
                placeholder={left ? String(left) : undefined}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
              <Button type="submit" disabled={!valid}>
                Add
              </Button>
            </div>
          </label>
          {c.measure === 'minutes' && (
            <div className="flex flex-wrap gap-1.5">
              {MINUTE_CHIPS.map((m) => (
                <Button
                  key={m}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-full px-2.5 text-xs"
                  onClick={() => void add(m)}
                >
                  {m} min
                </Button>
              ))}
            </div>
          )}
          {left > 0 && (
            <p className="text-xs text-muted-foreground">
              {amountText(c, left)} to go {c.measure === 'minutes' ? 'today' : ''}
            </p>
          )}
        </form>
      </PopoverContent>
    </Popover>
  );
}
