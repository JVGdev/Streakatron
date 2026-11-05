// A project's goals: outcomes (with an optional deadline) and time goals (focus minutes per week
// or month, D31), with their progress from focus sessions on the project and the pace still needed.

import type { GoalKind, GoalPeriod, GoalStatus } from '@streakatron/shared/structure';
import {
  Check,
  CircleOff,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Star,
  StarOff,
  Target,
  Timer,
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
import { useOpenSheet } from '@/hooks/use-open-task';
import { useSpotlightActions, useStructureActions } from '@/lib/actions';
import { formatMinutes, goalDue } from '@/lib/days';
import type { Goal, Task } from '@/lib/queries';
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
          What is this project aiming for? An outcome (“Pass the exam”) or a time goal (“4 hours a
          week”).
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
  const Icon = goal.kind === 'time' ? Timer : Target;

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
  const [due, setDue] = useState<{ date: string | null; precision: 'day' | 'month' }>({
    date: goal?.dueDate ?? null,
    precision: goal?.duePrecision ?? 'day',
  });
  const [busy, setBusy] = useState(false);

  const minutes = Math.round(Number(hours) * 60);
  const validTarget = kind === 'outcome' || (Number.isFinite(minutes) && minutes >= 5);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !validTarget) return;
    setBusy(true);
    const fields = {
      title,
      kind,
      targetMinutes: kind === 'time' ? minutes : null,
      period: kind === 'time' ? period : null,
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
          <DialogDescription>
            {kind === 'outcome'
              ? 'A result you’re after, optionally by a date.'
              : 'A regular effort: focus time per week or month.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="radiogroup">
          {(['outcome', 'time'] as const).map((k) => (
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
              {k === 'outcome' ? <Target className="size-4" /> : <Timer className="size-4" />}
              {k === 'outcome' ? 'Outcome' : 'Time goal'}
            </button>
          ))}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="goal-title">Title</Label>
          <Input
            id="goal-title"
            autoFocus
            maxLength={200}
            placeholder={kind === 'outcome' ? 'Pass the final exam' : 'Study every week'}
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
        <div className="grid gap-1.5">
          <Label>{kind === 'outcome' ? 'Deadline' : 'Until'} (optional)</Label>
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
