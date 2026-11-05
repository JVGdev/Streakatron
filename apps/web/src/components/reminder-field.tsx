// The one reminder control (D32, D38): a button that says when it reminds ("10:00–22:00, every
// 3 h", "Tomorrow at 15:30", "No reminder") and opens the choices. Commitments remind on their
// days (off / once / repeat until done); tasks at a day and time. Events (4d) will use it too.

import {
  DEFAULT_REPEAT,
  describeReminder,
  formatEvery,
  REPEAT_CHOICES,
  reminderProblem,
  type CommitmentReminder,
} from '@streakatron/shared/reminders';
import { addDays, wallClock, zonedTime } from '@streakatron/shared/time';
import { useQuery } from '@tanstack/react-query';
import { Bell, BellOff, X } from 'lucide-react';
import { useState, type ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatRemindAt } from '@/lib/days';
import { useNotifyOnReminder, usePush } from '@/lib/push';
import { meQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { Choice } from './commitment-form';
import { DayField } from './day-field';

/** The button both share. */
function Trigger({
  on,
  text,
  outlined,
  ...rest
}: ComponentProps<typeof Button> & { on: boolean; text: string; outlined?: boolean }) {
  const Icon = on ? Bell : BellOff;
  return (
    <Button
      type="button"
      variant={outlined ? 'outline' : 'ghost'}
      size="sm"
      className={cn(
        'h-8 min-w-0 justify-start gap-2 px-2 font-normal',
        outlined && 'h-9 w-full px-3',
        !on && 'text-muted-foreground',
      )}
      {...rest}
    >
      <Icon className="text-muted-foreground" />
      <span className="truncate">{text}</span>
    </Button>
  );
}

function TimeInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        type="time"
        required
        className="h-8 w-full min-w-0"
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
      />
    </div>
  );
}

// --- Commitments -----------------------------------------------------------------------------

type Mode = 'off' | 'once' | 'repeat';
type Repeat = Extract<CommitmentReminder, { kind: 'repeat' }>;

const MODES: { value: Mode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'once', label: 'Once' },
  { value: 'repeat', label: 'Until done' },
];

/**
 * A commitment's reminder, inside its dialog: `onChange` gets each valid choice (null: off).
 * Reminders come only on the commitment's days, and stop once it's met.
 */
