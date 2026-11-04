// A day picker: a button showing the day the way the rest of the app does ("Tomorrow", "Nov 12"),
// opening quick picks and a calendar. Replaces native date inputs, whose look and language follow
// the browser's locale instead of the app's English UI (D7).

import { addDays, startOfWeek } from '@streaktron/shared/time';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatDayShort } from '@/lib/days';
import { meQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';

/** `YYYY-MM-DD` ↔ a local Date at noon (the calendar works in local dates). */
const toDate = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y!, m! - 1, d!, 12);
};
const toDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function DayField({
  id,
  value,
  onChange,
  placeholder = 'No date',
  className,
  outlined,
  'aria-label': ariaLabel,
}: {
  id?: string;
  value: string | null;
  onChange: (day: string | null) => void;
  placeholder?: string;
  className?: string;
  /** Inside forms: looks like the other inputs. */
  outlined?: boolean;
  'aria-label'?: string;
}) {
  const { data: me } = useQuery(meQuery);
  const [open, setOpen] = useState(false);
  const today = me?.today ?? toDay(new Date());
  const weekStart = (me?.settings.weekStart ?? 1) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  const nextWeek = startOfWeek(addDays(today, 7), weekStart);

  function pick(day: string | null) {
    setOpen(false);
    if (day !== value) onChange(day);
  }

  const quick: [string, string][] = [
    ['Today', today],
    ['Tomorrow', addDays(today, 1)],
    ['Next week', nextWeek],
  ];

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant={outlined ? 'outline' : 'ghost'}
            size="sm"
            aria-label={ariaLabel}
            className={cn(
              'h-8 justify-start gap-2 px-2 font-normal',
              outlined && 'h-9 flex-1 px-3',
              !value && 'text-muted-foreground',
            )}
          >
            <CalendarDays className="text-muted-foreground" />
            {value ? formatDayShort(value, today) : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <div className="flex gap-1 border-b p-2">
            {quick.map(([label, day]) => (
              <Button
                key={label}
                type="button"
                size="sm"
                variant={value === day ? 'secondary' : 'ghost'}
                className="h-7 flex-1 text-xs"
                onClick={() => pick(day)}
              >
                {label}
              </Button>
            ))}
          </div>
          <DayPicker
            mode="single"
            weekStartsOn={weekStart}
            selected={value ? toDate(value) : undefined}
            defaultMonth={value ? toDate(value) : toDate(today)}
            today={toDate(today)}
            onSelect={(d) => d && pick(toDay(d))}
            showOutsideDays
            className="p-3"
            classNames={{
              months: 'relative',
              month_caption: 'flex h-8 items-center justify-center text-sm font-semibold',
              nav: 'absolute inset-x-0 top-0 flex h-8 items-center justify-between',
              button_previous:
                'grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted',
              button_next:
                'grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted',
              month_grid: 'mt-2 border-collapse',
              weekdays: 'flex',
              weekday: 'w-9 text-center text-[11px] font-medium text-muted-foreground',
              week: 'mt-1 flex',
              day: 'size-9 p-0 text-center text-sm',
              day_button:
                'size-9 rounded-full transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 outline-none',
              today: 'font-bold text-primary',
              selected:
                '[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary',
              outside: 'text-muted-foreground/50',
            }}
            components={{
              Chevron: ({ orientation }) =>
                orientation === 'left' ? (
                  <ChevronLeft className="size-4" />
                ) : (
                  <ChevronRight className="size-4" />
                ),
            }}
          />
        </PopoverContent>
      </Popover>
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground"
          aria-label="Clear date"
          onClick={() => onChange(null)}
        >
          <X />
        </Button>
      )}
    </div>
  );
}
