// The contribution heatmap (plan.md §4.7): a year of days, darker with more focus. One hue (ember,
// `--heat-1…4`, validated as an ordinal ramp in light and dark); every cell has a tooltip on hover
// and on keyboard focus (arrow keys move it), and the same numbers are in the table view below.

import { addDays, type DateString } from '@streakatron/shared/time';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDayLong } from '@/lib/days';
import { HEAT_LEVEL_LABEL, heatLevel, heatWeeks, type HeatDay } from '@/lib/heatmap';
import { cn } from '@/lib/utils';

const CELL = 12;
const GAP = 3;
const STEP = CELL + GAP;
const LEFT = 30;
const TOP = 18;

const FILL = [
  'bg-muted outline outline-1 -outline-offset-1 outline-border',
  'bg-[var(--heat-1)]',
  'bg-[var(--heat-2)]',
  'bg-[var(--heat-3)]',
  'bg-[var(--heat-4)]',
] as const;

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const month = new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' });

export function Heatmap({
  from,
  to,
  days,
  weekStart,
}: {
  from: DateString;
  to: DateString;
  days: HeatDay[];
  weekStart: number;
}) {
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const weeks = useMemo(() => heatWeeks(from, to, weekStart), [from, to, weekStart]);
  const [active, setActive] = useState<DateString | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);

  // Today is at the right end: start scrolled there on narrow screens.
  useEffect(() => {
    const el = scroller.current;
    if (el) {
      el.scrollLeft = el.scrollWidth;
      setScrollLeft(el.scrollLeft);
    }
  }, []);

  const position = (date: DateString) => {
    for (const [w, week] of weeks.entries()) {
      const d = week.indexOf(date);
      if (d >= 0) return { w, d };
    }
    return null;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const moves: Record<string, number> = {
      ArrowLeft: -7,
      ArrowRight: 7,
      ArrowUp: -1,
      ArrowDown: 1,
    };
    if (e.key === 'Escape') return setActive(null);
    const by = moves[e.key];
    if (by === undefined) return;
    e.preventDefault();
    const next = active ? addDays(active, by) : to;
    if (next >= from && next <= to) setActive(next);
  };

  const months = weeks.flatMap((week, w) => {
    const first =
      week.find((d) => d !== null && d.endsWith('-01')) ??
      (w === 0 ? week.find(Boolean) : undefined);
    return first ? [{ w, label: month.format(new Date(`${first}T12:00:00Z`)) }] : [];
  });
  const at = active ? position(active) : null;
  const activeDay = active ? byDate.get(active) : undefined;

  return (
    // The tooltip sits outside the scroller, so it can overlap the card instead of being clipped.
    <div className="relative">
      <div
        ref={scroller}
        className="overflow-x-auto pb-2"
        onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
      >
        <div
          className="relative"
          style={{ width: LEFT + weeks.length * STEP, height: TOP + 7 * STEP }}
          onPointerLeave={() => setActive(null)}
        >
          {months.map(({ w, label }) => (
            <span
              key={w}
              className="absolute text-[11px] font-bold text-muted-foreground"
              style={{ left: LEFT + w * STEP, top: 0 }}
            >
              {label}
            </span>
          ))}
          {[1, 3, 5].map((row) => (
            <span
              key={row}
              className="absolute text-[11px] font-bold text-muted-foreground"
              style={{ left: 0, top: TOP + row * STEP - 1 }}
            >
              {WEEKDAY[(weekStart + row) % 7]}
            </span>
          ))}
          <div
            role="grid"
            tabIndex={0}
            aria-label="Active days over the last year. Arrow keys move between days."
            aria-activedescendant={active ? `heat-${active}` : undefined}
            className="absolute rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            style={{
              left: LEFT - 2,
              top: TOP - 2,
              width: weeks.length * STEP + 2,
              height: 7 * STEP + 2,
            }}
            onKeyDown={onKeyDown}
            onFocus={() => !active && setActive(to)}
            onBlur={() => setActive(null)}
          >
            {weeks.map((week, w) =>
              week.map((date, d) =>
                date ? (
                  <span
                    key={date}
                    id={`heat-${date}`}
                    role="gridcell"
                    aria-label={`${formatDayLong(date)}: ${HEAT_LEVEL_LABEL[heatLevel(byDate.get(date))]}`}
                    className={cn(
                      'absolute rounded-[3px] transition-transform',
                      FILL[heatLevel(byDate.get(date))],
                      active === date && 'z-10 scale-125 ring-2 ring-foreground',
                    )}
                    style={{ left: 2 + w * STEP, top: 2 + d * STEP, width: CELL, height: CELL }}
                    onPointerEnter={() => setActive(date)}
                  />
                ) : null,
              ),
            )}
          </div>
        </div>
      </div>
      {active && at && (
        <Tip
          date={active}
          day={activeDay}
          left={LEFT + at.w * STEP + CELL / 2 - scrollLeft}
          top={TOP + at.d * STEP}
          flip={at.w > weeks.length - 10}
          below={at.d < 3}
        />
      )}
    </div>
  );
}

function Tip({
  date,
  day,
  left,
  top,
  flip,
  below,
}: {
  date: DateString;
  day: HeatDay | undefined;
  left: number;
  top: number;
  flip: boolean;
  /** Under the cell (top rows: above would leave the scroll area). */
  below: boolean;
}) {
  return (
    <div
      role="status"
      className={cn(
        'pointer-events-none absolute z-20 w-max max-w-56 rounded-xl border-2 bg-popover px-3 py-2 text-sm text-popover-foreground shadow-ledge',
        flip && '-translate-x-full',
        !below && '-translate-y-full',
      )}
      style={{ left: flip ? left + 8 : left - 8, top: below ? top + CELL + 6 : top - 6 }}
    >
      {day && (day.active || day.xp > 0) ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          <dd className="font-display font-semibold tabular-nums">{day.minutes} min</dd>
          <dt className="text-muted-foreground">focus</dt>
          <dd className="font-display font-semibold tabular-nums">{day.tasks}</dd>
          <dt className="text-muted-foreground">{day.tasks === 1 ? 'task' : 'tasks'}</dt>
          <dd className="font-display font-semibold tabular-nums">{day.xp}</dd>
          <dt className="text-muted-foreground">XP</dt>
        </dl>
      ) : (
        <p className="text-muted-foreground">Nothing counted</p>
      )}
      <p className="mt-1 text-xs font-bold text-muted-foreground">{formatDayLong(date)}</p>
    </div>
  );
}

/** Less → more: the five fills, named. */
export function HeatLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span className="font-bold">Less</span>
      {FILL.map((fill, i) => (
        <span key={i} className="flex items-center gap-1">
          <span className={cn('inline-block size-3 rounded-[3px]', fill)} aria-hidden />
          {HEAT_LEVEL_LABEL[i]}
        </span>
      ))}
      <span className="font-bold">More</span>
    </div>
  );
}
