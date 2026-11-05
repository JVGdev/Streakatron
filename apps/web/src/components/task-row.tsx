import { useQuery } from '@tanstack/react-query';
import { FolderInput } from 'lucide-react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useQuickCreate } from '@/hooks/use-quick-create';
import { useOpenTask } from '@/hooks/use-open-task';
import { useTaskActions } from '@/lib/actions';
import { projectsQuery, type Goal, type Project, type Task } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { ComboPicker } from './combo-picker';
import { EntityIcon } from './entity-icon';
import { TaskCheck } from './task-check';
import { TaskMeta } from './task-meta';
import { EarlierOpen } from './task-repeat';

/**
 * One task in a list. Focusable: Enter opens it, X completes or reopens it, J/K or the arrows move
 * between rows (handled by `onRowsKeyDown` on the list).
 */
export function TaskRow({
  task,
  today,
  project,
  goal,
  triage,
  tile,
  actions,
}: {
  task: Task;
  today: string;
  project?: Project;
  goal?: Goal;
  /** Offer "Move to project" on hover, for sorting the inbox without opening each task. */
  triage?: boolean;
  /** A roomy card of its own, with a big check (Today). */
  tile?: boolean;
  /** Buttons at the end of the row (Spotlight's focus and remove). */
  actions?: ReactNode;
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
      className={cn(
        'group flex cursor-pointer items-start gap-3 outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        tile
          ? 'items-center gap-3.5 rounded-2xl border-2 border-muted bg-background p-3 transition-colors hover:border-input'
          : 'rounded-xl px-2 py-2 hover:bg-muted/60 focus-visible:bg-muted',
      )}
    >
      <TaskCheck
        task={task}
        onToggle={() => void tasks.toggle(task)}
        size={tile ? 'lg' : 'md'}
        className={tile ? undefined : 'mt-0.5'}
      />
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            'break-words',
            tile ? 'text-base leading-6 font-bold' : 'text-sm leading-5',
            done && 'text-muted-foreground line-through decoration-muted-foreground/50',
          )}
        >
          {task.title}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 empty:hidden">
          <TaskMeta task={task} today={today} project={project} goal={goal} />
        </div>
        {!done && task.earlierOpen?.length > 0 && <EarlierOpen task={task} onOpen={open} compact />}
      </div>
      {triage && !done && <MoveToProject task={task} />}
      {actions && (
        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          {actions}
        </div>
      )}
    </div>
  );
}

function MoveToProject({ task }: { task: Task }) {
  const tasks = useTaskActions();
  const quick = useQuickCreate();
  const { data: projects = [] } = useQuery(projectsQuery);
  // Active projects first, then parked ones.
  const open = [
    ...projects.filter((p) => p.status === 'active'),
    ...projects.filter((p) => p.status === 'parked'),
  ];
  return (
    <ComboPicker
      value={null}
      align="end"
      searchPlaceholder="Move to a project, or make one…"
      options={open.map((p) => ({
        value: p.id,
        label: p.title,
        icon: <EntityIcon icon={p.icon} color={p.color} size="sm" />,
        hint: p.status === 'parked' ? 'parked' : undefined,
      }))}
      onChange={(projectId) => void tasks.update(task, { projectId })}
      create={{ noun: 'project', run: (t) => quick.project(t) }}
      trigger={
        <Button
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 gap-1.5 px-2 text-xs text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 max-md:opacity-100"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <FolderInput />
          <span className="max-sm:sr-only">Move to…</span>
        </Button>
      }
    />
  );
}
