// Spotlight (D33): up to 4 tasks and goals the user features at the top of Today, for ongoing work
// that has no date and isn't always the next action ("Learn katakana"). Tasks get a one-click
// focus start; goals show their progress and days left. Also the "spotlight is full" dialog and
// the toggle the task and goal sheets use.

import { SPOTLIGHT_MAX } from '@streakatron/shared/structure';
import { useQuery } from '@tanstack/react-query';
import { Goal as GoalIcon, Play, Star, StarOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useQuickFocus } from '@/hooks/use-focus';
import { useOpenSheet } from '@/hooks/use-open-task';
import { useSpotlightActions } from '@/lib/actions';
import { countdown } from '@/lib/days';
import { spotlightQuery, type Project, type SpotlightGoal, type Task } from '@/lib/queries';
import { setUi, useUi } from '@/lib/ui-store';
import { cn } from '@/lib/utils';
import { EntityIcon } from './entity-icon';
import { TimeGoalProgress } from './goals-panel';
import { TaskRow } from './task-row';

/** The Spotlight section on Today; nothing when it's empty. */
export function SpotlightSection({
  tasks,
  projects,
  today,
}: {
  /** Today's open tasks; spotlighted ones are found here by id. */
  tasks: Task[];
  projects: Project[];
  today: string;
}) {
  const { data: items = [] } = useQuery(spotlightQuery);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const byProject = new Map(projects.map((p) => [p.id, p]));
  const shown = items.filter((i) => i.goal || byId.has(i.id));
  if (!shown.length) return null;

  return (
    <section aria-label="Spotlight" className="grid gap-2">
      <h2 className="flex items-center gap-1.5 px-1 font-sans text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase">
        <Star className="size-3.5 fill-glow text-glow" aria-hidden />
        Spotlight
      </h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {shown.map((i) =>
          i.goal ? (
            <GoalCard
              key={i.id}
              goal={i.goal}
              project={byProject.get(i.goal.projectId)}
              today={today}
            />
          ) : (
            <TaskRow
              key={i.id}
              tile
              task={byId.get(i.id)!}
              today={today}
              project={
                byId.get(i.id)!.projectId ? byProject.get(byId.get(i.id)!.projectId!) : undefined
              }
              actions={<TaskActions task={byId.get(i.id)!} />}
            />
          ),
        )}
      </div>
    </section>
  );
}

function TaskActions({ task }: { task: Task }) {
  const quickFocus = useQuickFocus();
  return (
    <div className="flex shrink-0 items-center">
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Focus on “${task.title}”`}
        onClick={() => void quickFocus({ taskId: task.id })}
      >
        <Play />
      </Button>
      <RemoveButton item={task} />
    </div>
  );
}

function RemoveButton({ item }: { item: { id: string; title: string } }) {
  const spotlight = useSpotlightActions();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 max-md:hidden"
      aria-label={`Remove “${item.title}” from the spotlight`}
      onClick={() => void spotlight.set(item, false)}
    >
      <StarOff />
    </Button>
  );
}

function GoalCard({
  goal,
  project,
  today,
}: {
  goal: SpotlightGoal;
  project?: Project;
  today: string;
}) {
  const open = useOpenSheet();
  const total = goal.tasks.open + goal.tasks.done;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => open('goal', goal.id)}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && e.key === 'Enter') open('goal', goal.id);
      }}
      className="group flex cursor-pointer items-center gap-3.5 rounded-2xl border-2 border-muted bg-background p-3 transition-colors outline-none hover:border-input focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ember/15 text-ember">
        <GoalIcon className="size-4.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-base leading-6 font-bold break-words">{goal.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {project && (
            <span className="inline-flex items-center gap-1">
              <EntityIcon icon={project.icon} color={project.color} size="sm" />
              {project.title}
            </span>
          )}
          {goal.dueDate && (
            <span className={cn(goal.dueDate < today && 'text-destructive')}>
              {countdown(goal.dueDate, today)}
            </span>
          )}
          {goal.progress ? (
            <TimeGoalProgress progress={goal.progress} period={goal.period} />
          ) : (
            total > 0 && (
              <span className="grid w-full max-w-sm gap-1">
                <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <span
                    className="block h-full rounded-full bg-ember"
                    style={{ width: `${(goal.tasks.done / total) * 100}%` }}
                  />
                </span>
                <span>
                  {goal.tasks.done}/{total} tasks done
                </span>
              </span>
            )
          )}
        </div>
      </div>
      <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <RemoveButton item={goal} />
      </div>
    </div>
  );
}

/** The star next to a task's or goal's title in its sheet: "Spotlight on Today" or take it off. */
export function SpotlightToggle({
  item,
  on,
}: {
  item: { id: string; title: string };
  on: boolean;
}) {
  const spotlight = useSpotlightActions();
  const label = on ? 'Remove from the spotlight' : 'Spotlight on Today';
  return (
    <Button
      variant="ghost"
      size="icon"
      className="mt-0.5 shrink-0"
      aria-pressed={on}
      aria-label={label}
      title={label}
      onClick={() => void spotlight.set(item, !on)}
    >
      <Star className={cn(on ? 'fill-glow text-glow' : 'text-muted-foreground')} />
    </Button>
  );
}

/** Asks which one to drop when a fifth thing is spotlighted (D33). Mounted once in the shell. */
export function SpotlightFullDialog() {
  const { spotlightFull: full } = useUi();
  const spotlight = useSpotlightActions();
  const close = () => setUi({ spotlightFull: null });
  return (
    <Dialog open={!!full} onOpenChange={(o) => !o && close()}>
      {full && (
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>The spotlight is full</DialogTitle>
            <DialogDescription>
              It holds {SPOTLIGHT_MAX}, so it stays a highlight. Which one makes room for “
              {full.add.title}”?
            </DialogDescription>
          </DialogHeader>
          <ul className="grid gap-2">
            {full.items.map((i) => (
              <li
                key={i.id}
                className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{i.title}</span>
                <span className="text-xs text-muted-foreground">{i.kind}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    close();
                    await spotlight.set(full.add, true, i.id);
                  }}
                >
                  Replace
                </Button>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
