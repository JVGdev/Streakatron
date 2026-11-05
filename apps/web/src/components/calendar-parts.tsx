// What the calendar page (D39) puts on its days: event and task chips (open tasks drag to
// another day), the day's focus and commitments met, its load, and the "To schedule" tray.

import { timeRange, type DayLoad } from '@streakatron/shared/calendar';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import {
  CalendarDays,
  Check,
  ChevronDown,
  Flag,
  Repeat,
  Repeat2,
  Search,
  Timer,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { useOpenSheet } from '@/hooks/use-open-task';
import type { PlacedTask } from '@/lib/calendar';
import { formatMinutes } from '@/lib/days';
import { COLOR } from '@/lib/look';
import type { CalendarData, CalendarItem, Project, Task } from '@/lib/queries';
import { cn } from '@/lib/utils';

export type ProjectsById = Map<string, Project>;

/** Drag ids: `s:tsk_…` moves the scheduled day, `d:tsk_…` the due day. */
const dragId = (task: { id: string }, which: 'scheduled' | 'due') =>
  `${which === 'due' ? 'd' : 's'}:${task.id}`;

export function EventChip({
  event,
  projects,
  compact,
}: {
  event: CalendarItem;
  projects: ProjectsById;
  compact?: boolean;
}) {
  const open = useOpenSheet();
  const project = event.projectId ? projects.get(event.projectId) : undefined;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        open('event', event.id);
      }}
      title={event.title}
      className={cn(
        'flex w-full min-w-0 items-center gap-x-1.5 rounded-md bg-glow/25 px-1.5 text-left text-xs font-semibold text-glow-foreground transition-colors hover:bg-glow/40',
        compact ? 'h-5' : 'min-h-6 flex-wrap py-0.5',
      )}
    >
      {project && (
        <span
          className={cn('size-1.5 shrink-0 rounded-full', COLOR[project.color].dot)}
          aria-hidden
        />
      )}
      {event.startTime && (
        <span className="shrink-0 font-normal tabular-nums opacity-80">
          {compact ? event.startTime : timeRange(event.startTime, event.durationMinutes)}
        </span>
      )}
      <span className={cn('min-w-0', compact ? 'truncate' : 'break-words')}>{event.title}</span>
      {event.repeat && !compact && (
        <Repeat className="ml-auto size-3 shrink-0 opacity-60" aria-label="Repeats" />
      )}
    </button>
  );
}

export function TaskChip({
  placed,
  projects,
  compact,
}: {
  placed: PlacedTask<Task>;
  projects: ProjectsById;
  compact?: boolean;
}) {
  const open = useOpenSheet();
  const { task, planned, due } = placed;
  const which = planned ? 'scheduled' : 'due';
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId(task, which),
    data: { task, which },
  });
  const project = task.projectId ? projects.get(task.projectId) : undefined;
  const label = task.status === 'waiting' && planned ? 'Follow up' : due ? 'Due' : null;
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.stopPropagation();
        open('task', task.id);
      }}
      title={`${task.title}${due ? ' (due)' : ''} · drag to another day`}
      className={cn(
        'flex w-full min-w-0 touch-none items-center gap-x-1.5 rounded-md border bg-card px-1.5 text-left text-xs font-medium transition-colors hover:border-input',
        compact ? 'h-5' : 'min-h-6 flex-wrap py-0.5',
        isDragging && 'opacity-40',
      )}
    >
      <span
        className={cn(
          'size-1.5 shrink-0 rounded-full',
          project ? COLOR[project.color].dot : 'bg-muted-foreground/50',
        )}
        aria-hidden
      />
      <span className={cn('min-w-0', compact ? 'truncate' : 'flex-1 break-words')}>
        {task.title}
      </span>
      {label && !compact && (
        <span
          className={cn(
            'ml-auto inline-flex shrink-0 items-center gap-0.5 text-[10px] font-bold uppercase',
            label === 'Due' ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {label === 'Due' && <Flag className="size-2.5" aria-hidden />}
          {label}
        </span>
      )}
      {label === 'Due' && compact && (
        <Flag className="ml-auto size-2.5 shrink-0 text-destructive" aria-label="Due" />
      )}
    </button>
  );
}

export type AheadItem = CalendarData['ahead'][number];

/** A repeating task's coming day (D43): faint, not draggable; opens its newest occurrence. */
export function AheadChip({
  item,
  projects,
  compact,
}: {
  item: AheadItem;
  projects: ProjectsById;
  compact?: boolean;
}) {
  const open = useOpenSheet();
  const project = item.projectId ? projects.get(item.projectId) : undefined;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        open('task', item.taskId);
      }}
      title={`${item.title} (repeats; comes on this day)`}
      className={cn(
        'flex w-full min-w-0 items-center gap-1.5 rounded-md border border-dashed px-1.5 text-left text-xs text-muted-foreground hover:bg-muted',
        compact ? 'h-5' : 'min-h-6 py-0.5',
      )}
    >
      <Repeat2
        className={cn('size-3 shrink-0', project && COLOR[project.color].text)}
        aria-label="Repeats"
      />
      <span className="truncate">{item.title}</span>
    </button>
  );
}

export function DoneChip({ task, compact }: { task: Task; compact?: boolean }) {
  const open = useOpenSheet();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        open('task', task.id);
      }}
      title={`${task.title} (done)`}
      className={cn(
        'flex w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 text-left text-xs text-muted-foreground line-through hover:bg-muted',
        compact ? 'h-5' : 'min-h-6 py-0.5',
      )}
    >
      <Check className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{task.title}</span>
    </button>
  );
}

