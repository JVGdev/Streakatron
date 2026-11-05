// Today's quests (plan.md §4.3, D25 "quests as gift cards", D30): the daily board, quick wins and
// this week's quests, with progress, rerolls (once per quest) and the board bonus. The server makes
// and evaluates everything; this only shows it.

import { formatMinutes } from '@streakatron/shared/quests';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Check, Dices, Gift } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useOpenSheet } from '@/hooks/use-open-task';
import { useQuestActions } from '@/lib/actions';
import { questsQuery, type Quest, type QuestBoard as Board } from '@/lib/queries';
import { cn } from '@/lib/utils';

const TYPE_LABEL: Record<Quest['type'], string> = {
  daily: 'Daily',
  time: 'Time',
  quick: 'Quick',
  make: 'Make',
  followup: 'Follow-up',
  weekly: 'This week',
  review: 'Review',
  project: 'Project',
  comeback: 'Welcome back',
};

const MINUTES = new Set(['focus_today', 'week_focus', 'time_goal']);

export function QuestBoard() {
  const { data: board } = useQuery(questsQuery);
  if (!board) return <div className="h-48 rounded-3xl bg-muted" />;
  if (!board.quests.length) return null;

  const main = board.quests.filter((q) => q.type !== 'quick' && q.type !== 'weekly');
  const quick = board.quests.filter((q) => q.type === 'quick');
  const weekly = board.quests.filter((q) => q.type === 'weekly');

  return (
    <section
      aria-label="Quests"
      className="rounded-3xl border-2 bg-card p-3 shadow-ledge-lg sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-3">
        <h2 className="text-2xl">Today’s quests</h2>
        <BonusChip bonus={board.bonus} />
      </div>

      {main.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {main.map((q) => (
            <QuestCard key={q.id} quest={q} />
          ))}
        </div>
      )}

      {quick.length > 0 && (
        <Group title={`Quick wins · ${board.quick.done} of ${board.quick.max} today`}>
          <div className="grid gap-2">
            {quick.map((q) => (
              <QuestCard key={q.id} quest={q} compact />
            ))}
          </div>
        </Group>
      )}

      {weekly.length > 0 && (
        <Group title="This week">
          <div className="grid gap-3 sm:grid-cols-3">
            {weekly.map((q) => (
              <QuestCard key={q.id} quest={q} />
            ))}
          </div>
        </Group>
      )}
    </section>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <h3 className="px-1 pb-2 font-sans text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </div>
  );
}

function BonusChip({ bonus }: { bonus: Board['bonus'] }) {
  if (!bonus.total) return null;
  return (
    <span
      className={cn(
        'flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold',
        bonus.earned ? 'bg-primary text-primary-foreground shadow-press' : 'bg-muted',
      )}
    >
      <Gift className="size-4" strokeWidth={2.6} aria-hidden />
      {bonus.earned
        ? `Board cleared · +${bonus.xp} XP`
        : `${bonus.done} of ${bonus.total} daily · +${bonus.xp} XP bonus`}
    </span>
  );
}

function QuestCard({ quest: q, compact }: { quest: Quest; compact?: boolean }) {
  const done = q.status === 'completed';
  const open = useOpenTarget(q);
  const pct = q.target ? Math.round((q.progress / q.target) * 100) : 0;
  const amount = (n: number) => (MINUTES.has(q.template) ? formatMinutes(n) : String(n));

  return (
    <article
      className={cn(
        'flex flex-col gap-2 rounded-2xl border-2 bg-card p-3.5 transition-colors',
        done ? 'border-dashed bg-muted/40' : 'shadow-ledge',
        compact && 'flex-row items-center gap-3 py-2.5',
        q.type === 'comeback' && !done && 'border-ember/60 bg-glow/40',
      )}
    >
      <div className={cn('flex items-center justify-between gap-2', compact && 'contents')}>
        {!compact && (
          <span
            className={cn(
              'rounded-full px-2.5 py-0.5 text-[11px] font-extrabold tracking-[0.08em] uppercase',
              done ? 'bg-muted text-muted-foreground' : 'bg-glow text-glow-foreground',
            )}
          >
            {TYPE_LABEL[q.type]}
          </span>
        )}
        <span className={cn('flex items-center gap-1', compact && 'order-last')}>
          {q.canReroll && <Reroll quest={q} />}
          <XpBadge xp={q.xp} done={done} />
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <h4
          className={cn(
            'font-display text-[17px] leading-snug font-semibold',
            done && 'text-muted-foreground line-through decoration-2',
          )}
        >
          {open ? (
            <button className="text-left hover:underline" onClick={open}>
              {q.title}
            </button>
          ) : (
            q.title
          )}
        </h4>
        {q.hint && !done && !compact && (
          <p className="mt-0.5 text-sm text-muted-foreground">{q.hint}</p>
        )}
      </div>

      {!compact && q.target > 1 && (
        <div className="flex items-center gap-2">
          <span
            role="progressbar"
            aria-label={`${q.title}: progress`}
            aria-valuemin={0}
            aria-valuemax={q.target}
            aria-valuenow={q.progress}
            className="block h-2.5 flex-1 overflow-hidden rounded-full bg-muted"
          >
            <span
              className={cn(
                'block h-full rounded-full transition-[width] duration-700 ease-out',
                done ? 'bg-muted-foreground/40' : 'bg-ember',
              )}
              style={{ width: `${pct}%` }}
            />
          </span>
          <span className="text-xs font-bold text-muted-foreground tabular-nums">
            {amount(q.progress)} / {amount(q.target)}
          </span>
        </div>
      )}
    </article>
  );
}

function XpBadge({ xp, done, className }: { xp: number; done: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 font-display text-sm font-semibold',
        done ? 'bg-primary text-primary-foreground' : 'bg-muted',
        className,
      )}
    >
      {done && <Check className="size-3.5" strokeWidth={3} aria-label="Done" />}+{xp} XP
    </span>
  );
}

function Reroll({ quest }: { quest: Quest }) {
  const actions = useQuestActions();
  const [busy, setBusy] = useState(false);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-7 text-muted-foreground"
          aria-label={`Reroll “${quest.title}”`}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await actions.reroll(quest.id);
            setBusy(false);
          }}
        >
          <Dices />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Trade it for another (once per quest)</TooltipContent>
    </Tooltip>
  );
}

/** What clicking a quest's title opens: its task, goal or project. */
function useOpenTarget(q: Quest): (() => void) | null {
  const openSheet = useOpenSheet();
  const navigate = useNavigate();
  if (q.goalId) return () => openSheet('goal', q.goalId!);
  if (q.taskId) return () => openSheet('task', q.taskId!);
  if (q.projectId) {
    return () => void navigate({ to: '/projects/$projectId', params: { projectId: q.projectId! } });
  }
  return null;
}
