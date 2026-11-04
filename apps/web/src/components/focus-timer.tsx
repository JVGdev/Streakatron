// The focus timer's pieces (D29): the ring, the mini timer on every page, the watcher that chimes
// and notifies, and the picker that attaches a session to a task or project.

import { autoFinishAt, formatClock, plannedEndAt } from '@streakatron/shared/focus';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useRouterState } from '@tanstack/react-router';
import { Coffee, Pause, Play, Search, Timer, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { RefIcon } from '@/components/entity-icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useFocusActions } from '@/lib/actions';
import { api, call } from '@/lib/api';
import {
  currentBreak,
  endBreak,
  hasChimed,
  markChimed,
  notify,
  serverNow,
  useFocusMemory,
} from '@/lib/focus-timer';
import { clockText, sessionLabel, useBreak, useFocus } from '@/hooks/use-focus';
import { playBreakChime, playFocusChime } from '@/lib/sound';
import { cn } from '@/lib/utils';

// --- The ring --------------------------------------------------------------------------------

export function FocusRing({
  progress,
  size = 280,
  stroke = 14,
  tone = 'focus',
  children,
  className,
}: {
  progress: number;
  size?: number;
  stroke?: number;
  tone?: 'focus' | 'overtime' | 'paused' | 'break';
  children?: ReactNode;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const length = 2 * Math.PI * r;
  const color = {
    focus: 'stroke-ember',
    overtime: 'stroke-primary',
    paused: 'stroke-muted-foreground/50',
    break: 'stroke-sky-500',
  }[tone];
  return (
    <div
      className={cn('relative grid place-items-center', className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={length}
          strokeDashoffset={length * (1 - Math.min(1, Math.max(0, progress)))}
          className={cn(color, 'transition-[stroke-dashoffset] duration-1000 ease-linear')}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

// --- The watcher -----------------------------------------------------------------------------

const BASE_TITLE = document.title;

/**
 * Headless, in the shell: chimes and notifies at the planned time and when a break ends, asks the
 * server again when a session reaches its cap (it finishes it), and shows the clock in the tab.
 */
export function FocusWatcher() {
  const qc = useQueryClient();
  const { session, clock } = useFocus();
  const brk = useFocusMemory(currentBreak);

  // The planned time: chime once per session (not again after a reload or in another tab).
  const plannedAt = session ? plannedEndAt(session)?.getTime() : undefined;
  useEffect(() => {
    if (!session || plannedAt === undefined || hasChimed(session.id)) return;
    const ring = () => {
      if (hasChimed(session.id)) return;
      markChimed(session.id);
      // A tab that was asleep through the planned time stays quiet about it.
      if (serverNow() - plannedAt > 60_000) return;
      playFocusChime();
      const what = `${session.plannedMinutes} minutes of focus done.`;
      notify('Time’s up', `${what} Keep going, or finish and take a break.`);
      toast(`Time’s up: ${what}`, { description: 'Overtime counts too, until you finish.' });
    };
    const timer = setTimeout(ring, Math.max(0, plannedAt - serverNow()));
    return () => clearTimeout(timer);
  }, [session, plannedAt]);

  // The cap: the server finishes the session; read its answer then.
  const capAt = session ? autoFinishAt(session)?.getTime() : undefined;
  useEffect(() => {
    if (capAt === undefined) return;
    const timer = setTimeout(
      () => void qc.invalidateQueries({ queryKey: ['focus'] }),
      Math.max(0, capAt - serverNow()) + 1500,
    );
    return () => clearTimeout(timer);
  }, [capAt, qc]);

  // The break's end.
  useEffect(() => {
    if (!brk) return;
    const end = () => {
      if (currentBreak()?.endsAt !== brk.endsAt) return;
      endBreak();
      playBreakChime();
      notify('Break’s over', 'Ready for another session?');
      toast('Break’s over. Ready for another session?');
    };
    const timer = setTimeout(end, Math.max(0, brk.endsAt - serverNow()));
    return () => clearTimeout(timer);
  }, [brk]);

  // The tab's title.
  const title =
    session && clock
      ? `${session.status === 'paused' ? '⏸ ' : ''}${clockText(clock)} · ${sessionLabel(session)}`
      : null;
  useEffect(() => {
    document.title = title ?? BASE_TITLE;
  }, [title]);
  useEffect(() => () => void (document.title = BASE_TITLE), []);

  return null;
}

// --- The mini timer --------------------------------------------------------------------------

/** The running session (or break) on every page: the sidebar on desktop, above the bar on phones. */
export function MiniTimer({ variant }: { variant: 'sidebar' | 'bar' }) {
  const { session, clock } = useFocus();
  const brk = useBreak();
  const focus = useFocusActions();
  // The focus page shows the timer itself.
  const onFocusPage = useRouterState({ select: (s) => s.location.pathname === '/focus' });
  if (onFocusPage) return null;

  if (session && clock) {
    const paused = session.status === 'paused';
    return (
      <div
        className={cn(
          'flex items-center gap-2.5 rounded-2xl border-2 bg-card p-2 shadow-ledge',
          variant === 'sidebar' ? 'mx-3 mb-3' : 'mx-3',
        )}
      >
        <Link
          to="/focus"
          className="flex min-w-0 flex-1 items-center gap-2.5"
          aria-label="Open the focus timer"
        >
          <FocusRing
            progress={clock.progress}
            size={38}
            stroke={5}
            tone={paused ? 'paused' : clock.phase}
          >
            <Timer className="size-4 text-muted-foreground" strokeWidth={2.6} />
          </FocusRing>
          <span className="min-w-0 flex-1">
            <span
              className={cn(
                'block font-display text-lg leading-tight font-semibold tabular-nums',
                clock.phase === 'overtime' && 'text-primary',
                paused && 'text-muted-foreground',
              )}
            >
              {clockText(clock)}
            </span>
            <span className="block truncate text-xs font-bold text-muted-foreground">
              {paused ? 'Paused · ' : ''}
              {sessionLabel(session)}
            </span>
          </span>
        </Link>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={paused ? 'Resume' : 'Pause'}
          onClick={() => void (paused ? focus.resume() : focus.pause())}
        >
          {paused ? <Play /> : <Pause />}
        </Button>
      </div>
    );
  }

  if (brk && !brk.over) {
    return (
      <div
        className={cn(
          'flex items-center gap-2.5 rounded-2xl border-2 bg-card p-2 shadow-ledge',
          variant === 'sidebar' ? 'mx-3 mb-3' : 'mx-3',
        )}
      >
        <Link to="/focus" className="flex min-w-0 flex-1 items-center gap-2.5">
          <FocusRing
            progress={1 - brk.remainingMs / (brk.minutes * 60_000)}
            size={38}
            stroke={5}
            tone="break"
          >
            <Coffee className="size-4 text-muted-foreground" strokeWidth={2.6} />
          </FocusRing>
          <span>
            <span className="block font-display text-lg leading-tight font-semibold tabular-nums">
              {formatClock(brk.remainingMs)}
            </span>
            <span className="block text-xs font-bold text-muted-foreground">Break</span>
          </span>
        </Link>
        <Button variant="ghost" size="icon-sm" aria-label="Skip the break" onClick={endBreak}>
          <X />
        </Button>
      </div>
    );
  }

  return null;
}

/** A number of minutes, marked invalid outside `min`…`max`. */
export function MinutesField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-1 text-sm font-bold">
      {label}
      <Input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={Number.isFinite(value) ? value : ''}
        aria-invalid={!(value >= min && value <= max)}
        onChange={(e) => onChange(e.target.valueAsNumber)}
      />
    </label>
  );
}

// --- Attaching -------------------------------------------------------------------------------

export interface Attachment {
  kind: 'task' | 'project';
  id: string;
  title: string;
}

/** Pick an open task or project to focus on (or none). */
export function AttachPicker({
  value,
  onChange,
}: {
  value: Attachment | null;
  onChange: (value: Attachment | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const { data: hits = [] } = useQuery({
    queryKey: ['search', 'focus-attach', q],
    queryFn: async () =>
      (await call(api.search.$get({ query: { q, limit: '10', types: 'task,project' } }))).results,
    enabled: open,
    staleTime: 10_000,
  });
  const choices = hits.filter((h) => !h.closed);

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="h-11 min-w-0 flex-1 justify-start rounded-2xl text-base"
          >
            <Search className="text-muted-foreground" />
            <span className={cn('truncate', !value && 'text-muted-foreground')}>
              {value ? value.title : 'Focus on a task or project (optional)'}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(28rem,calc(100vw-2rem))] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Find a task or project…" value={q} onValueChange={setQ} />
            <CommandList>
              <CommandEmpty>Nothing open matches.</CommandEmpty>
              <CommandGroup heading={q ? 'Matches' : 'Recent'}>
                {choices.map((h) => (
                  <CommandItem
                    key={h.id}
                    value={h.id}
                    onSelect={() => {
                      onChange({ kind: h.kind as Attachment['kind'], id: h.id, title: h.title });
                      setOpen(false);
                      setQ('');
                    }}
                  >
                    <RefIcon entity={h} />
                    <span className="min-w-0 flex-1 truncate">{h.title}</span>
                    {h.context && (
                      <span className="truncate text-xs text-muted-foreground">{h.context}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Focus on nothing in particular"
          onClick={() => onChange(null)}
        >
          <X />
        </Button>
      )}
    </div>
  );
}
