import { wallClock } from '@streakatron/shared/time';
import { useQuery } from '@tanstack/react-query';
import { describeTaskRepeat } from '@streakatron/shared/repeats';
import { Bell, CalendarClock, CalendarDays, ListChecks, Repeat2, Target } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatDayShort, formatRemindAt } from '@/lib/days';
import { EFFORT_LABEL } from '@/lib/look';
import { meQuery, type Goal, type Project, type Task } from '@/lib/queries';
import { isOverdue } from '@/lib/task-list';
import { cn } from '@/lib/utils';
import { EntityIcon } from './entity-icon';

function Chip({
  className,
  children,
  title,
}: {
  className?: string;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-md text-xs font-semibold text-muted-foreground [&>svg]:size-3.5',
        className,
      )}
    >
      {children}
    </span>
  );
}

const EFFORT_LEVEL = { S: 1, M: 2, L: 3 } as const;

/** Effort as one to three rising bars: quieter than a letter, readable at a glance. */
export function EffortBars({ effort, className }: { effort: 'S' | 'M' | 'L'; className?: string }) {
  const level = EFFORT_LEVEL[effort];
  return (
    <span className={cn('inline-flex h-3 items-end gap-0.5', className)} aria-hidden>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn(
            'w-[3px] rounded-full',
            i <= level ? 'bg-current' : 'bg-current opacity-25',
          )}
          style={{ height: `${4 + i * 3}px` }}
        />
      ))}
    </span>
  );
}

export function EffortBadge({ effort }: { effort: 'S' | 'M' | 'L' }) {
  return (
    <Chip title={`Effort: ${EFFORT_LABEL[effort]}`}>
      <EffortBars effort={effort} />
      <span className="sr-only">Effort: {EFFORT_LABEL[effort]}</span>
    </Chip>
  );
}

/** The small facts under or beside a task title. */
export function TaskMeta({
  task,
  today,
  project,
  goal,
}: {
  task: Task;
  today: string;
  project?: Project;
  goal?: Goal;
}) {
  const { data: me } = useQuery(meQuery);
  const late = isOverdue(task, today);
  const done = task.completedAt !== null;
  // Upcoming ones, and today's (a reminder from an earlier day is spent).
  const remind =
    !done &&
    task.remindAt &&
    me &&
    wallClock(new Date(task.remindAt), me.settings.timezone).date >= today
      ? formatRemindAt(task.remindAt, me.settings.timezone, today)
      : null;
  return (
    <>
      {project && (
        <Chip title={project.title} className="max-w-40">
          <EntityIcon icon={project.icon} color={project.color} size="sm" />
          <span className="truncate">{project.title}</span>
        </Chip>
      )}
      {task.dueDate && (
        <Chip
          title={`Due ${task.dueDate}`}
          className={cn(
            late && 'rounded-full bg-destructive/10 px-2 py-0.5 font-bold text-destructive',
            done && 'line-through',
          )}
        >
          <CalendarDays />
          {formatDayShort(task.dueDate, today)}
        </Chip>
      )}
      {task.scheduledDate && !done && (
        <Chip title={`Scheduled for ${task.scheduledDate}`}>
          <CalendarClock />
          {formatDayShort(task.scheduledDate, today)}
        </Chip>
      )}
      {task.series && !done && (
        <Chip title={describeTaskRepeat(task.series.repeat, task.series.start)}>
          <Repeat2 />
          <span className="sr-only">
            Repeats: {describeTaskRepeat(task.series.repeat, task.series.start)}
          </span>
        </Chip>
      )}
      {remind && (
        <Chip title={`Reminder: ${remind}`}>
          <Bell />
          {remind.replace(/^Today at /, '')}
        </Chip>
      )}
      {task.subtasks.total > 0 && (
        <Chip title="Subtasks done">
          <ListChecks />
          {task.subtasks.done}/{task.subtasks.total}
        </Chip>
      )}
      {goal && (
        <Chip title={`Goal: ${goal.title}`} className="max-w-40">
          <Target />
          <span className="truncate">{goal.title}</span>
        </Chip>
      )}
      {task.effort && <EffortBadge effort={task.effort} />}
    </>
  );
}
