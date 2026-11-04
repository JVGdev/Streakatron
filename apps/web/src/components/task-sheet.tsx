// A task's details, in a side sheet opened by the `task` search param from anywhere in the app.
// Title and description save as you type (useAutosave); the other fields save on change.

import type { RichDoc } from '@streaktron/shared/rich';
import { EFFORTS, type Effort } from '@streaktron/shared/structure';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Check, Pin, PinOff, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useOpenTask } from '@/hooks/use-open-task';
import { useStructureActions, useTaskActions } from '@/lib/actions';
import { ApiError } from '@/lib/api';
import { useAutosave } from '@/lib/autosave';
import { CATEGORY_DOT, EFFORT_LABEL } from '@/lib/look';
import {
  meQuery,
  projectQuery,
  projectsQuery,
  taskQuery,
  tasksQuery,
  type Task,
  type TaskDetail,
} from '@/lib/queries';
import { cn } from '@/lib/utils';
import { Backlinks } from './backlinks';
import { DayField } from './day-field';
import { EntityIcon } from './entity-icon';
import { RichEditor } from './rich-editor';
import { SheetBar, TitleField } from './sheet-parts';
import { QuickAdd } from './quick-add';
import { TaskCheck } from './task-check';
import { EffortBars } from './task-meta';
import { onRowsKeyDown } from '@/lib/rows';
import { TaskRow } from './task-row';

