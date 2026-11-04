// Celebrating what a write earned. Every write's `game` block arrives here (game-bus.ts): the
// cached game state takes the server's new one, small wins (XP, the day counting, a freeze, the
// weekly target, small quests) show as one short toast, and big moments take the screen one after
// another: big quests and the board bonus (D25's quest-complete screen, D30), then a level up.

import { useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, Flame, ScrollText, Snowflake, Sparkles } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { onGame, type GameBlock } from '@/lib/game-bus';
import { gameQuery, type GameState } from '@/lib/queries';
import { cn } from '@/lib/utils';

type GameEvent = GameBlock['events'][number];
type QuestDone = Extract<GameEvent, { type: 'quest_done' }>['quest'];

type Moment =
  | { kind: 'quests'; quests: QuestDone[]; bonus: number | null; xp: number; state: GameState }
  | { kind: 'level'; level: number; state: GameState };

export function GameMoments() {
  const qc = useQueryClient();
  const [moments, setMoments] = useState<Moment[]>([]);

  useEffect(
    () =>
      onGame(({ events, state: raw }) => {
        const state = raw as GameState;
        qc.setQueryData(gameQuery.queryKey, state);
        void qc.invalidateQueries({ queryKey: ['quests'] });
        void qc.invalidateQueries({ queryKey: ['stats'] });

        const big = events.flatMap((e) =>
          e.type === 'quest_done' && e.quest.big ? [e.quest] : [],
        );
        const board = events.find((e) => e.type === 'board_done');
        const up = events.find((e) => e.type === 'level_up');
        const xp = events.find((e) => e.type === 'xp')?.amount ?? 0;
        const next: Moment[] = [];
        if (big.length || board) {
          next.push({ kind: 'quests', quests: big, bonus: board?.xp ?? null, xp, state });
        }
        if (up) next.push({ kind: 'level', level: up.level, state });
        if (next.length) setMoments((m) => [...m, ...next]);

        // The toast has the rest; with a screen up, the XP is on it.
        const small = events.filter(
          (e) =>
            e.type !== 'level_up' &&
            e.type !== 'board_done' &&
            !(e.type === 'quest_done' && e.quest.big) &&
            !(e.type === 'xp' && next.length),
        );
        if (small.length) {
          toast.custom(() => <GameToast events={small} />, { duration: 2800 });
        }
      }),
    [qc],
  );

  const current = moments[0];
  return (
    <Dialog
      open={current !== undefined}
      onOpenChange={(open) => !open && setMoments((m) => m.slice(1))}
    >
      {current?.kind === 'level' && <LevelUp level={current.level} state={current.state} />}
      {current?.kind === 'quests' && <QuestComplete moment={current} />}
    </Dialog>
  );
}

function GameToast({ events }: { events: GameEvent[] }) {
  const xp = events.find((e) => e.type === 'xp');
  return (
    <div
      role="status"
      className="flex w-[var(--width,356px)] max-w-full items-center gap-3 rounded-2xl border-2 bg-popover p-3 font-sans text-popover-foreground shadow-ledge-lg"
    >
      {xp && (
        <span className="shrink-0 rounded-full bg-primary px-3 py-1 font-display text-[15px] font-semibold text-primary-foreground shadow-press motion-safe:animate-check-pop">
          +{xp.amount} XP
        </span>
      )}
      <ul className="grid min-w-0 gap-0.5 text-sm font-bold">
        {events.length === 1 && xp ? (
          <li>Nice work.</li>
        ) : (
          events.map((e, i) => <EventLine key={i} event={e} />)
        )}
      </ul>
    </div>
  );
}

function EventLine({ event }: { event: GameEvent }) {
  switch (event.type) {
    case 'day_active':
      return (
        <li className="flex items-center gap-1.5 text-primary">
          <Flame className="size-4 fill-ember text-ember-shade" strokeWidth={1.6} aria-hidden />
          {event.streak === 1 ? 'Today counts. Streak started!' : `${event.streak}-day streak!`}
        </li>
      );
    case 'freeze_earned':
      return (
        <li className="flex items-center gap-1.5 text-sky-800 dark:text-sky-300">
          <Snowflake className="size-4" aria-hidden />
          Streak freeze earned ({event.freezes} banked)
        </li>
      );
    case 'week_met':
      return (
        <li className="flex items-center gap-1.5">
          <CalendarCheck className="size-4 text-ember" aria-hidden />
          Weekly target met
          {event.weeks > 1 ? ` · ${event.weeks} weeks in a row` : ''}
        </li>
      );
    case 'quest_done':
      return (
        <li className="flex min-w-0 items-center gap-1.5">
          <ScrollText className="size-4 shrink-0 text-ember" aria-hidden />
          <span className="truncate">Quest done: {event.quest.title}</span>
        </li>
      );
    case 'xp': // shown as the pill
    case 'level_up': // takes the screen
    case 'board_done':
      return null;
  }
}

