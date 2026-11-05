import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ChevronDown, ClipboardCheck, Play, Plus, Timer } from 'lucide-react';
import { useState } from 'react';
import { CommitmentRow } from '@/components/commitment-row';
import { doneToday } from '@/lib/commitments';
import { NotifyBanner } from '@/components/notify-banner';
import { ProgressStrip } from '@/components/progress-strip';
import { QuestBoard } from '@/components/quest-board';
import { SpotlightSection } from '@/components/spotlight';
import { TodayEvents } from '@/components/calendar-parts';
import { TaskRow } from '@/components/task-row';
import { Button } from '@/components/ui/button';
import { clockText, sessionLabel, useFocus, useQuickFocus } from '@/hooks/use-focus';
import { useOpenSheet } from '@/hooks/use-open-task';
import { formatDayLong } from '@/lib/days';
import { useTimeShown } from '@/lib/focus-timer';
import { FOCUS_VISIBLE, todayItems, type FocusReason, type TodayItem } from '@/lib/focus';
import {
  calendarQuery,
  commitmentsQuery,
  focusQuery,
  gameQuery,
  meQuery,
  projectsQuery,
  questsQuery,
  reviewStatusQuery,
  spotlightQuery,
  tasksQuery,
  type Commitment,
  type Project,
} from '@/lib/queries';
import { onRowsKeyDown } from '@/lib/rows';
import { openPalette } from '@/lib/ui-store';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/today')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(projectsQuery),
      context.queryClient.ensureQueryData(tasksQuery({ status: 'open' })),
      context.queryClient.ensureQueryData(commitmentsQuery()),
      context.queryClient.prefetchQuery(spotlightQuery),
      context.queryClient.prefetchQuery(gameQuery),
      context.queryClient.prefetchQuery(focusQuery),
      context.queryClient.prefetchQuery(questsQuery),
    ]),
  component: TodayPage,
});

const REASON_LABEL: Record<FocusReason | 'commitment', string> = {
  overdue: 'Overdue',
  today: 'Today',
  follow_up: 'Follow up',
  commitment: 'Commitments',
  next: 'Up next',
};

const itemKey = (i: TodayItem) => (i.kind === 'task' ? i.task.id : i.commitment.id);

/** Commitments that rest with their parked (completed, archived) project, like its tasks. */
const resting = (c: Commitment, projects: Project[]) =>
  !!c.projectId && projects.find((p) => p.id === c.projectId)?.status !== 'active';