export function CommitmentReminderField({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: CommitmentReminder | null;
  onChange: (r: CommitmentReminder | null) => void;
}) {
  const [open, setOpen] = useState(false);
  // Drafts for both shapes, so switching back and forth keeps what was typed.
  const [once, setOnce] = useState(value?.kind === 'once' ? value.at : '10:00');
  const [repeat, setRepeat] = useState<Repeat>(
    value?.kind === 'repeat' ? value : (DEFAULT_REPEAT as Repeat),
  );
  const mode: Mode = value?.kind ?? 'off';
  const problem = mode === 'repeat' ? reminderProblem(repeat) : null;

  const notifyHere = useNotifyOnReminder();
  const pick = (m: Mode) => {
    if (m !== 'off' && mode === 'off') notifyHere();
    if (m === 'off') onChange(null);
    if (m === 'once') onChange({ kind: 'once', at: once });
    if (m === 'repeat') onChange(reminderProblem(repeat) ? DEFAULT_REPEAT : repeat);
  };
  const editRepeat = (patch: Partial<typeof repeat>) => {
    const next = { ...repeat, ...patch };
    setRepeat(next);
    if (!reminderProblem(next)) onChange(next);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Trigger
          id={id}
          outlined
          on={!!value}
          text={describeReminder(value)}
          aria-label="Reminder"
        />
      </PopoverTrigger>
      <PopoverContent align="start" className="grid w-[min(20rem,calc(100vw-2rem))] gap-3">
        <Choice label="Remind me" options={MODES} value={mode} onChange={pick} />
        {mode === 'once' && (
          <TimeInput
            id="reminder-at"
            label="At"
            value={once}
            onChange={(at) => {
              setOnce(at);
              onChange({ kind: 'once', at });
            }}
          />
        )}
        {mode === 'repeat' && (
          <div className="grid gap-2">
            <div className="grid grid-cols-2 gap-2">
              <TimeInput
                id="reminder-from"
                label="From"
                value={repeat.from}
                onChange={(from) => editRepeat({ from })}
              />
              <TimeInput
                id="reminder-until"
                label="Until"
                value={repeat.until}
                onChange={(until) => editRepeat({ until })}
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs font-normal text-muted-foreground">Every</Label>
              <Select
                value={String(repeat.everyMinutes)}
                onValueChange={(v) => editRepeat({ everyMinutes: Number(v) })}
              >
                <SelectTrigger size="sm" className="w-full" aria-label="Every">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[...new Set([...REPEAT_CHOICES, repeat.everyMinutes])]
                    .sort((a, b) => a - b)
                    .map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        {formatEvery(m)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        {problem ? (
          <p className="text-xs text-destructive">{problem}</p>
        ) : (
          mode !== 'off' && (
            <p className="text-xs text-muted-foreground">
              Only on its days, and none once it’s met.
            </p>
          )
        )}
        <DeviceHint fresh={mode === 'off'} />
      </PopoverContent>
    </Popover>
  );
}

// --- Tasks -----------------------------------------------------------------------------------

/** A task's reminder at a day and time (D32): set, change or clear; saved right away. */
export function TaskReminderField({
  id,
  value,
  suggestedDay,
  onChange,
}: {
  id?: string;
  /** The instant, ISO. */
  value: string | null;
  /** Where the day starts when there's none yet (the task's scheduled or due day). */
  suggestedDay: string | null;
  onChange: (remindAt: string | null) => void;
}) {
  const { data: me } = useQuery(meQuery);
  const notifyHere = useNotifyOnReminder();
  const [open, setOpen] = useState(false);
  const tz = me?.settings.timezone ?? 'UTC';
  const today = me?.today ?? new Date().toISOString().slice(0, 10);
  const current = value ? wallClock(new Date(value), tz) : null;
  const [day, setDay] = useState<string>(current?.date ?? suggestedDay ?? today);
  const [time, setTime] = useState(
    current
      ? `${String(current.hour).padStart(2, '0')}:${String(current.minute).padStart(2, '0')}`
      : '09:00',
  );
  const at = zonedTime(day, Number(time.slice(0, 2)), tz, Number(time.slice(3)));
  // "Now" as of opening the picker (render stays pure).
  const [openedAt, setOpenedAt] = useState(0);
  const past = at.getTime() <= openedAt;

  return (
    <div className="flex min-w-0 items-center gap-1">
      <Popover
        open={open}
        onOpenChange={(o) => {
          if (o) setOpenedAt(Date.now());
          if (o && current) {
            setDay(current.date);
            setTime(
              `${String(current.hour).padStart(2, '0')}:${String(current.minute).padStart(2, '0')}`,
            );
          } else if (o) {
            // A new one: 09:00 on its day; when that has passed, the next full hour (or tomorrow).
            const start = suggestedDay && suggestedDay > today ? suggestedDay : today;
            const nine = zonedTime(start, 9, tz);
            if (nine.getTime() > Date.now()) {
              setDay(start);
              setTime('09:00');
            } else {
              const w = wallClock(new Date(Date.now() + 3_600_000), tz);
              const late = w.date !== wallClock(new Date(), tz).date;
              setDay(late ? addDays(today, 1) : w.date);
              setTime(late ? '09:00' : `${String(w.hour).padStart(2, '0')}:00`);
            }
          }
          setOpen(o);
        }}
      >
        <PopoverTrigger asChild>
          <Trigger
            id={id}
            on={!!value}
            text={value ? formatRemindAt(value, tz, today) : 'No reminder'}
          />
        </PopoverTrigger>
        <PopoverContent align="start" className="grid w-[min(18rem,calc(100vw-2rem))] gap-3">
          <div className="grid grid-cols-[minmax(0,1fr)_7rem] items-end gap-2">
            <div className="grid gap-1">
              <span className="text-xs text-muted-foreground">Day</span>
              <DayField
                outlined
                clearable={false}
                value={day}
                onChange={(d) => d && setDay(d)}
                aria-label="Day"
              />
            </div>
            <TimeInput id="task-remind-time" label="Time" value={time} onChange={setTime} />
          </div>
          {past && <p className="text-xs text-destructive">That time has passed.</p>}
          <DeviceHint fresh={!value} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={past}
              onClick={() => {
                setOpen(false);
                if (!value) notifyHere();
                onChange(at.toISOString());
              }}
            >
              {value ? 'Change' : 'Remind me'}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground"
          aria-label="Remove the reminder"
          onClick={() => onChange(null)}
        >
          <X />
        </Button>
      )}
    </div>
  );
}

/**
 * Whether this device will show it, with a one-click fix when it won't. Setting a reminder turns
 * notifications on by itself; this covers a device turned off, blocked, or an iPhone in Safari.
 */
function DeviceHint({ fresh }: { fresh: boolean }) {
  const { state, turnOn } = usePush();
  // Setting a new one turns them on by itself: just say so.
  if (state === 'off' && fresh) {
    return (
      <p className="text-xs text-muted-foreground">
        Setting it also turns on notifications for this device.
      </p>
    );
  }
  if (state === 'on' || state === 'loading') return null;
  if (state === 'off' || state === 'turned-off') {
    return (
      <p className="flex items-center justify-between gap-2 rounded-md bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
        Notifications are off on this device.
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7"
          onClick={() => void turnOn()}
        >
          Turn on
        </Button>
      </p>
    );
  }
  return (
    <p className="rounded-md bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
      {state === 'blocked'
        ? 'This browser blocks notifications for Streakatron. Allow them in its site settings.'
        : state === 'install'
          ? 'To get them on this iPhone, add Streakatron to the Home Screen (Share → Add to Home Screen) and open it from there.'
          : 'This browser can’t show them here. Your other devices still get them.'}
    </p>
  );
}
