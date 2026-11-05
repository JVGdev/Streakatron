// The new-event dialog (D39), mounted once in the shell and opened through ui-store from the
// calendar, a project page or the palette. It starts on the common case — a title and a day, all
// day — and keeps repeat, reminder and project behind "More options" (D32: defaults first).

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useOpenSheet } from '@/hooks/use-open-task';
import { useEventActions } from '@/lib/actions';
import { checkAfterReminder } from '@/lib/push';
import { meQuery, projectsQuery } from '@/lib/queries';
import { setUi, useUi } from '@/lib/ui-store';
import { cn } from '@/lib/utils';
import {
  EventProjectField,
  EventTimeField,
  RepeatField,
  TentativeDateField,
  type EventShape,
} from './event-fields';
import { EventReminderField } from './reminder-field';

export function EventDialog() {
  const { eventDialog: d } = useUi();
  const close = () => setUi({ eventDialog: null });
  return (
    <Dialog open={!!d} onOpenChange={(o) => !o && close()}>
      {d && (
        <EventForm
          key={`${d.date}-${d.projectId}`}
          date={d.date}
          projectId={d.projectId ?? null}
          onDone={close}
        />
      )}
    </Dialog>
  );
}

function EventForm({
  date,
  projectId: startProject,
  onDone,
}: {
  date?: string;
  projectId: string | null;
  onDone: () => void;
}) {
  const actions = useEventActions();
  const qc = useQueryClient();
  const open = useOpenSheet();
  const { data: me } = useQuery(meQuery);
  const { data: projects = [] } = useQuery(projectsQuery);
  const today = me?.today ?? new Date().toISOString().slice(0, 10);
  const [title, setTitle] = useState('');
  const [shape, setShape] = useState<EventShape>({
    date: date ?? today,
    precision: 'day',
    startTime: null,
    durationMinutes: null,
    repeat: null,
    reminderMinutes: null,
  });
  const [projectId, setProjectId] = useState<string | null>(startProject);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const patch = (p: Partial<EventShape>) => setShape((s) => ({ ...s, ...p }));
  const isDay = shape.precision === 'day' && !!shape.date;
  const project = projects.find((p) => p.id === projectId);
  const valid = !!title.trim() && (shape.precision === 'tbd' || !!shape.date);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    const created = await actions.create({ title, projectId, ...shape });
    setBusy(false);
    if (!created) return;
    onDone();
    if (shape.reminderMinutes !== null) void checkAfterReminder(qc);
    toast.success(`Added “${created.title}”`, {
      action: { label: 'Open', onClick: () => open('event', created.id) },
    });
  }

  return (
    <DialogContent className="sm:max-w-md">
      <form onSubmit={submit} className="grid gap-4">
        <DialogHeader>
          <DialogTitle>New event</DialogTitle>
          <DialogDescription>
            A date to keep: an exam, a trip, a class every week.
            {project && !more && <> In “{project.title}”.</>}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="event-title">Title</Label>
          <Input
            id="event-title"
            autoFocus
            maxLength={200}
            placeholder="JLPT N5"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="grid gap-1.5">
          <Label>When</Label>
          <TentativeDateField
            date={shape.date}
            precision={shape.precision}
            onChange={(v) =>
              patch(
                v.precision === 'day'
                  ? v
                  : {
                      ...v,
                      startTime: null,
                      durationMinutes: null,
                      repeat: null,
                      reminderMinutes: null,
                    },
              )
            }
          />
        </div>

        {isDay && (
          <EventTimeField
            startTime={shape.startTime}
            durationMinutes={shape.durationMinutes}
            onChange={(v) =>
              patch({
                ...v,
                // "15 min before" means nothing for an all-day event; start over.
                reminderMinutes: !v.startTime !== !shape.startTime ? null : shape.reminderMinutes,
              })
            }
          />
        )}

        <button
          type="button"
          className="flex items-center gap-1 justify-self-start text-sm font-medium text-muted-foreground hover:text-foreground"
          aria-expanded={more}
          onClick={() => setMore(!more)}
        >
          <ChevronDown className={cn('size-4 transition-transform', more && 'rotate-180')} />
          More options
        </button>

        {more && (
          <div className="grid gap-4">
            {isDay && (
              <div className="grid gap-1.5">
                <Label>Repeat</Label>
                <RepeatField
                  date={shape.date!}
                  value={shape.repeat}
                  weekStart={me?.settings.weekStart ?? 1}
                  onChange={(repeat) => patch({ repeat })}
                />
              </div>
            )}
            {isDay && (
              <div className="grid gap-1.5">
                <Label htmlFor="event-reminder">Reminder</Label>
                <EventReminderField
                  id="event-reminder"
                  value={shape.reminderMinutes}
                  allDay={!shape.startTime}
                  onChange={(reminderMinutes) => patch({ reminderMinutes })}
                />
              </div>
            )}
            <div className="grid gap-1.5">
              <Label>Project (optional)</Label>
              <EventProjectField value={projectId} onChange={setProjectId} />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !valid}>
            Add event
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