export function TaskSheet({ taskId }: { taskId: string | undefined }) {
  const open = useOpenTask();
  const { data, error, isFetchedAfterMount } = useQuery({
    ...taskQuery(taskId ?? ''),
    enabled: !!taskId,
  });

  useEffect(() => {
    if (error instanceof ApiError && error.status === 404) {
      toast.error('That task doesn’t exist anymore.');
      open(undefined);
    }
  }, [error, open]);

  return (
    <Sheet open={!!taskId} onOpenChange={(o) => !o && open(undefined)}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl"
        aria-describedby={undefined}
      >
        {/* The editors start from what they're given: never from a cached copy that another
            device may have changed since (it would be saved over the newer text). */}
        {data && isFetchedAfterMount ? (
          <TaskEditor key={data.id} task={data} />
        ) : (
          <div className="p-6">
            <SheetTitle className="sr-only">Task</SheetTitle>
            <div className="h-6 w-2/3 animate-pulse rounded bg-muted" />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

const INBOX = 'inbox';
/** Property values read as text and look editable on hover, not as a form of boxes. */
const PROPERTY =
  'w-full max-w-72 border-transparent bg-transparent px-2 shadow-none hover:bg-muted dark:bg-transparent dark:hover:bg-muted';
const NONE = 'none';

function TaskEditor({ task }: { task: TaskDetail }) {
  const tasks = useTaskActions();
  const structure = useStructureActions();
  const openTask = useOpenTask();
  const { data: me } = useQuery(meQuery);
  const { data: projects = [] } = useQuery(projectsQuery);
  const { data: page } = useQuery({
    ...projectQuery(task.projectId ?? ''),
    enabled: !!task.projectId,
  });
  const today = me?.today ?? '';
  const isSubtask = task.parentTaskId !== null;
  const project = projects.find((p) => p.id === task.projectId);
  const { data: parent } = useQuery({
    ...taskQuery(task.parentTaskId ?? ''),
    enabled: isSubtask,
  });

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState<RichDoc | null>(task.description);
  const save = useAutosave(
    { title, description },
    (v) => (v.title.trim() ? tasks.save(task.id, v) : Promise.resolve()),
    { what: 'the task' },
  );

  const pinned = project?.nextAction?.pinned && project.nextAction.id === task.id;
  const canPin = !!project && !isSubtask && task.completedAt === null;

  return (
    <div className="flex min-h-full flex-col">
      <SheetBar status={save.status} onClose={() => openTask(undefined)}>
        {isSubtask && parent ? (
          <button className="hover:underline" onClick={() => openTask(parent.id)}>
            ↑ {parent.title}
          </button>
        ) : project ? (
          <Link
            to="/projects/$projectId"
            params={{ projectId: project.id }}
            className="inline-flex items-center gap-1.5 hover:underline"
          >
            <EntityIcon icon={project.icon} color={project.color} size="sm" />
            {project.title}
          </Link>
        ) : (
          'Inbox'
        )}
      </SheetBar>

      <div className="grid gap-6 px-4 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          <TaskCheck task={task} onToggle={() => void tasks.toggle(task)} className="mt-2" />
          <SheetTitle className="sr-only">{task.title}</SheetTitle>
          <SheetDescription className="sr-only">Task details</SheetDescription>
          <TitleField value={title} onChange={setTitle} what="task" struck={!!task.completedAt} />
        </div>

        <div className="grid grid-cols-[6.5rem_1fr] items-center gap-x-2 gap-y-1 text-sm">
          <Label className="text-muted-foreground">Project</Label>
          <Select
            value={task.projectId ?? INBOX}
            disabled={isSubtask}
            onValueChange={(v) => void tasks.update(task, { projectId: v === INBOX ? null : v })}
          >
            <SelectTrigger className={PROPERTY} size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={INBOX}>Inbox</SelectItem>
              {projects
                .filter((p) => p.status !== 'archived' || p.id === task.projectId)
                .map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <EntityIcon icon={p.icon} color={p.color} size="sm" />
                    {p.title}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>

          {page && !isSubtask && (
            <>
              <Label className="text-muted-foreground">Column</Label>
              <ColumnSelect task={task} />
            </>
          )}

          {page && (
            <>
              <Label className="text-muted-foreground">Goal</Label>
              <Select
                value={
                  task.goalId && page.goals.some((g) => g.id === task.goalId) ? task.goalId : NONE
                }
                onValueChange={(v) => void tasks.update(task, { goalId: v === NONE ? null : v })}
              >
                <SelectTrigger className={PROPERTY} size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No goal</SelectItem>
                  {page.goals.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}

          <Label className="text-muted-foreground">Effort</Label>
          <div className="flex gap-1" role="radiogroup" aria-label="Effort">
            {[...EFFORTS, null].map((e) => (
              <Button
                key={e ?? 'none'}
                type="button"
                size="sm"
                variant={task.effort === e ? 'secondary' : 'ghost'}
                role="radio"
                aria-checked={task.effort === e}
                className={cn(
                  'h-8 gap-1.5 px-2.5 text-xs',
                  task.effort === e ? 'ring-1 ring-ring/40' : 'text-muted-foreground',
                )}
                onClick={() => void tasks.update(task, { effort: e as Effort | null })}
              >
                {e ? (
                  <>
                    <EffortBars effort={e} />
                    {EFFORT_LABEL[e]}
                  </>
                ) : (
                  'None'
                )}
              </Button>
            ))}
          </div>

          <Label htmlFor="task-due" className="text-muted-foreground">
            Due
          </Label>
          <DayField
            id="task-due"
            value={task.dueDate}
            onChange={(dueDate) => void tasks.update(task, { dueDate })}
          />

          <Label htmlFor="task-scheduled" className="text-muted-foreground">
            Scheduled
          </Label>
          <DayField
            id="task-scheduled"
            value={task.scheduledDate}
            placeholder="Not scheduled"
            onChange={(scheduledDate) => void tasks.update(task, { scheduledDate })}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="task-description" className="text-muted-foreground">
            Description
          </Label>
          <RichEditor
            id="task-description"
            aria-label="Description"
            value={task.description}
            onChange={setDescription}
            selfId={task.id}
            placeholder="Notes, what done looks like… Type @ to link a task, goal, project or area."
          />
        </div>

        {!isSubtask && <Subtasks task={task} today={today} />}

        <Backlinks id={task.id} />
      </div>

      <div className="sticky bottom-0 mt-auto flex flex-wrap items-center gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
        {task.completedAt ? (
          <Button variant="outline" size="sm" onClick={() => void tasks.toggle(task)}>
            <RotateCcw />
            Reopen
          </Button>
        ) : (
          <Button size="sm" onClick={() => void tasks.toggle(task)}>
            <Check />
            Complete
          </Button>
        )}
        {canPin && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              void structure.updateProject(project.id, {
                nextActionTaskId: pinned ? null : task.id,
              })
            }
          >
            {pinned ? <PinOff /> : <Pin />}
            {pinned ? 'Unpin next action' : 'Pin as next action'}
          </Button>
        )}
        <span className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={async () => {
            await save.flush();
            openTask(isSubtask ? (task.parentTaskId ?? undefined) : undefined);
            void tasks.remove(task);
          }}
        >
          <Trash2 />
          Delete
        </Button>
      </div>
    </div>
  );
}

function ColumnSelect({ task }: { task: Task }) {
  const tasks = useTaskActions();
  const { data: page } = useQuery(projectQuery(task.projectId!));
  const { data: projectTasks = [] } = useQuery(tasksQuery({ project: task.projectId! }));
  if (!page) return null;
  return (
    <Select
      value={task.columnId ?? undefined}
      onValueChange={(id) => {
        const column = page.columns.find((c) => c.id === id);
        if (!column) return;
        void tasks.move(
          task,
          column,
          0,
          projectTasks.filter((t) => t.columnId === id),
        );
      }}
    >
      <SelectTrigger className={PROPERTY} size="sm">
        <SelectValue placeholder="No column" />
      </SelectTrigger>
      <SelectContent>
        {page.columns.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            <span className={cn('size-2 rounded-full', CATEGORY_DOT[c.category])} />
            {c.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Subtasks({ task, today }: { task: Task; today: string }) {
  const { data: subtasks = [] } = useQuery(tasksQuery({ parent: task.id }));
  const done = subtasks.filter((s) => s.completedAt).length;
  return (
    <section className="grid gap-1" aria-label="Subtasks">
      <h3 className="flex items-baseline gap-2 text-sm font-medium text-muted-foreground">
        Subtasks
        {subtasks.length > 0 && (
          <span className="text-xs font-normal">
            {done}/{subtasks.length}
          </span>
        )}
      </h3>
      <div className="-mx-2 grid" onKeyDown={onRowsKeyDown}>
        {subtasks.map((s) => (
          <TaskRow key={s.id} task={s} today={today} />
        ))}
      </div>
      <QuickAdd className="-mx-2" input={{ parentTaskId: task.id }} placeholder="Add a subtask" />
    </section>
  );
}
