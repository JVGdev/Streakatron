// The weekly review (D45): six short steps, each skippable, about 5 minutes. Summary → stalled
// projects → inbox → next actions → active / parked → reflection. Finishing earns 50 XP once a
// week. Offered on Today from the week's last day; open from the sidebar any day.

import type { RichDoc } from '@streakatron/shared/rich';
import { formatMinutes } from '@streakatron/shared/quests';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, Check, CircleCheck, Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ComboPicker } from '@/components/combo-picker';
import { EntityIcon } from '@/components/entity-icon';
import { NumberGoalProgress, TimeGoalProgress } from '@/components/goals-panel';
import { PageHeader } from '@/components/page-header';
import { RichEditor } from '@/components/rich-editor';
import { TaskListView } from '@/components/task-list-view';
import { Button } from '@/components/ui/button';
import { useOpenSheet } from '@/hooks/use-open-task';
import { useReviewActions, useStructureActions } from '@/lib/actions';
import { useAutosave } from '@/lib/autosave';
import { formatDayShort, goalDue } from '@/lib/days';
import { countsTowardLimit, useProjectStatus } from '@/lib/project-status';
import {
  meQuery,
  projectsQuery,
  reviewQuery,
  tasksQuery,
  type Project,
  type Review,
  type WeekReview,
} from '@/lib/queries';
import { DEFAULT_LIST } from '@/lib/task-list';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/review')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(reviewQuery),
      context.queryClient.ensureQueryData(projectsQuery),
    ]),
  component: ReviewPage,
});

const STEPS = [
  { key: 'summary', title: 'Your week', hint: 'What got done.' },
  { key: 'stalled', title: 'Stalled projects', hint: 'Active, but nothing moved this week.' },
  { key: 'inbox', title: 'Inbox', hint: 'Give each task a project, finish it or let it go.' },
  { key: 'next', title: 'Next actions', hint: 'One clear next step for each active project.' },
  { key: 'projects', title: 'Active and parked', hint: 'What you work on next week.' },
  { key: 'reflection', title: 'Reflection', hint: 'A few lines for yourself.' },
] as const;

function ReviewPage() {
  const { data } = useQuery(reviewQuery);
  const { data: me } = useQuery(meQuery);
  const qc = useQueryClient();
  const actions = useReviewActions();
  const [step, setStep] = useState(0);
  const started = useRef(false);

  // The week's review row, made on the first look (the reflection saves into it).
  useEffect(() => {
    if (!data || data.review || started.current) return;
    started.current = true;
    void actions.start().then(() => qc.invalidateQueries({ queryKey: ['review'] }));
  }, [data, actions, qc]);

  if (!data || !me) return null;
  const today = data.today;
  const range = `${formatDayShort(data.week.start, today)} – ${formatDayShort(data.week.end, today)}`;
  const done = !!data.review?.completedAt;
  const current = STEPS[step]!;
  const last = step === STEPS.length - 1;

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Weekly review"
        description={
          <>
            {range}
            {done && (
              <span className="ml-2 inline-flex items-center gap-1 font-semibold text-ember">
                <CircleCheck className="size-4" aria-hidden />
                Done
              </span>
            )}
          </>
        }
      />

      <nav aria-label="Review steps" className="grid gap-2">
        <div className="flex gap-1.5">
          {STEPS.map((s, i) => (
            <button
              key={s.key}
              type="button"
              aria-label={`Step ${i + 1}: ${s.title}`}
              aria-current={i === step ? 'step' : undefined}
              onClick={() => setStep(i)}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors',
                i < step ? 'bg-ember' : i === step ? 'bg-ember/60' : 'bg-muted',
              )}
            />
          ))}
        </div>
        <p className="text-xs font-semibold text-muted-foreground">
          Step {step + 1} of {STEPS.length}
        </p>
      </nav>

      <section
        aria-labelledby="review-step"
        className="rounded-3xl border-2 bg-card p-4 shadow-ledge sm:p-6"
      >
        <h2 id="review-step" className="text-2xl">
          {current.title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{current.hint}</p>
        <div className="mt-5">
          {current.key === 'summary' && <SummaryStep data={data} />}
          {current.key === 'stalled' && <StalledStep ids={data.stalled} />}
          {current.key === 'inbox' && <InboxStep />}
          {current.key === 'next' && <NextActionsStep />}
          {current.key === 'projects' && (
            <ProjectsStep limit={me.settings.activeProjectLimit} since={data.week.start} />
          )}
          {current.key === 'reflection' &&
            (data.review ? (
              <ReflectionStep key={data.review.id} review={data.review} />
            ) : (
              <div className="h-24 animate-pulse rounded-xl bg-muted" />
            ))}
        </div>
      </section>

      {!last && (
        <div className="flex items-center gap-2">
          {step > 0 && (
            <Button variant="ghost" onClick={() => setStep(step - 1)}>
              <ArrowLeft />
              Back
            </Button>
          )}
          <span className="flex-1" />
          <Button onClick={() => setStep(step + 1)}>
            Next
            <ArrowRight />
          </Button>
        </div>
      )}
      {last && (
        <Button variant="ghost" onClick={() => setStep(step - 1)}>
          <ArrowLeft />
          Back
        </Button>
      )}
    </div>
  );
}

