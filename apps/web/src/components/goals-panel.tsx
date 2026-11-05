// A project's goals: outcomes (with an optional deadline), time goals (focus minutes per week or
// month, D31) and number goals (a target with a unit, D45), with their progress and the pace
// still needed.

import type { GoalKind, GoalPeriod, GoalStatus } from '@streakatron/shared/structure';
import { NUMBER_GOAL_LIMITS } from '@streakatron/shared/structure';
import { useQuery } from '@tanstack/react-query';
import {
  Check,
  CircleOff,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Star,
  StarOff,
  Trash2,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TentativeDateField } from '@/components/event-fields';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useOpenSheet } from '@/hooks/use-open-task';
import { useSpotlightActions, useStructureActions } from '@/lib/actions';
import { formatMinutes, goalDue } from '@/lib/days';
import { GOAL_ICON, withUnit } from '@/lib/goals';
import { commitmentsQuery, type Goal, type Task } from '@/lib/queries';
import { cn } from '@/lib/utils';

export function GoalsPanel({
  projectId,
  goals,
  tasks,
  today,
}: {
  projectId: string;
  goals: Goal[];
  tasks: Task[];
  today: string;
}) {
  const [editing, setEditing] = useState<Goal | 'new' | null>(null);
  const open = goals.filter((g) => g.status === 'open');
  const closed = goals.filter((g) => g.status !== 'open');

  return (
    <section className="space-y-3" aria-label="Goals">
      <div className="flex items-center justify-between">
        <h2 className="text-xl">Goals</h2>
        <Button variant="ghost" size="sm" onClick={() => setEditing('new')}>
          <Plus />
          Goal
        </Button>
      </div>
      {goals.length === 0 && (
        <button
          onClick={() => setEditing('new')}
          className="w-full rounded-2xl border-2 border-dashed px-4 py-6 text-left text-sm text-muted-foreground hover:bg-muted/40"
        >
          Add a goal: an outcome to reach, or focus time to put in.
        </button>
      )}
      <div className="grid gap-2">
        {[...open, ...closed].map((g) => (
          <GoalRow
            key={g.id}
            goal={g}
            today={today}
            tasks={tasks.filter((t) => t.goalId === g.id)}
            onEdit={() => setEditing(g)}
          />
        ))}
      </div>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        {editing !== null && (
          <GoalForm
            key={editing === 'new' ? 'new' : editing.id}
            projectId={projectId}
            goal={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Dialog>
    </section>
  );
}

function GoalRow({
  goal,
  tasks,
  today,
  onEdit,
}: {
  goal: Goal;
  tasks: Task[];
  today: string;
  onEdit: () => void;
}) {
  const actions = useStructureActions();
  const spotlight = useSpotlightActions();
  const openSheet = useOpenSheet();
  const done = tasks.filter((t) => t.completedAt).length;
  const due = goalDue(goal, today);
  const setStatus = (status: GoalStatus) => void actions.updateGoal(goal, { status });
  const Icon = GOAL_ICON[goal.kind];

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-2xl border-2 bg-card px-4 py-3 shadow-ledge',
        goal.status !== 'open' && 'opacity-70',
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-ember" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <button
            className={cn(
              'text-left text-sm font-medium hover:underline',
              goal.status === 'achieved' && 'line-through',
            )}
            onClick={() => openSheet('goal', goal.id)}
          >
            {goal.title}
          </button>
          {goal.status !== 'open' && (
            <Badge variant="secondary">{goal.status === 'achieved' ? 'Achieved' : 'Dropped'}</Badge>
          )}
          {goal.status === 'open' && goal.spotlightedAt && (
            <Star className="size-3.5 fill-glow text-glow" aria-label="In the spotlight" />
          )}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {goal.progress && goal.status === 'open' && (
            <TimeGoalProgress progress={goal.progress} period={goal.period} />
          )}
          {goal.numbers && goal.status === 'open' && <NumberGoalProgress goal={goal} />}
          {due && goal.status === 'open' && (
            <span className={cn(due.late && 'text-destructive')}>{due.text}</span>
          )}
          {tasks.length > 0 && (
            <span>
              {done}/{tasks.length} tasks done
            </span>
          )}
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-7" aria-label={`${goal.title} menu`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {goal.status === 'open' ? (
            <>
              <DropdownMenuItem onSelect={() => setStatus('achieved')}>
                <Check />
                Mark achieved
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setStatus('dropped')}>
                <CircleOff />
                Drop it
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void spotlight.set(goal, !goal.spotlightedAt)}>
                {goal.spotlightedAt ? <StarOff /> : <Star />}
                {goal.spotlightedAt ? 'Remove from spotlight' : 'Spotlight on Today'}
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem onSelect={() => setStatus('open')}>
              <RotateCcw />
              Reopen
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil />
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => void actions.deleteGoal(goal)}>
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

const KIND_LABEL: Record<GoalKind, string> = {
  outcome: 'Outcome',
  time: 'Time goal',
  number: 'Number',
};

const KIND_HINT: Record<GoalKind, string> = {
  outcome: 'A result you’re after, optionally by a date.',
  time: 'A regular effort: focus time per week or month.',
  number: 'A number to reach, like lessons or pages, optionally by a date.',
};

export function GoalForm({
  projectId,
  goal,
  onDone,
}: {
  projectId: string;
  goal?: Goal;
  onDone: () => void;
}) {
  const actions = useStructureActions();
  const [title, setTitle] = useState(goal?.title ?? '');
  const [kind, setKind] = useState<GoalKind>(goal?.kind ?? 'outcome');
  const [hours, setHours] = useState(goal?.targetMinutes ? String(goal.targetMinutes / 60) : '4');
  const [period, setPeriod] = useState<GoalPeriod>(goal?.period ?? 'week');
  const [count, setCount] = useState(goal?.targetCount ? String(goal.targetCount) : '');
  const [unit, setUnit] = useState(goal?.unit ?? '');
  const [feed, setFeed] = useState<string | null>(goal?.commitmentId ?? null);
  const { data: commitments = [] } = useQuery(commitmentsQuery());
  // Ticked or counted commitments of this project can feed it (minutes feed time goals).
  const feeders = commitments.filter((c) => c.projectId === projectId && c.measure !== 'minutes');
  const [due, setDue] = useState<{ date: string | null; precision: 'day' | 'month' }>({
    date: goal?.dueDate ?? null,
    precision: goal?.duePrecision ?? 'day',
  });
  const [busy, setBusy] = useState(false);

  const minutes = Math.round(Number(hours) * 60);
  const target = Math.round(Number(count));
  const validTarget =
    kind === 'outcome' ||
    (kind === 'time' && Number.isFinite(minutes) && minutes >= 5) ||
    (kind === 'number' &&
      Number.isInteger(target) &&
      target >= NUMBER_GOAL_LIMITS.target.min &&
      target <= NUMBER_GOAL_LIMITS.target.max);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !validTarget) return;
    setBusy(true);
    const fields = {
      title,
      kind,
      targetMinutes: kind === 'time' ? minutes : null,
      period: kind === 'time' ? period : null,
      targetCount: kind === 'number' ? target : null,
      unit: kind === 'number' ? unit.trim() || null : null,
      commitmentId: kind === 'number' ? feed : null,
      dueDate: due.date,
      duePrecision: due.date ? due.precision : ('day' as const),
    };
    const ok = goal
      ? await actions.updateGoal(goal, fields)
      : await actions.createGoal({ projectId, ...fields });
    setBusy(false);
    if (ok) onDone();
  }

  return (
    <DialogContent className="sm:max-w-md">
      <form onSubmit={submit} className="grid gap-4">
        <DialogHeader>
          <DialogTitle>{goal ? 'Edit goal' : 'New goal'}</DialogTitle>
          <DialogDescription>{KIND_HINT[kind]}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1" role="radiogroup">
          {(['outcome', 'time', 'number'] as const).map((k) => {
            const KindIcon = GOAL_ICON[k];
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-md py-1.5 text-sm font-medium text-muted-foreground',
                  kind === k && 'bg-background text-foreground shadow-xs',
                )}
              >
                <KindIcon className="size-4" />
                {KIND_LABEL[k]}
              </button>
            );
          })}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="goal-title">Title</Label>
          <Input
            id="goal-title"
            autoFocus
            maxLength={200}
            placeholder={
              kind === 'time' ? 'What you want to put time into' : 'What you want to reach'
            }
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        {kind === 'time' && (
          <div className="grid gap-1.5">
            <Label htmlFor="goal-hours">Target</Label>
            <div className="flex items-center gap-2 text-sm">
              <Input
                id="goal-hours"
                type="number"
                min={0.25}
                step={0.25}
                className="w-24"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
              hours of focus a
              <select
                aria-label="Period"
                value={period}
                onChange={(e) => setPeriod(e.target.value as GoalPeriod)}
                className="h-9 rounded-md border bg-transparent px-2"
              >
                <option value="week">week</option>
                <option value="month">month</option>
              </select>
            </div>
          </div>
        )}
        {kind === 'number' && (
          <div className="grid gap-1.5">
            <Label htmlFor="goal-count">Target</Label>
            <div className="flex items-center gap-2 text-sm">
              <Input
                id="goal-count"
                type="number"
                min={NUMBER_GOAL_LIMITS.target.min}
                max={NUMBER_GOAL_LIMITS.target.max}
                className="w-24"
                placeholder="40"
                value={count}
                onChange={(e) => setCount(e.target.value)}
              />
              <Input
                aria-label="Unit"
                maxLength={NUMBER_GOAL_LIMITS.unitLength}
                className="flex-1"
                placeholder="lessons"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
              />
            </div>
          </div>
        )}
        {kind === 'number' && feeders.length > 0 && (
          <div className="grid gap-1.5">
            <Label htmlFor="goal-feed">Counted from (optional)</Label>
            <select
              id="goal-feed"
              value={feed ?? ''}
              onChange={(e) => setFeed(e.target.value || null)}
              className="h-9 rounded-md border bg-transparent px-2 text-sm"
            >
              <option value="">Only what I type in</option>
              {feeders.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.measure === 'check' ? 'each tick' : (c.unit ?? 'each one')})
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">Its ticks or amounts add up from today.</p>
          </div>
        )}
        <div className="grid gap-1.5">
          <Label>{kind === 'time' ? 'Until' : 'Deadline'} (optional)</Label>
          <TentativeDateField
            withTbd={false}
            dayClearable
            date={due.date}
            precision={due.precision}
            onChange={(v) =>
              setDue({ date: v.date, precision: v.precision === 'month' ? 'month' : 'day' })
            }
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !title.trim() || !validTarget}>
            {goal ? 'Save' : 'Add goal'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/** A time goal's bar: minutes this period of the target, and the pace still needed. */
export function TimeGoalProgress({
  progress: p,
  period,
  className,
}: {
  progress: NonNullable<Goal['progress']>;
  period: Goal['period'];
  className?: string;
}) {
  return (
    <span className={cn('grid w-full max-w-sm gap-1', className)}>
      <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span
          className="block h-full rounded-full bg-ember transition-[width]"
          style={{ width: `${Math.min(100, (p.minutes / p.target) * 100)}%` }}
        />
      </span>
      <span>
        <span className={cn('font-semibold', p.met && 'text-ember')}>
          {formatMinutes(p.minutes)} of {formatMinutes(p.target)}
        </span>{' '}
        this {period}
        {p.met
          ? ' · made it'
          : ` · ${formatMinutes(p.perDay)} a day to make it (${p.daysLeft} ${p.daysLeft === 1 ? 'day' : 'days'} left)`}
      </span>
    </span>
  );
}

/**
 * A number goal's bar: where it stands of its target, the pace still needed and how far behind it
 * is; "+1" and "Set to…" change the part typed in.
 */
export function NumberGoalProgress({
  goal,
  className,
  controls = true,
}: {
  goal: Goal;
  className?: string;
  controls?: boolean;
}) {
  const p = goal.numbers;
  if (!p) return null;
  const pace = p.pace
    ? `${p.pace.amount} a ${p.pace.per} to make it`
    : p.late && !p.met
      ? 'past the deadline'
      : null;
  return (
    <span className={cn('grid w-full max-w-sm gap-1', className)}>
      <span className="flex items-center gap-2">
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
          <span
            className="block h-full rounded-full bg-ember transition-[width]"
            style={{ width: `${Math.min(100, (p.current / p.target) * 100)}%` }}
          />
        </span>
        {controls && goal.status === 'open' && <CountControls goal={goal} />}
      </span>
      <span>
        <span className={cn('font-semibold', p.met && 'text-ember')}>
          {p.current} of {withUnit(p.target, goal.unit)}
        </span>
        {p.met ? ' · made it' : pace && ` · ${pace}`}
        {p.behind > 0 && (
          <span className="text-amber-700 dark:text-amber-400"> · {p.behind} behind</span>
        )}
      </span>
    </span>
  );
}

function CountControls({ goal }: { goal: Goal }) {
  const actions = useStructureActions();
  const p = goal.numbers!;
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  // "Set to N" changes the typed-in part: N minus what the commitment fed.
  const setTo = (n: number) => actions.updateGoal(goal, { count: Math.max(0, n - p.fed) });
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  return (
    <span className="flex items-center gap-0.5" onClick={stop} onKeyDown={stop}>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 px-1.5 text-xs"
        aria-label={`Add one to ${goal.title}`}
        onClick={() => void actions.updateGoal(goal, { count: goal.count + 1 })}
      >
        +1
      </Button>
      <Popover
        open={open}
        onOpenChange={(o) => {
          if (o) setValue(String(p.current));
          setOpen(o);
        }}
      >
        <PopoverTrigger asChild>
          <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs">
            Set…
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56">
          <form
            className="grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const n = Math.round(Number(value));
              if (!Number.isFinite(n) || n < 0) return;
              setOpen(false);
              void setTo(n);
            }}
          >
            <Label htmlFor={`set-${goal.id}`} className="text-xs text-muted-foreground">
              Where it stands now
            </Label>
            <div className="flex gap-2">
              <Input
                id={`set-${goal.id}`}
                type="number"
                min={0}
                autoFocus
                className="h-8"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
              <Button type="submit" size="sm" className="h-8">
                Set
              </Button>
            </div>
            {p.fed > 0 && (
              <p className="text-xs text-muted-foreground">{p.fed} came from its commitment.</p>
            )}
          </form>
        </PopoverContent>
      </Popover>
    </span>
  );
}