function LevelUp({ level, state }: { level: number; state: GameState }) {
  return (
    <DialogContent showCloseButton={false} className="max-w-sm gap-6 p-8 text-center sm:max-w-sm">
      <div className="relative mx-auto mt-2 grid size-28 place-items-center" aria-hidden>
        {[0, 60, 120, 180, 240, 300].map((angle) => (
          <span
            key={angle}
            className="absolute top-1/2 left-1/2 size-3 rounded-full bg-peach motion-safe:animate-check-spark"
            style={{ '--angle': `${angle}deg`, animationDuration: '900ms' } as CSSProperties}
          />
        ))}
        <span className="grid size-24 place-items-center rounded-[28px] bg-ember font-display text-5xl font-semibold text-white shadow-[0_6px_0_var(--ember-shade)] motion-safe:animate-check-pop">
          {level}
        </span>
        <Sparkles className="absolute -top-1 -right-1 size-7 text-ember" />
      </div>
      <div>
        <DialogTitle className="text-4xl text-primary">Level {level}!</DialogTitle>
        <DialogDescription className="mt-2 text-base font-bold">
          {state.level.next - state.level.xp} XP to level {level + 1}.
        </DialogDescription>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Total XP" value={String(state.level.xp)} />
        <Stat
          label="Streak"
          value={`${state.streak.current} day${state.streak.current === 1 ? '' : 's'}`}
          ember
        />
      </div>
      <DialogClose asChild>
        <Button size="lg" className="w-full text-lg">
          Keep going
        </Button>
      </DialogClose>
    </DialogContent>
  );
}

const TIER_LABEL: Record<string, string> = {
  small: 'Small box',
  standard: 'Box',
  large: 'Large box',
};

/** D25's quest-complete screen (Arcade): the box, what was done, and stat boxes. */
function QuestComplete({ moment }: { moment: Extract<Moment, { kind: 'quests' }> }) {
  const { quests, bonus, xp, state } = moment;
  const tier =
    bonus !== null || quests.some((q) => q.tier === 'large')
      ? 'large'
      : (quests[0]?.tier ?? 'standard');
  const title =
    bonus !== null
      ? 'Board cleared!'
      : quests.length > 1
        ? `${quests.length} quests done!`
        : 'Quest complete!';
  return (
    <DialogContent showCloseButton={false} className="max-w-sm gap-6 p-8 text-center sm:max-w-sm">
      <LootBoxPlaceholder tier={tier} />
      <div>
        <DialogTitle className="text-4xl text-primary">{title}</DialogTitle>
        <DialogDescription asChild>
          <ul className="mt-2 grid gap-1 text-base font-bold text-foreground">
            {quests.map((q) => (
              <li key={q.id}>{q.title}</li>
            ))}
            {bonus !== null && (
              <li className="text-muted-foreground">Every daily quest done: +{bonus} XP bonus</li>
            )}
          </ul>
        </DialogDescription>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="XP" value={`+${xp}`} ember />
        <Stat label="Streak" value={String(state.streak.current)} />
        <Stat label="Level" value={String(state.level.level)} />
      </div>
      <DialogClose asChild>
        <Button size="lg" className="w-full text-lg">
          Keep going
        </Button>
      </DialogClose>
    </DialogContent>
  );
}

/**
 * A placeholder for the loot box (D30): a wrapped box that hops in. Boxes don't accrue or open
 * yet; the real visual and the opening come with the rewards phase (plan.md Phase 5).
 */
function LootBoxPlaceholder({ tier }: { tier: string }) {
  const size = tier === 'large' ? 'size-28' : tier === 'small' ? 'size-20' : 'size-24';
  return (
    <div className="relative mx-auto mt-2 grid place-items-center" aria-hidden>
      {[0, 60, 120, 180, 240, 300].map((angle) => (
        <span
          key={angle}
          className="absolute top-1/2 left-1/2 size-3 rounded-full bg-peach motion-safe:animate-check-spark"
          style={{ '--angle': `${angle}deg`, animationDuration: '900ms' } as CSSProperties}
        />
      ))}
      <div className={cn('relative motion-safe:animate-check-pop', size)}>
        {/* Lid */}
        <span className="absolute inset-x-[-6%] top-[8%] h-[24%] rounded-lg bg-ember-shade shadow-[0_4px_0_rgb(0_0_0/0.15)]" />
        {/* Body */}
        <span className="absolute inset-x-0 top-[30%] bottom-0 rounded-xl bg-ember shadow-[0_6px_0_var(--ember-shade)]" />
        {/* Ribbon */}
        <span className="absolute top-[8%] bottom-0 left-1/2 w-[16%] -translate-x-1/2 bg-glow" />
        <span className="absolute top-[-6%] left-1/2 h-[18%] w-[44%] -translate-x-1/2 rounded-full border-[5px] border-glow" />
      </div>
      <span className="mt-3 rounded-full bg-glow px-3 py-0.5 text-xs font-extrabold tracking-[0.08em] text-glow-foreground uppercase">
        {TIER_LABEL[tier] ?? 'Box'} · opens in a later update
      </span>
    </div>
  );
}

/** A stat box from the quest-complete screen (D25): a dark label band over a big value. */
function Stat({ label, value, ember }: { label: string; value: string; ember?: boolean }) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border-2',
        ember ? 'border-primary' : 'border-foreground',
      )}
    >
      <div
        className={cn(
          'py-1 text-xs font-extrabold tracking-[0.1em] uppercase',
          ember ? 'bg-primary text-primary-foreground' : 'bg-foreground text-background',
        )}
      >
        {label}
      </div>
      <div className={cn('py-2.5 font-display text-2xl font-semibold', ember && 'text-primary')}>
        {value}
      </div>
    </div>
  );
}
