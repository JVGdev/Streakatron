// The calendar (D39): a month or a week of events, open tasks on their scheduled and due days
// (drag one to another day to move that date), done tasks, focus and commitments met; the week
// view shows each day's load. Months ("~March") sit above the grid, undecided dates below.
// `?view=week&day=2026-11-05` picks what's shown.

import { MONTH_GRID_MAX_PER_WEEK, timesPerWeek } from '@streakatron/shared/repeats';
import { addDays, daysBetween } from '@streakatron/shared/time';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { z } from 'zod';
import {
  DayExtras,
  AheadChip,
  DoneChip,
  type AheadItem,
  DropDay,
  EventChip,
  LoadMeter,
  ScheduleTray,
  TaskChip,
  type ProjectsById,
} from '@/components/calendar-parts';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { useTaskActions } from '@/lib/actions';
import {
  loadOf,
  monthGrid,
  placeEvents,
  placeTasks,
  weekDays,
  type PlacedTask,
} from '@/lib/calendar';
import { formatTentative } from '@/lib/days';
import {
  calendarQuery,
  commitmentsQuery,
  meQuery,
  projectsQuery,
  tasksQuery,
  type CalendarData,
  type CalendarItem,
  type Task,
} from '@/lib/queries';
import { newEvent } from '@/lib/ui-store';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/calendar')({
  validateSearch: z.object({
    view: z.enum(['month', 'week']).optional(),
    day: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(projectsQuery),
      context.queryClient.ensureQueryData(tasksQuery({ status: 'open' })),
      context.queryClient.prefetchQuery(commitmentsQuery()),
    ]),
  component: CalendarPage,
});

const UTC = { timeZone: 'UTC' } as const;
const monthTitle = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', ...UTC });
const dayShort = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', ...UTC });
const weekdayShort = new Intl.DateTimeFormat('en-US', { weekday: 'short', ...UTC });
const weekdayLong = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  ...UTC,
});
const noon = (d: string) => new Date(`${d}T12:00:00Z`);

function addMonths(day: string, n: number) {
  const [y, m] = day.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}

interface Placed {
  events: Map<string, CalendarItem[]>;
  tasks: Map<string, PlacedTask<Task>[]>;
  done: Map<string, Task[]>;
  ahead: Map<string, AheadItem[]>;
}

function CalendarPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: me } = useQuery(meQuery);
  const today = me?.today ?? new Date().toISOString().slice(0, 10);
  const weekStart = me?.settings.weekStart ?? 1;
  const view = search.view ?? 'month';
  const anchor = search.day ?? today;
  const range =
    view === 'month' ? monthGrid(anchor, weekStart) : { ...weekDays(anchor, weekStart), weeks: [] };
  const { data } = useQuery(calendarQuery(range.from, range.to));
  const { data: open = [] } = useQuery(tasksQuery({ status: 'open' }));
  const { data: projectList = [] } = useQuery(projectsQuery);
  const { data: commitments = [] } = useQuery(commitmentsQuery());
  const tasks = useTaskActions();
  const [selected, setSelected] = useState<string>(anchor);
  const [dragging, setDragging] = useState<Task | null>(null);

  const projects: ProjectsById = useMemo(
    () => new Map(projectList.map((p) => [p.id, p])),
    [projectList],
  );
  const titles = useMemo(() => new Map(commitments.map((c) => [c.id, c.title])), [commitments]);
  // Tasks of resting projects stay off the calendar, as they're off Today.
  const live = open.filter((t) => !t.projectId || projects.get(t.projectId)?.status === 'active');
  const placed: Placed = {
    events: placeEvents((data?.events ?? []).filter((e) => e.precision === 'day')),
    tasks: placeTasks(live, range.from, range.to),
    done: groupDone(data),
    ahead: groupAhead(data),
  };
  const months = (data?.events ?? []).filter((e) => e.precision === 'month');
  const undecided = (data?.events ?? []).filter((e) => e.precision === 'tbd');
  const unscheduled = live.filter((t) => !t.dueDate && !t.scheduledDate && t.status !== 'waiting');

  const go = (patch: { view?: 'month' | 'week'; day?: string }) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }) });
  const step = (n: number) =>
    go({ day: view === 'month' ? addMonths(anchor, n) : addDays(anchor, 7 * n) });

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  function onDragEnd({ active, over }: DragEndEvent) {
    setDragging(null);
    const day = over?.data.current?.day as string | undefined;
    const { task, which } = (active.data.current ?? {}) as {
      task?: Task;
      which?: 'scheduled' | 'due';
    };
    if (!day || !task || !which) return;
    const field = which === 'due' ? 'dueDate' : 'scheduledDate';
    if (task[field] === day) return;
    void tasks.update(task, { [field]: day });
  }

  const title =
    view === 'month'
      ? monthTitle.format(noon(anchor))
      : `${dayShort.format(noon(range.from))} – ${dayShort.format(noon(range.to))}`;

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Calendar"
        actions={
          <Button onClick={() => newEvent({ date: view === 'month' ? selected : anchor })}>
            <Plus />
            New event
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center">
          <Button variant="ghost" size="icon" aria-label="Previous" onClick={() => step(-1)}>
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Next" onClick={() => step(1)}>
            <ChevronRight />
          </Button>
        </div>
        <h2 className="min-w-0 font-display text-xl font-semibold" aria-live="polite">
          {title}
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setSelected(today);
            go({ day: undefined });
          }}
        >
          Today
        </Button>
        <div
          className="ml-auto grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
          role="radiogroup"
          aria-label="View"
        >
          {(['month', 'week'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={view === v}
              onClick={() => go({ view: v === 'month' ? undefined : v })}
              className={cn(
                'rounded-md px-3 py-1 text-sm font-medium text-muted-foreground capitalize',
                view === v && 'bg-background text-foreground shadow-xs',
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {months.length > 0 && (
        <TentativeStrip
          label="Sometime this month"
          events={months}
          today={today}
          projects={projects}
        />
      )}

      <DndContext
        sensors={sensors}
        onDragStart={(e) => setDragging((e.active.data.current?.task as Task) ?? null)}
        onDragCancel={() => setDragging(null)}
        onDragEnd={onDragEnd}
      >
        <ScheduleTray tasks={unscheduled} projects={projects} />
        <div>
          <div className="min-w-0">
            {view === 'month' ? (
              <MonthView
                weeks={range.weeks}
                anchor={anchor}
                today={today}
                selected={selected}
                onSelect={setSelected}
                placed={placed}
                data={data}
                projects={projects}
                titles={titles}
              />
            ) : (
              <WeekView
                days={weekDays(anchor, weekStart).days}
                today={today}
                placed={placed}
                data={data}
                projects={projects}
                titles={titles}
              />
            )}
          </div>
        </div>
        <DragOverlay dropAnimation={null}>
          {dragging && (
            <div className="w-48 rounded-md border bg-card px-2 py-1 text-xs font-medium shadow-lg">
              {dragging.title}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {undecided.length > 0 && (
        <TentativeStrip label="No date yet" events={undecided} today={today} projects={projects} />
      )}
    </div>
  );
}

function groupDone(data: CalendarData | undefined) {
  const out = new Map<string, Task[]>();
  for (const t of (data?.doneTasks ?? []) as Task[]) {
    const day = t.scheduledDate ?? t.dueDate;
    if (day) out.set(day, [...(out.get(day) ?? []), t]);
  }
  return out;
}

function groupAhead(data: CalendarData | undefined) {
  const out = new Map<string, AheadItem[]>();
  for (const a of data?.ahead ?? []) {
    for (const day of a.days) out.set(day, [...(out.get(day) ?? []), a]);
  }
  return out;
}

function TentativeStrip({
  label,
  events,
  today,
  projects,
}: {
  label: string;
  events: CalendarItem[];
  today: string;
  projects: ProjectsById;
}) {
  return (
    <section className="flex flex-wrap items-center gap-2" aria-label={label}>
      <span className="text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase">
        {label}
      </span>
      {events.map((e) => (
        <span key={e.id} className="inline-flex max-w-xs items-center gap-1.5">
          <span className="w-auto">
            <EventChip event={e} projects={projects} />
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatTentative(e.date, e.precision, today)}
          </span>
        </span>
      ))}
    </section>
  );
}

const MAX_IN_CELL = 3;

function MonthView({
  weeks,
  anchor,
  today,
  selected,
  onSelect,
  placed,
  data,
  projects,
  titles,
}: {
  weeks: string[][];
  anchor: string;
  today: string;
  selected: string;
  onSelect: (day: string) => void;
  placed: Placed;
  data: CalendarData | undefined;
  projects: ProjectsById;
  titles: Map<string, string>;
}) {
  const month = anchor.slice(0, 7);
  const pick =
    selected.slice(0, 7) === month ? selected : month === today.slice(0, 7) ? today : `${month}-01`;
  return (
    <div className="grid gap-4">
      <div className="overflow-hidden rounded-2xl border-2">
        <div className="grid grid-cols-7 border-b bg-muted/40">
          {weeks[0]?.map((d) => (
            <div
              key={d}
              className="py-1.5 text-center text-[11px] font-bold tracking-wide text-muted-foreground uppercase"
            >
              {weekdayShort.format(noon(d))}
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0]} className="grid grid-cols-7 border-b last:border-b-0">
            {week.map((d) => {
              const events = placed.events.get(d) ?? [];
              const tasks = placed.tasks.get(d) ?? [];
              const done = placed.done.get(d) ?? [];
              // Busy schedules (a daily task) would fill every cell: week view and lists only.
              const ahead = (placed.ahead.get(d) ?? []).filter(
                (a) => timesPerWeek(a.repeat) <= MONTH_GRID_MAX_PER_WEEK,
              );
              const items = events.length + tasks.length + ahead.length + done.length;
              const outside = d.slice(0, 7) !== month;
              return (
                <DropDay
                  key={d}
                  day={d}
                  onClick={() => onSelect(d)}
                  className={cn(
                    'group relative flex min-h-16 cursor-pointer flex-col gap-0.5 border-r p-1 last:border-r-0 md:min-h-28',
                    outside && 'bg-muted/30',
                    d === pick && 'max-md:bg-primary/5',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        'grid size-6 place-items-center rounded-full text-xs font-semibold',
                        outside && 'text-muted-foreground/60',
                        d === today && 'bg-primary text-primary-foreground',
                      )}
                    >
                      {Number(d.slice(8))}
                    </span>
                    <button
                      type="button"
                      aria-label={`New event on ${weekdayLong.format(noon(d))}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        newEvent({ date: d });
                      }}
                      className="hidden size-6 place-items-center rounded-full text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted focus-visible:opacity-100 md:grid"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                  {/* Phones: dots; the day's list is under the grid. */}
                  <div className="flex flex-wrap gap-0.5 px-1 md:hidden" aria-hidden>
                    {events.slice(0, 3).map((e) => (
                      <span key={e.id} className="size-1.5 rounded-full bg-ember" />
                    ))}
                    {tasks.slice(0, 3).map((t) => (
                      <span
                        key={`${t.task.id}${t.due}`}
                        className={cn(
                          'size-1.5 rounded-full',
                          t.due ? 'bg-destructive' : 'bg-muted-foreground/60',
                        )}
                      />
                    ))}
                    {ahead.slice(0, 2).map((a) => (
                      <span
                        key={a.seriesId}
                        className="size-1.5 rounded-full border border-muted-foreground/60"
                      />
                    ))}
                  </div>
                  <div className="hidden min-w-0 gap-0.5 md:grid">
                    {events.slice(0, MAX_IN_CELL).map((e) => (
                      <EventChip key={e.id} event={e} projects={projects} compact />
                    ))}
                    {tasks.slice(0, Math.max(0, MAX_IN_CELL - events.length)).map((t) => (
                      <TaskChip
                        key={`${t.task.id}${t.due}`}
                        placed={t}
                        projects={projects}
                        compact
                      />
                    ))}
                    {ahead
                      .slice(0, Math.max(0, MAX_IN_CELL - events.length - tasks.length))
                      .map((a) => (
                        <AheadChip key={a.seriesId} item={a} projects={projects} compact />
                      ))}
                    {done
                      .slice(
                        0,
                        Math.max(0, MAX_IN_CELL - events.length - tasks.length - ahead.length),
                      )
                      .map((t) => (
                        <DoneChip key={t.id} task={t} compact />
                      ))}
                    {items > MAX_IN_CELL && (
                      <span className="px-1 text-[11px] font-semibold text-muted-foreground">
                        +{items - MAX_IN_CELL} more
                      </span>
                    )}
                  </div>
                  <div className="mt-auto hidden md:block">
                    <DayExtras day={data?.days[d]} commitmentTitles={titles} />
                  </div>
                </DropDay>
              );
            })}
          </div>
        ))}
      </div>
      <div className="md:hidden">
        <DayList
          day={pick}
          today={today}
          placed={placed}
          data={data}
          projects={projects}
          titles={titles}
        />
      </div>
    </div>
  );
}

/** One day's events and tasks as a list (the phone's month view, and each day of the week view). */
function DayList({
  day,
  today,
  placed,
  data,
  projects,
  titles,
  heading = true,
}: {
  day: string;
  today: string;
  placed: Placed;
  data: CalendarData | undefined;
  projects: ProjectsById;
  titles: Map<string, string>;
  heading?: boolean;
}) {
  const events = placed.events.get(day) ?? [];
  const tasks = placed.tasks.get(day) ?? [];
  const done = placed.done.get(day) ?? [];
  const ahead = placed.ahead.get(day) ?? [];
  const empty = !events.length && !tasks.length && !done.length && !ahead.length;
  return (
    <section className="grid gap-1.5" aria-label={weekdayLong.format(noon(day))}>
      {heading && (
        <h3 className="flex items-center justify-between gap-2 text-sm font-bold">
          <span className={cn(day === today && 'text-primary')}>
            {day === today ? 'Today · ' : ''}
            {weekdayLong.format(noon(day))}
          </span>
          <Button size="sm" variant="ghost" className="h-7" onClick={() => newEvent({ date: day })}>
            <Plus />
            Event
          </Button>
        </h3>
      )}
      {events.map((e) => (
        <EventChip key={e.id} event={e} projects={projects} />
      ))}
      {tasks.map((t) => (
        <TaskChip key={`${t.task.id}${t.due}`} placed={t} projects={projects} />
      ))}
      {ahead.map((a) => (
        <AheadChip key={a.seriesId} item={a} projects={projects} />
      ))}
      {done.map((t) => (
        <DoneChip key={t.id} task={t} />
      ))}
      {empty && heading && <p className="text-xs text-muted-foreground">Nothing on this day.</p>}
      <DayExtras day={data?.days[day]} commitmentTitles={titles} />
    </section>
  );
}

function WeekView({
  days,
  today,
  placed,
  data,
  projects,
  titles,
}: {
  days: string[];
  today: string;
  placed: Placed;
  data: CalendarData | undefined;
  projects: ProjectsById;
  titles: Map<string, string>;
}) {
  return (
    <div className="grid gap-2 lg:grid-cols-7 lg:gap-0 lg:overflow-hidden lg:rounded-2xl lg:border-2">
      {days.map((d) => {
        const load = loadOf(placed.tasks.get(d) ?? [], placed.events.get(d) ?? []);
        const past = daysBetween(today, d) < 0;
        return (
          <DropDay
            key={d}
            day={d}
            className={cn(
              'flex min-h-24 flex-col gap-2 rounded-2xl border-2 p-2 lg:min-h-96 lg:rounded-none lg:border-0 lg:border-r lg:last:border-r-0',
              past && 'bg-muted/30',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div
                  className={cn(
                    'text-[11px] font-bold tracking-wide text-muted-foreground uppercase',
                    d === today && 'text-primary',
                  )}
                >
                  {weekdayShort.format(noon(d))}
                </div>
                <div
                  className={cn(
                    'font-display text-lg leading-6 font-semibold whitespace-nowrap',
                    d === today && 'text-primary',
                  )}
                >
                  {dayShort.format(noon(d))}
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="size-7 text-muted-foreground"
                aria-label={`New event on ${weekdayLong.format(noon(d))}`}
                onClick={() => newEvent({ date: d })}
              >
                <Plus />
              </Button>
            </div>
            {!past && <LoadMeter load={load} />}
            <DayList
              day={d}
              today={today}
              placed={placed}
              data={data}
              projects={projects}
              titles={titles}
              heading={false}
            />
          </DropDay>
        );
      })}
    </div>
  );
}
