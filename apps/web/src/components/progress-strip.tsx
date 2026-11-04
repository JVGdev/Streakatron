// The progress strip across Today (D25, the "Merged" mockup): daily streak, freezes, level and XP,
// and this week's active days against the target. Everything comes from the server (D17).

import { addDays, eachDay, weekdayOf } from '@streakatron/shared/time';
import { useQuery } from '@tanstack/react-query';
import { Flame, Snowflake } from 'lucide-react';
import type { ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { gameQuery, type GameState } from '@/lib/queries';
import { cn } from '@/lib/utils';

const WEEKDAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_NAME = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function ProgressStrip({ className }: { className?: string }) {
  const { data: game } = useQuery(gameQuery);
  if (!game) return <div className={cn('h-[62px] rounded-[22px] bg-muted', className)} />;
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-[22px] bg-muted p-2.5 shadow-[inset_0_-4px_0_var(--sidebar-border)]',
        className,
      )}
    >
      <div className="flex flex-wrap gap-2.5">
        <StreakPill game={game} />
        <FreezePill freezes={game.streak.freezes} />
        <LevelPill level={game.level} />
      </div>
      <WeekDots game={game} />
    </div>
  );
}

function Pill({
  tip,
  children,
  className,
}: {
  tip: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          tabIndex={0}
          className={cn(
            'flex items-center gap-2 rounded-full bg-card py-1.5 pr-4 pl-3 font-display text-[17px] font-semibold shadow-ledge outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
            className,
          )}
        >
          {children}
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-60">{tip}</TooltipContent>
    </Tooltip>
  );
}

function StreakPill({ game }: { game: GameState }) {
  const { current, longest, todayActive } = game.streak;
  const pending = !todayActive;
  const tip =
    current === 0
      ? 'Complete a task or focus 10 minutes today to start a streak.'
      : pending
        ? `Complete a task or focus 10 minutes today to make it ${current + 1}.${longest > current ? ` Longest: ${longest}.` : ''}`
        : `Today counts.${longest > current ? ` Longest: ${longest} days.` : ''}`;
  return (
    <Pill tip={tip} className="text-primary">
      <Flame
        aria-hidden
        className={cn(
          'size-[22px]',
          pending ? 'text-muted-foreground/70' : 'fill-ember text-ember-shade',
        )}
        strokeWidth={pending ? 2.4 : 1.6}
      />
      <span className={cn(pending && current === 0 && 'text-muted-foreground')}>
        <span className="sr-only">Daily streak: </span>
        {plural(current, 'day')}
      </span>
    </Pill>
  );
}

function FreezePill({ freezes }: { freezes: number }) {
  return (
    <Pill
      tip="A freeze keeps your streak through a day you miss. You earn one for every 7 days in a row, and can bank 2."
      className={freezes ? 'text-sky-800 dark:text-sky-300' : 'text-muted-foreground'}
    >
      <Snowflake aria-hidden className="size-5" strokeWidth={2.6} />
      {plural(freezes, 'freeze')}
    </Pill>
  );
}

function LevelPill({ level }: { level: GameState['level'] }) {
  const into = level.xp - level.floor;
  const span = level.next - level.floor;
  const pct = Math.min(100, Math.round((into / span) * 100));
  return (
    <Pill tip={`${level.xp} XP in all · ${level.next - level.xp} to level ${level.level + 1}`}>
      <span>Lv {level.level}</span>
      <span
        role="progressbar"
        aria-label={`Level ${level.level} progress`}
        aria-valuemin={0}
        aria-valuemax={span}
        aria-valuenow={into}
        className="block h-3.5 w-24 overflow-hidden rounded-full border-2 border-input bg-border sm:w-28"
      >
        <span
          className="block h-full rounded-full bg-foreground transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="text-[15px] tabular-nums">
        {into} / {span}
      </span>
    </Pill>
  );
}

function WeekDots({ game }: { game: GameState }) {
  const { week } = game.week;
  const active = new Set(week.dates);
  const days = eachDay(week.start, addDays(week.start, 6));
  const tip = week.met
    ? `Weekly target met: ${week.activeDays} of ${week.target} days.${game.week.current > 1 ? ` ${game.week.current} weeks in a row.` : ''}`
    : `${week.activeDays} of ${week.target} active days this week.${game.week.current > 0 ? ` ${plural(game.week.current, 'week')} in a row so far.` : ''}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <ol
          tabIndex={0}
          aria-label={`This week: ${week.activeDays} of ${week.target} active days`}
          className="flex items-center gap-1.5 rounded-full pr-1.5 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {days.map((day) => {
            const on = active.has(day);
            const isToday = day === game.today;
            const future = day > game.today;
            return (
              <li
                key={day}
                aria-label={`${WEEKDAY_NAME[weekdayOf(day)]}: ${on ? 'active' : future ? 'to come' : isToday ? 'not yet' : 'missed'}`}
                className={cn(
                  'grid size-7 place-items-center rounded-full font-display text-[13px] font-semibold',
                  on
                    ? 'bg-primary text-primary-foreground shadow-press'
                    : 'border-2 border-dashed border-muted-foreground/30 bg-card text-muted-foreground',
                  isToday && !on && 'border-solid border-ember/60',
                  future && 'opacity-70',
                )}
              >
                {WEEKDAY_LETTER[weekdayOf(day)]}
              </li>
            );
          })}
        </ol>
      </TooltipTrigger>
      <TooltipContent className="max-w-60">{tip}</TooltipContent>
    </Tooltip>
  );
}