/** A day's focus minutes and the commitments met that day. */
export function DayExtras({
  day,
  commitmentTitles,
}: {
  day?: { focusMinutes: number; sessions: number; commitmentsMet: string[] };
  commitmentTitles: Map<string, string>;
}) {
  if (!day || (!day.focusMinutes && !day.commitmentsMet.length)) return null;
  const met = day.commitmentsMet.map((id) => commitmentTitles.get(id)).filter(Boolean);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-1 text-[11px] text-muted-foreground">
      {day.focusMinutes > 0 && (
        <span className="inline-flex items-center gap-0.5" title={`${day.sessions} focus sessions`}>
          <Timer className="size-3" aria-hidden />
          {formatMinutes(day.focusMinutes)}
        </span>
      )}
      {day.commitmentsMet.length > 0 && (
        <span className="inline-flex items-center gap-0.5" title={met.join(', ')}>
          <Check className="size-3" aria-hidden />
          {day.commitmentsMet.length} met
        </span>
      )}
    </div>
  );
}

const LOAD_LOOK = {
  free: { label: 'Free', bar: 'bg-muted', width: '0%' },
  light: { label: 'Light', bar: 'bg-emerald-500', width: '33%' },
  busy: { label: 'Busy', bar: 'bg-amber-500', width: '66%' },
  full: { label: 'Full', bar: 'bg-destructive', width: '100%' },
} as const;

/** How much is planned on a day (D32): a small bar and a word, the numbers on hover. */
export function LoadMeter({ load }: { load: DayLoad }) {
  const look = LOAD_LOOK[load.level];
  const parts = [
    load.tasks ? `${load.tasks} task${load.tasks === 1 ? '' : 's'}` : null,
    load.eventMinutes ? `${formatMinutes(load.eventMinutes)} of events` : null,
  ].filter(Boolean);
  return (
    <div className="grid gap-0.5" title={parts.length ? parts.join(' · ') : 'Nothing planned'}>
      <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className={cn('h-full rounded-full', look.bar)} style={{ width: look.width }} />
      </div>
      <span
        className={cn(
          'text-[10px] font-bold tracking-wide uppercase',
          load.level === 'full' ? 'text-destructive' : 'text-muted-foreground',
        )}
      >
        {look.label}
        <span className="sr-only">: {parts.join(', ') || 'nothing planned'}</span>
      </span>
    </div>
  );
}

/** A day that open tasks can be dropped on. */
export function DropDay({
  day,
  className,
  children,
  onClick,
  label,
}: {
  day: string;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
  label?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${day}`, data: { day } });
  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      aria-label={label}
      className={cn(className, isOver && 'bg-primary/10 ring-2 ring-primary/50 ring-inset')}
    >
      {children}
    </div>
  );
}

const TRAY_KEY = 'streakatron:schedule-tray';

/** Open tasks without a date, to drag onto a day (wider screens); can be folded away. */
export function ScheduleTray({ tasks, projects }: { tasks: Task[]; projects: ProjectsById }) {
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(() => {
    try {
      return localStorage.getItem(TRAY_KEY) !== 'hidden';
    } catch {
      return true;
    }
  });
  const toggle = () => {
    setShown(!shown);
    try {
      localStorage.setItem(TRAY_KEY, shown ? 'hidden' : 'shown');
    } catch {
      // Private mode: it just won't be remembered.
    }
  };
  if (!tasks.length) return null;
  const list = tasks
    .filter((t) => t.title.toLowerCase().includes(q.trim().toLowerCase()))
    .slice(0, 40);
  return (
    <section
      aria-label="To schedule"
      className="hidden gap-2 rounded-2xl border-2 border-dashed p-2.5 md:grid"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={shown}
          className="flex items-center gap-1.5 text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase hover:text-foreground"
        >
          <ChevronDown className={cn('size-3.5 transition-transform', !shown && '-rotate-90')} />
          To schedule · {tasks.length}
        </button>
        {shown && (
          <>
            <span className="text-xs text-muted-foreground">
              Drag a task onto a day to plan it.
            </span>
            {tasks.length > 8 && (
              <div className="relative ml-auto w-44">
                <Search
                  className="absolute top-2 left-2 size-3.5 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  aria-label="Filter tasks"
                  placeholder="Filter"
                  className="h-7 pl-7 text-sm"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
            )}
          </>
        )}
      </div>
      {shown && (
        <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
          {list.map((t) => (
            <div key={t.id} className="w-44">
              <TaskChip
                placed={{ task: t, planned: true, due: false }}
                projects={projects}
                compact
              />
            </div>
          ))}
          {!list.length && <p className="text-xs text-muted-foreground">Nothing matches.</p>}
        </div>
      )}
    </section>
  );
}

/** Today's events on Today, one line each; nothing when there are none. */
export function TodayEvents({
  events,
  projects,
}: {
  events: CalendarItem[];
  projects: ProjectsById;
}) {
  const list = events
    .filter((e) => e.precision === 'day' && e.days.length)
    .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
  if (!list.length) return null;
  return (
    <section aria-label="On the calendar today" className="grid gap-1.5">
      <h2 className="flex items-center gap-1.5 px-1 font-sans text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase">
        <CalendarDays className="size-3.5" aria-hidden />
        On the calendar
      </h2>
      <div className="grid gap-1 sm:max-w-md">
        {list.map((e) => (
          <EventChip key={e.id} event={e} projects={projects} />
        ))}
      </div>
    </section>
  );
}
