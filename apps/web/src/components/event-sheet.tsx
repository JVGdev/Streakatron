// An event's details (D39), in a side sheet opened by the `event` search param from anywhere (the
// calendar, a countdown, a mention chip, the palette, a reminder). Title and description save as
// you type; the date, time, repeat, reminder and project save when changed.

import { nextOccurrence } from '@streakatron/shared/calendar';
import type { RichDoc } from '@streakatron/shared/rich';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CalendarDays, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useOpenSheet } from '@/hooks/use-open-task';
import { useEventActions } from '@/lib/actions';
import { ApiError } from '@/lib/api';
import { useAutosave } from '@/lib/autosave';
import { formatDayLong, formatTentative, untilText } from '@/lib/days';
import { eventQuery, meQuery, projectsQuery, type CalendarEvent } from '@/lib/queries';
import { Backlinks } from './backlinks';
import { EntityIcon } from './entity-icon';
import { EventProjectField, EventTimeField, RepeatField, TentativeDateField } from './event-fields';
import { EventReminderField } from './reminder-field';
import { RichEditor } from './rich-editor';
import { SheetBar, TitleField } from './sheet-parts';
import { TurnInto } from './turn-into';
import { SpotlightToggle } from './spotlight';

export function EventSheet({ eventId }: { eventId: string | undefined }) {
  const open = useOpenSheet();
  const { data, error, isFetchedAfterMount } = useQuery({
    ...eventQuery(eventId ?? ''),
    enabled: !!eventId,
  });

  useEffect(() => {
    if (error instanceof ApiError && error.status === 404) {
      toast.error('That event doesn’t exist anymore.');
      open('event', undefined);
    }
  }, [error, open]);

  return (
    <Sheet open={!!eventId} onOpenChange={(o) => !o && open('event', undefined)}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl"
        aria-describedby={undefined}
      >
        {/* Fresh data only: the editors start from it (see task-sheet.tsx). */}
        {data && data.id === eventId && isFetchedAfterMount ? (
          <EventEditor key={data.id} event={data} />
        ) : (
          <div className="p-6">
            <SheetTitle className="sr-only">Event</SheetTitle>
            <div className="h-6 w-2/3 animate-pulse rounded bg-muted" />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function EventEditor({ event }: { event: CalendarEvent }) {
  const actions = useEventActions();
  const open = useOpenSheet();
  const { data: me } = useQuery(meQuery);
  const { data: projects = [] } = useQuery(projectsQuery);
  const today = me?.today ?? '';
  const project = projects.find((p) => p.id === event.projectId);

  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState<RichDoc | null>(event.description);
  const save = useAutosave(
    { title, description },
    (v) => (v.title.trim() ? actions.save(event, v) : Promise.resolve()),
    { what: 'the event' },
  );
  const close = () => open('event', undefined);
  const update = (patch: Parameters<typeof actions.update>[1]) => void actions.update(event, patch);
  const isDay = event.precision === 'day' && !!event.date;
  const next = isDay ? nextOccurrence(event.date!, event.repeat, today) : event.date;
  const over = isDay && !next;

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
          <Link to="/calendar" className="inline-flex items-center gap-1.5 hover:underline">
            <CalendarDays className="size-3.5" />
            Calendar
          </Link>
        )}
      </SheetBar>

      <div className="grid gap-6 px-4 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          <CalendarDays className="mt-2.5 size-5 shrink-0 text-ember" aria-hidden />
          <SheetTitle className="sr-only">{event.title}</SheetTitle>
          <SheetDescription className="sr-only">Event details</SheetDescription>
          <TitleField value={title} onChange={setTitle} what="event" struck={over} />
          {!over && (
            <SpotlightToggle
              item={{ id: event.id, title }}
              on={!!event.spotlightedAt}
              label="Count down on Today"
            />
          )}
        </div>

        <p className="-mt-3 px-1 text-sm text-muted-foreground">
          {over
            ? 'This is over.'
            : next && event.precision === 'day'
              ? `${event.repeat ? 'Next: ' : ''}${formatDayLong(next)} · ${untilText(next, 'day', today)}`
              : `${formatTentative(event.date, event.precision, today)} · ${untilText(event.date, event.precision, today)}`}
        </p>

        <div className="grid gap-5">
          <div className="grid gap-1.5">
            <Label>{event.repeat ? 'First day' : 'When'}</Label>
            <TentativeDateField
              date={event.date}
              precision={event.precision}
              onChange={(v) => update(v)}
            />
          </div>
          {isDay && (
            <EventTimeField
              startTime={event.startTime}
              durationMinutes={event.durationMinutes}
              onChange={(v) =>
                update({
                  ...v,
                  ...(!v.startTime !== !event.startTime ? { reminderMinutes: null } : {}),
                })
              }
            />
          )}
          {isDay && (
            <div className="grid gap-1.5">
              <Label>Repeat</Label>
              <RepeatField
                date={event.date!}
                value={event.repeat}
                weekStart={me?.settings.weekStart ?? 1}
                onChange={(repeat) => update({ repeat })}
              />
            </div>
          )}
          {isDay && (
            <div className="grid gap-1.5">
              <Label htmlFor="event-sheet-reminder">Reminder</Label>
              <EventReminderField
                id="event-sheet-reminder"
                value={event.reminderMinutes}
                allDay={!event.startTime}
                onChange={(reminderMinutes) => update({ reminderMinutes })}
              />
            </div>
          )}
          <div className="grid gap-1.5">
            <Label>Project</Label>
            <EventProjectField
              value={event.projectId}
              onChange={(projectId) => update({ projectId })}
            />
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label className="text-muted-foreground">Description</Label>
          <RichEditor
            aria-label="Description"
            value={event.description}
            onChange={setDescription}
            selfId={event.id}
          />
        </div>

        <Backlinks id={event.id} />
      </div>

      <div className="mt-auto flex items-center gap-2 border-t px-4 py-3 sm:px-6">
        <span className="flex-1" />
        <TurnInto
          id={event.id}
          beforeOpen={save.flush}
          source={{
            kind: 'event',
            title,
            projectId: event.projectId,
            spotlighted: !!event.spotlightedAt,
            date: event.date,
            precision: event.precision,
            startTime: event.startTime,
            repeat: event.repeat,
            reminder: event.reminderMinutes !== null,
          }}
        />
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={async () => {
            await save.flush();
            close();
            void actions.remove({ id: event.id, title });
          }}
        >
          <Trash2 />
          Delete
        </Button>
      </div>
    </div>
  );
}
