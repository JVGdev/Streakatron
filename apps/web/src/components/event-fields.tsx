// The pieces of an event the dialog and the sheet share (D39): when (a day, a month, or to be
// decided), the time (all day, or a start and a length), the repeat and the project. Each gets a
// value and reports a patch, so the dialog keeps a draft and the sheet saves at once.

import {
  DEFAULT_EVENT_DURATION,
  describeRepeat,
  monthStart,
  type DatePrecision,
  type Repeat,
  type RepeatUnit,
} from '@streakatron/shared/calendar';
import { weekdayOf } from '@streakatron/shared/time';
import { useQuery } from '@tanstack/react-query';
import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { useQuickCreate } from '@/hooks/use-quick-create';
import { formatMinutes, formatMonth } from '@/lib/days';
import { STATUS_LABEL } from '@/lib/look';
import { meQuery, projectsQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { ComboPicker } from './combo-picker';
import { Choice } from './commitment-form';
import { DayField } from './day-field';
import { EntityIcon } from './entity-icon';

export interface EventShape {
  date: string | null;
  precision: DatePrecision;
  startTime: string | null;
  durationMinutes: number | null;
  repeat: Repeat | null;
  reminderMinutes: number | null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A month picker: "~March 2027", a year with its twelve months. */
export function MonthField({
  value,
  onChange,
  'aria-label': ariaLabel,
}: {
  value: string | null;
  onChange: (monthStart: string) => void;
  'aria-label'?: string;
}) {
  const { data: me } = useQuery(meQuery);
  const today = me?.today ?? new Date().toISOString().slice(0, 10);
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(Number((value ?? today).slice(0, 4)));
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        if (o) setYear(Number((value ?? today).slice(0, 4)));
        setOpen(o);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={ariaLabel}
          className={cn(
            'h-9 w-full justify-start gap-2 px-3 font-normal',
            !value && 'text-muted-foreground',
          )}
        >
          <CalendarRange className="text-muted-foreground" />
          {value ? formatMonth(value, today) : 'Pick a month'}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3">
        <div className="mb-2 flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Previous year"
            onClick={() => setYear((y) => y - 1)}
          >
            <ChevronLeft />
          </Button>
          <span className="text-sm font-semibold">{year}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Next year"
            onClick={() => setYear((y) => y + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {MONTHS.map((m, i) => {
            const day = `${year}-${String(i + 1).padStart(2, '0')}-01`;
            const picked = value && monthStart(value) === day;
            const past = day < monthStart(today);
            return (
              <Button
                key={m}
                type="button"
                size="sm"
                variant={picked ? 'default' : 'ghost'}
                className={cn('h-8', past && !picked && 'text-muted-foreground/60')}
                onClick={() => {
                  setOpen(false);
                  onChange(day);
                }}
              >
                {m}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

const PRECISIONS: { value: DatePrecision; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'month', label: 'Month' },
  { value: 'tbd', label: 'Not yet' },
];

/**
 * A date that may be tentative (D32): a day, a month ("~March 2027") or not decided yet.
 * Goals leave out "Not yet" (no deadline is the same thing for them).
 */
export function TentativeDateField({
  date,
  precision,
  onChange,
  withTbd = true,
  dayClearable = false,
}: {
  date: string | null;
  precision: DatePrecision;
  onChange: (v: { date: string | null; precision: DatePrecision }) => void;
  withTbd?: boolean;
  /** Goals: "No date" is allowed. */
  dayClearable?: boolean;
}) {
  const { data: me } = useQuery(meQuery);
  const today = me?.today ?? new Date().toISOString().slice(0, 10);
  // What the other mode had, so switching back and forth keeps the date.
  const [last, setLast] = useState(date);
  const pick = (p: DatePrecision) => {
    const keep = date ?? last;
    if (p === 'tbd') onChange({ date: null, precision: 'tbd' });
    else if (p === 'month') onChange({ date: monthStart(keep ?? today), precision: 'month' });
    else onChange({ date: dayClearable ? keep : (keep ?? today), precision: 'day' });
  };
  return (
    <div className="grid gap-2">
      <Choice
        label="How exact"
        hideLabel
        options={withTbd ? PRECISIONS : PRECISIONS.slice(0, 2)}
        value={precision}
        onChange={pick}
      />
      {precision === 'day' && (
        <DayField
          outlined
          aria-label="Day"
          clearable={dayClearable}
          value={date}
          onChange={(d) => {
            setLast(d);
            onChange({ date: d ?? (dayClearable ? null : today), precision: 'day' });
          }}
        />
      )}
      {precision === 'month' && (
        <MonthField
          aria-label="Month"
          value={date}
          onChange={(d) => {
            setLast(d);
            onChange({ date: d, precision: 'month' });
          }}
        />
      )}
      {precision === 'tbd' && (
        <p className="px-1 text-xs text-muted-foreground">
          It shows as “Date TBD” until you set one.
        </p>
      )}
    </div>
  );
}

const LENGTHS = [15, 30, 45, 60, 90, 120, 180, 240];

/** All day, or a start time and a length. */
export function EventTimeField({
  startTime,
  durationMinutes,
  onChange,
}: {
  startTime: string | null;
  durationMinutes: number | null;
  onChange: (v: { startTime: string | null; durationMinutes: number | null }) => void;
}) {
  const allDay = !startTime;
  return (
    <div className="grid gap-2">
      <Label className="flex items-center gap-2 font-normal">
        <Checkbox
          checked={allDay}
          onCheckedChange={(on) =>
            onChange(
              on === true
                ? { startTime: null, durationMinutes: null }
                : { startTime: '09:00', durationMinutes: DEFAULT_EVENT_DURATION },
            )
          }
        />
        All day
      </Label>
      {!allDay && (
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-1">
            <Label htmlFor="event-start" className="text-xs font-normal text-muted-foreground">
              Starts
            </Label>
            <Input
              id="event-start"
              type="time"
              required
              className="h-9"
              value={startTime}
              onChange={(e) =>
                e.target.value && onChange({ startTime: e.target.value, durationMinutes })
              }
            />
          </div>
          <div className="grid gap-1">
            <span className="text-xs text-muted-foreground">Length</span>
            <Select
              value={String(durationMinutes ?? 0)}
              onValueChange={(v) => onChange({ startTime, durationMinutes: Number(v) || null })}
            >
              <SelectTrigger className="h-9 w-full" aria-label="Length">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">No end time</SelectItem>
                {[...new Set([...LENGTHS, ...(durationMinutes ? [durationMinutes] : [])])]
                  .sort((a, b) => a - b)
                  .map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {formatMinutes(m)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}

const UNITS: { value: 'none' | RepeatUnit; label: string }[] = [
  { value: 'none', label: 'Doesn’t repeat' },
  { value: 'day', label: 'Every day' },
  { value: 'week', label: 'Every week' },
  { value: 'month', label: 'Every month' },
  { value: 'year', label: 'Every year' },
];
const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/** Doesn't repeat, or every N days / weeks (on weekdays) / months / years, until a day. */
export function RepeatField({
  date,
  value,
  onChange,
  weekStart = 1,
}: {
  /** The first day: weekly repeats start on its weekday. */
  date: string;
  value: Repeat | null;
  onChange: (r: Repeat | null) => void;
  weekStart?: number;
}) {
  const unit = value?.every ?? 'none';
  const order = Array.from({ length: 7 }, (_, i) => (weekStart + i) % 7);
  const set = (patch: Partial<Repeat>) => value && onChange({ ...value, ...patch });

  return (
    <div className="grid gap-2">
      <Select
        value={unit}
        onValueChange={(u) =>
          onChange(
            u === 'none'
              ? null
              : {
                  every: u as RepeatUnit,
                  interval: value?.interval ?? 1,
                  until: value?.until ?? null,
                  ...(u === 'week'
                    ? { weekdays: value?.weekdays?.length ? value.weekdays : [weekdayOf(date)] }
                    : {}),
                },
          )
        }
      >
        <SelectTrigger className="h-9 w-full" aria-label="Repeat">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {UNITS.map((u) => (
            <SelectItem key={u.value} value={u.value}>
              {u.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value && (
        <>
          {value.every === 'week' && (
            <div className="flex gap-1" role="group" aria-label="On">
              {order.map((d) => {
                const on = value.weekdays?.includes(d) ?? false;
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    aria-label={WEEKDAY_NAMES[d]}
                    title={WEEKDAY_NAMES[d]}
                    onClick={() => {
                      const next = on
                        ? (value.weekdays ?? []).filter((w) => w !== d)
                        : [...(value.weekdays ?? []), d];
                      if (next.length) set({ weekdays: next.sort((a, b) => a - b) });
                    }}
                    className={cn(
                      'grid size-8 place-items-center rounded-full text-xs font-bold transition-colors',
                      on ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {WEEKDAY_LETTERS[d]}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
            <Label htmlFor="repeat-every" className="font-normal text-muted-foreground">
              Every
            </Label>
            <Input
              id="repeat-every"
              type="number"
              min={1}
              max={30}
              className="h-8 w-16"
              value={value.interval}
              onChange={(e) => {
                const n = Math.round(Number(e.target.value));
                if (n >= 1 && n <= 30) set({ interval: n });
              }}
            />
            <span className="text-muted-foreground">
              {value.every}
              {value.interval === 1 ? '' : 's'}
            </span>
            <span className="ml-auto flex items-center gap-1">
              <span className="text-muted-foreground">until</span>
              <DayField
                aria-label="Until"
                placeholder="Forever"
                value={value.until ?? null}
                onChange={(until) => set({ until })}
              />
            </span>
          </div>
          <p className="px-1 text-xs text-muted-foreground">{describeRepeat(value, date)}</p>
        </>
      )}
    </div>
  );
}

const NONE = '__none__';

/** The project an event belongs to (or none), with "New project “typed”". */
export function EventProjectField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (projectId: string | null) => void;
}) {
  const { data: projects = [] } = useQuery(projectsQuery);
  const quick = useQuickCreate();
  return (
    <ComboPicker
      aria-label="Project"
      value={value ?? NONE}
      onChange={(v) => onChange(v === NONE ? null : v)}
      options={[
        { value: NONE, label: 'No project' },
        ...projects
          .filter((p) => p.status !== 'archived' || p.id === value)
          .map((p) => ({
            value: p.id,
            label: p.title,
            icon: <EntityIcon icon={p.icon} color={p.color} size="sm" />,
            hint: p.status === 'active' ? undefined : STATUS_LABEL[p.status],
          })),
      ]}
      create={{ noun: 'project', run: (t) => quick.project(t) }}
    />
  );
}
