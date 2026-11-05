// A project's dates (D39): the countdowns under its header (its upcoming events and dated goals,
// nearest first) and the events panel on "Goals & details".

import {
  deadlineOf,
  describeRepeat,
  nextOccurrence,
  timeRange,
} from '@streakatron/shared/calendar';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Hourglass, Plus, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOpenSheet } from '@/hooks/use-open-task';
import { formatTentative, goalDue, untilText } from '@/lib/days';
import { projectEventsQuery, type CalendarEvent, type Goal } from '@/lib/queries';
import { newEvent } from '@/lib/ui-store';
import { cn } from '@/lib/utils';

/** When an event comes next: its next day, its month, or null (TBD); `over` once it's past. */
function upcoming(e: CalendarEvent, today: string) {
  if (e.precision === 'day' && e.date) {
    const next = nextOccurrence(e.date, e.repeat, today);
    return { at: next, over: !next };
  }
  if (e.precision === 'month' && e.date)
    return { at: e.date, over: deadlineOf(e.date, 'month')! < today };
  return { at: null, over: false };
}

const MAX = 4;

/** The nearest dates of a project, as small countdowns; nothing when it has none. */
export function ProjectCountdowns({
  projectId,
  goals,
  today,
}: {
  projectId: string;
  goals: Goal[];
  today: string;
}) {
  const open = useOpenSheet();
  const { data: events = [] } = useQuery(projectEventsQuery(projectId));
  const items = [
    ...events
      .map((e) => ({ e, ...upcoming(e, today) }))
      // Repeating events are a schedule, not a countdown: the events panel lists them.
      .filter((x) => !x.over && !x.e.repeat)
      .map(({ e, at }) => ({
        kind: 'event' as const,
        id: e.id,
        title: e.title,
        sort: at ?? '9999',
        when:
          e.precision === 'day' && at
            ? untilText(at, 'day', today)
            : e.precision === 'month'
              ? `${formatTentative(e.date, 'month', today)} · ${untilText(e.date, 'month', today).toLowerCase()}`
              : 'Date TBD',
      })),
    ...goals
      .filter((g) => g.status === 'open' && g.dueDate)
      .map((g) => ({
        kind: 'goal' as const,
        id: g.id,
        title: g.title,
        sort: g.dueDate!,
        when: goalDue(g, today)!.text,
        late: goalDue(g, today)!.late,
      })),
  ]
    .sort((a, b) => a.sort.localeCompare(b.sort))
    .slice(0, MAX);
  if (!items.length) return null;
  return (
    <section aria-label="Coming up" className="flex flex-wrap gap-2">
      {items.map((i) => {
        const Icon = i.kind === 'event' ? CalendarDays : Target;
        return (
          <button
            key={i.id}
            type="button"
            onClick={() => open(i.kind, i.id)}
            className="flex max-w-full items-center gap-2 rounded-full border-2 bg-card px-3 py-1 text-sm transition-colors hover:border-input"
          >
            <Icon className="size-3.5 shrink-0 text-ember" aria-hidden />
            <span className="truncate font-semibold">{i.title}</span>
            <span
              className={cn(
                'shrink-0 text-xs text-muted-foreground',
                'late' in i && i.late && 'text-destructive',
              )}
            >
              {i.when}
            </span>
          </button>
        );
      })}
    </section>
  );
}

/** The project's events (Goals & details): every one, with when and how it repeats. */
export function EventsPanel({ projectId, today }: { projectId: string; today: string }) {
  const open = useOpenSheet();
  const { data: events = [] } = useQuery(projectEventsQuery(projectId));
  return (
    <section className="space-y-3" aria-label="Events">
      <div className="flex items-center justify-between">
        <h2 className="text-xl">Events</h2>
        <Button variant="ghost" size="sm" onClick={() => newEvent({ projectId })}>
          <Plus />
          Event
        </Button>
      </div>
      {events.length === 0 ? (
        <button
          onClick={() => newEvent({ projectId })}
          className="w-full rounded-2xl border-2 border-dashed px-4 py-6 text-left text-sm text-muted-foreground hover:bg-muted/40"
        >
          Add dates that matter for this project. They count down on Today.
        </button>
      ) : (
        <div className="grid gap-1 rounded-2xl border-2 bg-card p-2 shadow-ledge">
          {events.map((e) => {
            const { at, over } = upcoming(e, today);
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => open('event', e.id)}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-muted/60',
                  over && 'text-muted-foreground',
                )}
              >
                <CalendarDays className="size-4 shrink-0 text-ember" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate font-semibold', over && 'line-through')}>
                    {e.title}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {e.repeat && e.date
                      ? `${describeRepeat(e.repeat, e.date)}${e.startTime ? ` · ${timeRange(e.startTime, e.durationMinutes)}` : ''}`
                      : `${formatTentative(e.date, e.precision, today)}${e.startTime ? ` · ${timeRange(e.startTime, e.durationMinutes)}` : ''}`}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  {e.spotlightedAt && !over && (
                    <Hourglass className="size-3" aria-label="Counting down on Today" />
                  )}
                  {over
                    ? 'Over'
                    : untilText(e.precision === 'day' ? at : e.date, e.precision, today)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
