import type { KeyboardEvent } from 'react';
import { useOpenTask } from '@/hooks/use-open-task';
import { useTaskActions } from '@/lib/actions';
import type { Goal, Project, Task } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { TaskCheck } from './task-check';
import { TaskMeta } from './task-meta';

/**
 * One task in a list. Focusable: Enter opens it, X completes or reopens it, J/K or the arrows move
 * between rows (handled by `onRowsKeyDown` on the list).
 */
export function TaskRow({
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
  const open = useOpenTask();
  const tasks = useTaskActions();
  const done = task.completedAt !== null;

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      open(task.id);
    } else if (e.key === 'x') {
      e.preventDefault();
      void tasks.toggle(task);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      data-task-row
      onClick={() => open(task.id)}
      onKeyDown={onKeyDown}
      className="group flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 outline-none hover:bg-muted/60 focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <TaskCheck task={task} onToggle={() => void tasks.toggle(task)} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            'text-sm leading-5 break-words',
            done && 'text-muted-foreground line-through decoration-muted-foreground/50',
          )}
        >
          {task.title}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 empty:hidden">
          <TaskMeta task={task} today={today} project={project} goal={goal} />
        </div>
      </div>
    </div>
  );
}