// --- Steps -----------------------------------------------------------------------------------

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-2xl border-2 bg-background px-3 py-2.5">
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      <div className="font-display text-2xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

const SHOWN_TASKS = 6;

function SummaryStep({ data }: { data: WeekReview }) {
  const open = useOpenSheet();
  const { data: projects = [] } = useQuery(projectsQuery);
  const byId = new Map(projects.map((p) => [p.id, p]));
  const s = data.summary;
  const focus = s.focus.reduce((sum, f) => sum + f.minutes, 0);
  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label="Active days"
          value={`${s.activeDays}`}
          sub={`target ${s.weeklyTarget}${s.activeDays >= s.weeklyTarget ? ' · made it' : ''}`}
        />
        <Stat label="Tasks done" value={s.tasksDone.length} />
        <Stat label="Focus" value={focus ? formatMinutes(focus) : '0'} />
        <Stat label="Commitments met" value={s.commitmentsMet} />
      </div>
      {s.xp > 0 && (
        <p className="-mt-3 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{s.xp} XP</span> earned this week.
        </p>
      )}

      {s.tasksDone.length > 0 && (
        <div className="grid gap-1.5">
          <h3 className="text-sm font-semibold text-muted-foreground">Done</h3>
          <ul className="grid gap-1 text-sm">
            {s.tasksDone.slice(0, SHOWN_TASKS).map((t) => (
              <li key={t.id} className="flex items-center gap-2">
                <Check className="size-3.5 shrink-0 text-ember" aria-hidden />
                <button
                  className="truncate text-left hover:underline"
                  onClick={() => open('task', t.id)}
                >
                  {t.title}
                </button>
              </li>
            ))}
          </ul>
          {s.tasksDone.length > SHOWN_TASKS && (
            <p className="text-xs text-muted-foreground">
              and {s.tasksDone.length - SHOWN_TASKS} more
            </p>
          )}
        </div>
      )}

      {s.focus.length > 0 && (
        <div className="grid gap-1.5">
          <h3 className="text-sm font-semibold text-muted-foreground">Focus by project</h3>
          <ul className="grid gap-1.5 text-sm">
            {s.focus.map((f) => {
              const p = f.projectId ? byId.get(f.projectId) : undefined;
              return (
                <li key={f.projectId ?? 'none'} className="grid gap-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      {p && <EntityIcon icon={p.icon} color={p.color} size="sm" />}
                      <span className="truncate">{p?.title ?? 'No project'}</span>
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {formatMinutes(f.minutes)}
                    </span>
                  </span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <span
                      className="block h-full rounded-full bg-ember"
                      style={{ width: `${(f.minutes / s.focus[0]!.minutes) * 100}%` }}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {data.goals.length > 0 && (
        <div className="grid gap-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Goals</h3>
          <ul className="grid gap-3">
            {data.goals.map((g) => {
              const due = goalDue(g, data.today);
              return (
                <li key={g.id} className="grid gap-1 text-sm">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <button
                      className="text-left font-medium hover:underline"
                      onClick={() => open('goal', g.id)}
                    >
                      {g.title}
                    </button>
                    {due && (
                      <span
                        className={cn(
                          'text-xs text-muted-foreground',
                          due.late && 'text-destructive',
                        )}
                      >
                        {due.text}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {g.progress && <TimeGoalProgress progress={g.progress} period={g.period} />}
                    {g.numbers && <NumberGoalProgress goal={g} />}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function ProjectLine({ project, children }: { project: Project; children?: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border-2 bg-background px-3 py-2.5">
      <Link
        to="/projects/$projectId"
        params={{ projectId: project.id }}
        className="flex min-w-36 flex-1 items-center gap-2 text-sm font-medium hover:underline"
      >
        <EntityIcon icon={project.icon} color={project.color} size="sm" />
        <span className="truncate">{project.title}</span>
      </Link>
      {children && <span className="flex flex-wrap items-center gap-1">{children}</span>}
    </li>
  );
}

const Empty = ({ children }: { children: ReactNode }) => (
  <p className="rounded-2xl border-2 border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
    {children}
  </p>
);

function StalledStep({ ids }: { ids: string[] }) {
  const { data: projects = [] } = useQuery(projectsQuery);
  const change = useProjectStatus();
  const stalled = projects.filter((p) => ids.includes(p.id) && p.status === 'active');
  if (!stalled.length) return <Empty>Every active project moved this week.</Empty>;
  return (
    <ul className="grid gap-2">
      {stalled.map((p) => (
        <ProjectLine key={p.id} project={p}>
          <span className="w-full text-xs text-muted-foreground sm:w-auto">
            {p.nextAction ? `Next: ${p.nextAction.title}` : 'No next action'}
          </span>
          {!p.required && (
            <Button size="sm" variant="ghost" onClick={() => void change(p, 'parked')}>
              <Pause />
              Park
            </Button>
          )}
        </ProjectLine>
      ))}
    </ul>
  );
}

function InboxStep() {
  const { data: tasks = [] } = useQuery(tasksQuery({ project: 'inbox' }));
  const open = tasks.filter((t) => !t.completedAt);
  if (!open.length) return <Empty>The inbox is clear.</Empty>;
  return (
    <TaskListView
      tasks={open}
      showProject={false}
      triage
      options={{ ...DEFAULT_LIST, project: 'inbox', sort: 'board', group: 'none' }}
      empty="The inbox is clear."
    />
  );
}

function NextActionsStep() {
  const { data: projects = [] } = useQuery(projectsQuery);
  const active = projects.filter((p) => p.status === 'active');
  if (!active.length) return <Empty>No active projects.</Empty>;
  return (
    <ul className="grid gap-2">
      {active.map((p) => (
        <NextActionLine key={p.id} project={p} />
      ))}
    </ul>
  );
}

function NextActionLine({ project }: { project: Project }) {
  const structure = useStructureActions();
  const { data: tasks = [] } = useQuery(tasksQuery({ project: project.id, status: 'open' }));
  const options = tasks
    .filter((t) => !t.parentTaskId)
    .map((t) => ({ value: t.id, label: t.title }));
  return (
    <ProjectLine project={project}>
      {options.length ? (
        <ComboPicker
          size="sm"
          aria-label={`Next action for ${project.title}`}
          className="max-w-[16rem]"
          value={project.nextAction?.id ?? null}
          placeholder="Pick a task"
          searchPlaceholder="Find a task…"
          options={options}
          onChange={(id) => void structure.updateProject(project.id, { nextActionTaskId: id })}
        />
      ) : (
        <span className="text-xs text-muted-foreground">No open tasks</span>
      )}
    </ProjectLine>
  );
}

function ProjectsStep({ limit, since }: { limit: number; since: string }) {
  const { data: projects = [] } = useQuery(projectsQuery);
  const change = useProjectStatus();
  const review = useReviewActions();
  const counted = projects.filter(countsTowardLimit);
  const required = projects.filter((p) => p.status === 'active' && p.required);
  const parked = projects.filter((p) => p.status === 'parked');
  // Kept parked in this review (or since the week began).
  const kept = (p: Project) => !!p.reviewedAt && p.reviewedAt.slice(0, 10) >= since;
  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <h3 className="text-sm font-semibold text-muted-foreground">
          Active · {counted.length} of {limit}
        </h3>
        {counted.length ? (
          <ul className="grid gap-2">
            {counted.map((p) => (
              <ProjectLine key={p.id} project={p}>
                <Button size="sm" variant="ghost" onClick={() => void change(p, 'parked')}>
                  <Pause />
                  Park
                </Button>
              </ProjectLine>
            ))}
          </ul>
        ) : (
          <Empty>Nothing active. Start a parked project below.</Empty>
        )}
      </div>

      {required.length > 0 && (
        <div className="grid gap-2">
          <h3 className="text-sm font-semibold text-muted-foreground">
            Required · outside the limit
          </h3>
          <ul className="grid gap-2">
            {required.map((p) => (
              <ProjectLine key={p.id} project={p} />
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-2">
        <h3 className="text-sm font-semibold text-muted-foreground">Parked</h3>
        {parked.length ? (
          <ul className="grid gap-2">
            {parked.map((p) => (
              <ProjectLine key={p.id} project={p}>
                <Button size="sm" variant="ghost" onClick={() => void change(p, 'active')}>
                  <Play />
                  Start
                </Button>
                {kept(p) ? (
                  <span className="inline-flex items-center gap-1 px-2 text-xs font-semibold text-muted-foreground">
                    <Check className="size-3.5" aria-hidden />
                    Kept parked
                  </span>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => void review.keepParked(p)}>
                    Keep parked
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => void change(p, 'completed')}>
                  <Check />
                  Close
                </Button>
              </ProjectLine>
            ))}
          </ul>
        ) : (
          <Empty>No parked projects.</Empty>
        )}
      </div>
    </div>
  );
}

function ReflectionStep({ review }: { review: Review }) {
  const actions = useReviewActions();
  const [reflection, setReflection] = useState<RichDoc | null>(review.reflection);
  const save = useAutosave({ reflection }, (v) => actions.save(review.id, v.reflection), {
    what: 'the reflection',
  });
  const [finishing, setFinishing] = useState(false);
  const done = !!review.completedAt;
  return (
    <div className="grid gap-4">
      <RichEditor
        aria-label="Reflection"
        value={review.reflection}
        onChange={setReflection}
        placeholder="What went well? What got in the way? What matters next week? Type @ to link."
        className="min-h-32"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={finishing}
          onClick={async () => {
            setFinishing(true);
            await save.flush();
            await actions.finish(review.id, reflection);
            setFinishing(false);
          }}
        >
          <CircleCheck />
          {done ? 'Save' : 'Finish review'}
        </Button>
        {done ? (
          <span className="text-sm text-muted-foreground">
            Done for this week.{' '}
            <Link to="/today" className="font-semibold underline-offset-2 hover:underline">
              Back to Today
            </Link>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Saves as you type.</span>
        )}
      </div>
    </div>
  );
}