function TodayPage() {
  const { data: me } = useQuery(meQuery);
  const { data: projects = [] } = useQuery(projectsQuery);
  const { data: tasks = [] } = useQuery(tasksQuery({ status: 'open' }));
  const { data: commitments = [] } = useQuery(commitmentsQuery());
  const { data: todayCal } = useQuery({
    ...calendarQuery(me?.today ?? '', me?.today ?? ''),
    enabled: !!me,
  });
  const [all, setAll] = useState(false);
  if (!me) return null;

  const first = me.user.name.split(/\s+/)[0];
  const todays = commitments.filter((c) => c.day.scheduled && !resting(c, projects));
  const due = todays.filter((c) => !doneToday(c));
  const doneCommitments = todays.filter((c) => doneToday(c));
  const items = todayItems(tasks, projects, due, me.today);
  const shown = all ? items : items.slice(0, FOCUS_VISIBLE);
  const byProject = new Map(projects.map((p) => [p.id, p]));
  const hasActive = projects.some((p) => p.status === 'active');
  // With nothing urgent, "Start focus" goes to the first spotlighted task.
  const spotlit = tasks.find(
    (t) => t.spotlightedAt && (!t.projectId || byProject.get(t.projectId)?.status === 'active'),
  );
  const top: TodayItem | undefined =
    items[0] ?? (spotlit ? { kind: 'task', task: spotlit, reason: 'next' } : undefined);

  return (
    <div className="max-w-3xl space-y-8">
      <ProgressStrip />
      <header>
        <p className="text-sm font-bold text-muted-foreground">{formatDayLong(me.today)}</p>
        <h1 className="mt-1 text-4xl tracking-tight md:text-5xl">Hi, {first}.</h1>
        <p className="mt-2 text-lg font-semibold text-muted-foreground">
          What’s the smallest meaningful thing you can do right now?
        </p>
      </header>

      <NotifyBanner commitments={commitments} tasks={tasks} today={me.today} />

      <FocusLauncher top={top} minutes={me.settings.focusPresets[0]?.focusMinutes} />

      <ReviewPrompt />

      <TodayEvents
        events={todayCal?.events ?? []}
        projects={new Map(projects.map((p) => [p.id, p]))}
      />

      <SpotlightSection tasks={tasks} projects={projects} today={me.today} />

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

        {items.length === 0 && doneCommitments.length > 0 ? (
          <p className="px-2 pt-2 pb-4 text-center font-display text-lg font-semibold">
            All done for today.
          </p>
        ) : items.length === 0 ? (
          <div className="px-2 pt-4 pb-6 text-center">
            <p className="font-display text-lg font-semibold">Nothing urgent today.</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              {hasActive
                ? 'No project has a next action. Add a task to a board.'
                : 'Start a project, and its next action shows up here.'}
            </p>
            <Button asChild variant="outline" size="sm" className="mt-4">
              <Link to="/projects">Go to projects</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-2" onKeyDown={onRowsKeyDown}>
            {shown.map((item, i) => (
              <div key={itemKey(item)}>
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
                {item.kind === 'task' ? (
                  <TaskRow
                    tile
                    task={item.task}
                    today={me.today}
                    project={item.task.projectId ? byProject.get(item.task.projectId) : undefined}
                  />
                ) : (
                  <CommitmentRow
                    tile
                    commitment={item.commitment}
                    weekStart={me.settings.weekStart}
                  />
                )}
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
        <DoneToday commitments={doneCommitments} />
      </section>

      <QuestBoard />
    </div>
  );
}

/** The weekly review, offered from the week's last day until it's done (D45). */
function ReviewPrompt() {
  const { data } = useQuery(reviewStatusQuery);
  if (!data?.offered) return null;
  return (
    <Link
      to="/review"
      className="flex items-center gap-3.5 rounded-2xl border-2 border-ember/40 bg-ember/10 p-3 transition-colors hover:border-ember/70"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ember/20 text-ember">
        <ClipboardCheck className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold">Time for your weekly review</span>
      </span>
      <span className="hidden shrink-0 text-sm font-bold text-ember sm:block">Start</span>
    </Link>
  );
}

/** Commitments done for today, folded into one line (D31); each opens its sheet. */
function DoneToday({ commitments }: { commitments: Commitment[] }) {
  const open = useOpenSheet();
  if (!commitments.length) return null;
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 px-1 text-sm text-muted-foreground">
      <span className="font-sans text-xs font-extrabold tracking-[0.08em] uppercase">
        Done today
      </span>
      {commitments.map((c, i) => (
        <span key={c.id}>
          <button
            className="font-semibold text-foreground/80 hover:underline"
            onClick={() => open('commitment', c.id)}
          >
            {c.title}
          </button>
          {i < commitments.length - 1 && ' ·'}
        </span>
      ))}
    </p>
  );
}

/** The big "Start focus" (plan.md §4.3): one click, on the top item; or the running session. */
function FocusLauncher({ top, minutes = 25 }: { top?: TodayItem; minutes?: number }) {
  const { session, clock, state } = useFocus();
  const quick = useQuickFocus();
  const shown = useTimeShown(session?.id);

  if (session && clock) {
    return (
      <Link
        to="/focus"
        className="flex items-center gap-4 rounded-3xl border-2 bg-card p-4 shadow-ledge transition-colors hover:bg-muted/50"
      >
        <span className="grid size-12 place-items-center rounded-2xl bg-glow text-glow-foreground">
          <Timer className="size-6" strokeWidth={2.6} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase">
            {session.status === 'paused' ? 'Paused' : 'Focusing'}
          </span>
          <span className="block truncate font-display text-lg font-semibold">
            {sessionLabel(session)}
          </span>
        </span>
        {shown && (
          <span className="font-display text-3xl font-semibold tabular-nums">
            {clockText(clock)}
          </span>
        )}
      </Link>
    );
  }

  const today = state?.today;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Button
        size="lg"
        className="h-14 rounded-2xl px-6 text-lg"
        onClick={() =>
          void quick(
            top?.kind === 'task'
              ? { taskId: top.task.id }
              : top
                ? { commitmentId: top.commitment.id }
                : undefined,
          )
        }
      >
        <Play className="size-5" />
        Start focus · {minutes} min
      </Button>
      <div className="min-w-0 flex-1 text-sm">
        {top && (
          <p className="truncate font-bold">
            <span className="text-muted-foreground">on </span>
            {top.kind === 'task' ? top.task.title : top.commitment.title}
          </p>
        )}
        <p className="text-muted-foreground">
          <Link
            to="/focus"
            search={top ? { on: itemKey(top) } : {}}
            className="font-bold underline-offset-2 hover:underline"
          >
            Other length or task
          </Link>
          {today && today.minutes > 0 && ` · ${today.minutes} min focused today`}
        </p>
      </div>
    </div>
  );
}
