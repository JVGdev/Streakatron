import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ChevronDown, Flame, Plus } from 'lucide-react';
import { useState } from 'react';
import { TaskRow } from '@/components/task-row';
import { Button } from '@/components/ui/button';
import { formatDayLong } from '@/lib/days';
import { FOCUS_VISIBLE, focusList, type FocusReason } from '@/lib/focus';
import { meQuery, projectsQuery, tasksQuery } from '@/lib/queries';
import { onRowsKeyDown } from '@/lib/rows';
import { openPalette } from '@/lib/ui-store';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/today')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(projectsQuery),
      context.queryClient.ensureQueryData(tasksQuery({ status: 'open' })),
    ]),
  component: TodayPage,
});

const REASON_LABEL: Record<FocusReason, string> = {
  overdue: 'Overdue',
  today: 'Today',
  next: 'Up next',
};

function TodayPage() {
  const { data: me } = useQuery(meQuery);
  const { data: projects = [] } = useQuery(projectsQuery);
  const { data: tasks = [] } = useQuery(tasksQuery({ status: 'open' }));
  const [all, setAll] = useState(false);
  if (!me) return null;

  const first = me.user.name.split(/\s+/)[0];
  const items = focusList(tasks, projects, me.today);
  const shown = all ? items : items.slice(0, FOCUS_VISIBLE);
  const byProject = new Map(projects.map((p) => [p.id, p]));
  const hasActive = projects.some((p) => p.status === 'active');

  return (
    <div className="max-w-3xl space-y-8">
      <header>
        <p className="text-sm font-bold text-muted-foreground">{formatDayLong(me.today)}</p>
        <h1 className="mt-1 text-4xl tracking-tight md:text-5xl">Hi, {first}.</h1>
        <p className="mt-2 text-lg font-semibold text-muted-foreground">
          What’s the smallest meaningful thing you can do right now?
        </p>
      </header>

      <section
        aria-label="Today’s focus"
        className="rounded-3xl border-2 bg-card p-3 shadow-ledge-lg sm:p-5"
      >
        <div className="flex items-center justify-between px-1 pb-3">
          <h2 className="text-2xl">Today’s focus</h2>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => openPalette('capture')}
          >
            <Plus />
            Add
          </Button>
        </div>

        {items.length === 0 ? (
          <div className="px-2 pt-4 pb-6 text-center">
            <p className="font-display text-lg font-semibold">Nothing urgent today.</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              {hasActive
                ? 'Your projects have no next action yet. Add a task to one of their boards.'
                : 'Start a project, and its next action shows up here.'}
            </p>
            <Button asChild variant="outline" size="sm" className="mt-4">
              <Link to="/projects">Go to projects</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-2" onKeyDown={onRowsKeyDown}>
            {shown.map((item, i) => (
              <div key={item.task.id}>
                {item.reason !== shown[i - 1]?.reason && (
                  <h3
                    className={cn(
                      'px-1 pb-2 font-sans text-xs font-extrabold tracking-[0.08em] uppercase',
                      item.reason === 'overdue' ? 'text-destructive' : 'text-muted-foreground',
                      i > 0 && 'mt-3',
                    )}
                  >
                    {REASON_LABEL[item.reason]}
                  </h3>
                )}
                <TaskRow
                  tile
                  task={item.task}
                  today={me.today}
                  project={item.task.projectId ? byProject.get(item.task.projectId) : undefined}
                />
              </div>
            ))}
            {items.length > FOCUS_VISIBLE && (
              <button
                className="mt-1 flex items-center gap-1 rounded-xl px-2 py-1.5 text-left text-sm font-bold text-muted-foreground hover:bg-muted/60"
                onClick={() => setAll((a) => !a)}
                aria-expanded={all}
              >
                <ChevronDown className={cn('size-3.5 transition-transform', all && 'rotate-180')} />
                {all ? 'Show fewer' : `${items.length - FOCUS_VISIBLE} more`}
              </button>
            )}
          </div>
        )}
      </section>

      <p className="flex items-center gap-3 rounded-3xl border-2 border-dashed px-5 py-4 text-sm font-semibold text-muted-foreground">
        <Flame className="size-5 shrink-0 fill-ember/20 text-ember" aria-hidden />
        Streaks, XP and quests arrive with the MVP (Phase 3).
      </p>
    </div>
  );
}
