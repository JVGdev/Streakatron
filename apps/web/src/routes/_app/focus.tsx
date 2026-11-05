// The focus page (D29): start a session (preset, task or project), run it in a big calm ring, then
// finish with a note, the task (or commitment) marked done, and a break. `?on=tsk_…|prj_…|cmt_…`
// picks what to focus on.

import { autoFinishAt, FOCUS_LIMITS, focusCounts, formatClock } from '@streakatron/shared/focus';
import { GAME } from '@streakatron/shared/game';
import type { FocusPreset } from '@streakatron/shared/schemas';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Check, Coffee, Eye, EyeOff, Flag, Pause, Play, SkipForward } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';
import { AttachPicker, FocusRing, MinutesField, type Attachment } from '@/components/focus-timer';
import { clockText, sessionLabel, useBreak, useFocus } from '@/hooks/use-focus';
import { SaveState } from '@/components/sheet-parts';
import { SessionNotes } from '@/components/session-notes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useOpenSheet, useOpenTask } from '@/hooks/use-open-task';
import { useCommitmentActions, useFocusActions, useTaskActions } from '@/lib/actions';
import { useAutosave } from '@/lib/autosave';
import { entityQuery } from '@/lib/entities';
import {
  endBreak,
  markSeen,
  seenSession,
  serverNow,
  setTimeShown,
  startBreak,
  useFocusMemory,
  useTimeShown,
} from '@/lib/focus-timer';
import { focusQuery, meQuery, taskQuery, type FocusSession, type FocusState } from '@/lib/queries';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/focus')({
  validateSearch: z.object({ on: z.string().optional() }),
  loader: ({ context }) => context.queryClient.ensureQueryData(focusQuery),
  component: FocusPage,
});

/** A finished session's card stays up (across reloads) this long, until it's closed. */
const CARD_HOURS = 6;

function FocusPage() {
  const { on } = Route.useSearch();
  const { state, session } = useFocus();
  const brk = useBreak();
  const seen = useFocusMemory(seenSession);
  const last = state?.last;
  const showCard =
    !session &&
    last?.status === 'completed' &&
    last.id !== seen &&
    serverNow() - Date.parse(last.endedAt!) < CARD_HOURS * 3_600_000;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header className="flex items-end justify-between gap-4">
        <h1 className="text-4xl tracking-tight">Focus</h1>
        {state && <TodaySummary today={state.today} />}
      </header>
      {session ? (
        <Running session={session} />
      ) : showCard ? (
        <FinishCard session={last} />
      ) : brk && !brk.over ? (
        <BreakView remainingMs={brk.remainingMs} minutes={brk.minutes} sessionId={last?.id} />
      ) : (
        <StartPanel key={on ?? ''} last={last ?? null} />
      )}
    </div>
  );
}

function TodaySummary({ today }: { today: FocusState['today'] }) {
  if (!today.sessions) return null;
  return (
    <p className="pb-1 text-sm font-bold text-muted-foreground">
      Today: <span className="text-foreground">{today.minutes} min</span> in {today.sessions}{' '}
      {today.sessions === 1 ? 'session' : 'sessions'}
    </p>
  );
}

const Panel = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <section
    className={cn(
      'flex flex-col items-center gap-6 rounded-3xl border-2 bg-card px-5 py-8 shadow-ledge-lg sm:px-8',
      className,
    )}
  >
    {children}
  </section>
);

// --- Running ---------------------------------------------------------------------------------

function Running({ session }: { session: FocusSession }) {
  const { clock } = useFocus();
  const focus = useFocusActions();
  const openTask = useOpenTask();
  const openSheet = useOpenSheet();
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const [busy, setBusy] = useState(false);
  const shown = useTimeShown(session.id);
  if (!clock) return null;
  const paused = session.status === 'paused';
  const minutes = Math.floor(clock.focusedMs / 60_000);
  const capAt = autoFinishAt(session);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };

  return (
    <Panel>
      <span
        className={cn(
          'rounded-full px-3 py-1 text-xs font-extrabold tracking-[0.08em] uppercase',
          paused
            ? 'bg-muted text-muted-foreground'
            : clock.phase === 'overtime'
              ? 'bg-primary text-primary-foreground'
              : 'bg-glow text-glow-foreground',
        )}
      >
        {paused ? 'Paused' : clock.phase === 'overtime' ? 'Overtime' : 'Focusing'}
      </span>

      <FocusRing
        progress={shown ? clock.progress : 1}
        tone={paused ? 'paused' : shown ? clock.phase : 'calm'}
        size={272}
        className="max-w-full"
      >
        {/* Hidden by default for each new session (D41); a click on the ring shows or hides it. */}
        <button
          className="grid size-52 place-content-center rounded-full text-center outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          aria-label={shown ? 'Hide the time' : 'Show the time'}
          aria-pressed={shown}
          onClick={() => setTimeShown(session.id, !shown)}
        >
          {shown ? (
            <>
              <span
                className={cn(
                  'font-display text-6xl font-semibold tracking-tight tabular-nums',
                  paused && 'text-muted-foreground',
                )}
                role="timer"
                aria-live="off"
              >
                {clockText(clock)}
              </span>
              <span className="mt-1 text-sm font-bold text-muted-foreground">
                {clock.phase === 'overtime'
                  ? `${session.plannedMinutes} min done`
                  : `of ${session.plannedMinutes} min`}
              </span>
              <span className="mt-3 inline-flex items-center justify-center gap-1 text-xs font-bold text-muted-foreground">
                <EyeOff className="size-3.5" aria-hidden />
                Hide
              </span>
            </>
          ) : (
            <>
              <Eye className="mx-auto size-7 text-muted-foreground" aria-hidden />
              <span className="mt-2 text-base font-bold">Show time</span>
              <span className="mt-1 text-sm font-bold text-muted-foreground">
                {session.plannedMinutes} min planned
              </span>
            </>
          )}
        </button>
      </FocusRing>

      {(session.task || session.project || session.commitment) && (
        <div className="text-center">
          <div className="text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase">
            On
          </div>
          {session.commitment ? (
            <button
              className="mt-0.5 font-display text-xl font-semibold hover:underline"
              onClick={() => openSheet('commitment', session.commitment!.id)}
            >
              {session.commitment.title}
            </button>
          ) : session.task ? (
            <button
              className="mt-0.5 font-display text-xl font-semibold hover:underline"
              onClick={() => openTask(session.task!.id)}
            >
              {session.task.title}
            </button>
          ) : (
            <Link
              to="/projects/$projectId"
              params={{ projectId: session.project!.id }}
              className="mt-0.5 block font-display text-xl font-semibold hover:underline"
            >
              {session.project!.title}
            </Link>
          )}
          {(session.task || session.commitment) && session.project && (
            <div className="text-sm text-muted-foreground">{session.project.title}</div>
          )}
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        <Button
          size="lg"
          className="min-w-36"
          disabled={busy}
          onClick={() => void act(paused ? focus.resume : focus.pause)}
        >
          {paused ? <Play /> : <Pause />}
          {paused ? 'Resume' : 'Pause'}
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="min-w-36"
          disabled={busy}
          onClick={() => void act(focus.finish)}
        >
          <Flag />
          Finish
        </Button>
      </div>

      <SessionNotes sessionId={session.id} />

      <p className="max-w-sm text-center text-sm text-muted-foreground">
        {!shown && clock.phase !== 'overtime'
          ? 'A chime tells you when the time’s up.'
          : !focusCounts(minutes)
            ? `Sessions count from ${GAME.focus.minMinutes} minutes, 1 XP each.`
            : clock.phase === 'overtime' && capAt
              ? `Overtime counts. The session finishes on its own at ${capAt.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })}.`
              : `${minutes} min so far: ${minutes} XP when you finish.`}
      </p>

      <div className="text-sm">
        {confirmAbandon ? (
          <span className="flex items-center gap-2">
            <span className="text-muted-foreground">Abandon? Nothing will count.</span>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => void act(focus.abandon)}
            >
              Abandon
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmAbandon(false)}>
              Keep going
            </Button>
          </span>
        ) : (
          <button
            className="font-bold text-muted-foreground hover:text-foreground"
            onClick={() => setConfirmAbandon(true)}
          >
            Abandon session
          </button>
        )}
      </div>
    </Panel>
  );
}

// --- Finished --------------------------------------------------------------------------------

function FinishCard({ session }: { session: FocusSession }) {
  const qc = useQueryClient();
  const focus = useFocusActions();
  const tasks = useTaskActions();
  const commitments = useCommitmentActions();
  const minutes = session.minutes ?? 0;
  const counts = focusCounts(minutes);
  const capped = minutes >= session.plannedMinutes + GAME.focus.overtimeMinutes;
  const [note, setNote] = useState(session.note ?? '');
  const save = useAutosave(note, (v) => focus.saveNote(session.id, v), { what: 'the note' });
  const { data: task } = useQuery({
    ...taskQuery(session.task?.id ?? ''),
    enabled: !!session.task,
  });
  const taskDone = !!(task?.completedAt ?? session.task?.completedAt);

  const close = async () => {
    await save.flush();
    markSeen(session.id);
  };

  return (
    <Panel className="items-stretch text-center">
      <div>
        <div className="mx-auto grid size-16 place-items-center rounded-full bg-primary text-primary-foreground shadow-press motion-safe:animate-check-pop">
          <Check className="size-8" strokeWidth={3} />
        </div>
        <h2 className="mt-4 text-3xl">
          {minutes} {minutes === 1 ? 'minute' : 'minutes'} of focus
        </h2>
        <p className="mt-1 font-semibold text-muted-foreground">
          {capped
            ? `It finished on its own, ${GAME.focus.overtimeMinutes} minutes past the plan.`
            : counts
              ? `+${minutes} XP${session.task || session.project || session.commitment ? ` on ${sessionLabel(session)}` : ''}.`
              : `Under ${GAME.focus.minMinutes} minutes, so this one doesn’t count. Next time!`}
        </p>
      </div>

      <label className="grid gap-1.5 text-left">
        <span className="flex items-center justify-between text-sm font-bold">
          What did you get done?
          <SaveState status={save.status} />
        </span>
        <Input
          value={note}
          maxLength={FOCUS_LIMITS.noteLength}
          placeholder="One line, optional"
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void save.flush()}
        />
      </label>

      <SessionNotes sessionId={session.id} board />

      {session.task && (
        <Button
          variant="outline"
          disabled={taskDone || !task}
          onClick={async () => {
            if (!task) return;
            await tasks.complete(task);
            void qc.invalidateQueries({ queryKey: ['focus'] });
          }}
        >
          <Check />
          {taskDone ? `“${session.task.title}” is done` : `Mark “${session.task.title}” done`}
        </Button>
      )}

      {session.commitment &&
        (session.commitment.measure === 'minutes' ? (
          session.commitment.logged && (
            <p className="text-sm font-semibold text-muted-foreground">
              {minutes} min added to “{session.commitment.title}”.
            </p>
          )
        ) : (
          <Button
            variant="outline"
            disabled={session.commitment.logged}
            onClick={() => void commitments.log(session.commitment!.id, 1, session.id)}
          >
            <Check />
            {session.commitment.logged
              ? `Logged on “${session.commitment.title}”`
              : session.commitment.measure === 'check'
                ? `Mark “${session.commitment.title}” done`
                : `+1 ${session.commitment.unit ?? ''} on “${session.commitment.title}”`.replace(
                    '  ',
                    ' ',
                  )}
          </Button>
        ))}

      <div className="flex flex-wrap justify-center gap-3">
        {session.breakMinutes > 0 && (
          <Button
            size="lg"
            onClick={async () => {
              await close();
              startBreak(session.breakMinutes);
            }}
          >
            <Coffee />
            Take a {session.breakMinutes}-min break
          </Button>
        )}
        <Button size="lg" variant="outline" onClick={() => void close()}>
          {session.breakMinutes > 0 ? 'Skip the break' : 'Done'}
        </Button>
      </div>
    </Panel>
  );
}

// --- Break -----------------------------------------------------------------------------------

function BreakView({
  remainingMs,
  minutes,
  sessionId,
}: {
  remainingMs: number;
  minutes: number;
  sessionId?: string;
}) {
  return (
    <Panel>
      <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-extrabold tracking-[0.08em] text-sky-900 uppercase dark:bg-sky-950 dark:text-sky-200">
        Break
      </span>
      <FocusRing progress={1 - remainingMs / (minutes * 60_000)} tone="break" size={240}>
        <div className="text-center">
          <div className="font-display text-5xl font-semibold tabular-nums">
            {formatClock(remainingMs)}
          </div>
          <div className="mt-1 text-sm font-bold text-muted-foreground">Stand up, drink water.</div>
        </div>
      </FocusRing>
      <Button variant="outline" onClick={endBreak}>
        <SkipForward />
        End the break
      </Button>
      {sessionId && <SessionNotes sessionId={sessionId} board />}
    </Panel>
  );
}

// --- Starting --------------------------------------------------------------------------------

/** What `?on=` names, or what the last session was on (when it's still open). */
function useInitialAttachment(on: string | undefined, last: FocusSession | null) {
  const { data: named } = useQuery({ ...entityQuery(on ?? ''), enabled: !!on });
  if (on) {
    if (
      !named ||
      named.closed ||
      (named.kind !== 'task' && named.kind !== 'project' && named.kind !== 'commitment')
    ) {
      return null;
    }
    return { kind: named.kind, id: named.id, title: named.title } satisfies Attachment;
  }
  if (last?.commitment) {
    return {
      kind: 'commitment',
      id: last.commitment.id,
      title: last.commitment.title,
    } satisfies Attachment;
  }
  if (last?.task && !last.task.completedAt) {
    return { kind: 'task', id: last.task.id, title: last.task.title } satisfies Attachment;
  }
  if (last?.project && !last.task) {
    return { kind: 'project', id: last.project.id, title: last.project.title } satisfies Attachment;
  }
  return null;
}

function StartPanel({ last }: { last: FocusSession | null }) {
  const { on } = Route.useSearch();
  const { data: me } = useQuery(meQuery);
  const focus = useFocusActions();
  const presets = me?.settings.focusPresets ?? [];
  const initial = useInitialAttachment(on, last);
  const [attach, setAttach] = useState<Attachment | null | undefined>(undefined);
  const [choice, setChoice] = useState<number | 'custom'>(0);
  const [custom, setCustom] = useState<FocusPreset>({ focusMinutes: 40, breakMinutes: 8 });
  const [busy, setBusy] = useState(false);

  // `?on=` resolves after the first render; follow it until the user picks something (the panel
  // is keyed by `on`, so a new one starts over).
  const attachment = attach === undefined ? initial : attach;

  const preset = choice === 'custom' ? custom : (presets[choice] ?? presets[0]);
  const valid =
    !!preset &&
    preset.focusMinutes >= FOCUS_LIMITS.plannedMinutes.min &&
    preset.focusMinutes <= FOCUS_LIMITS.plannedMinutes.max &&
    preset.breakMinutes >= FOCUS_LIMITS.breakMinutes.min &&
    preset.breakMinutes <= FOCUS_LIMITS.breakMinutes.max;

  const start = async () => {
    if (!preset || !valid) return;
    setBusy(true);
    await focus.start({
      ...preset,
      ...(attachment?.kind === 'task' ? { taskId: attachment.id } : {}),
      ...(attachment?.kind === 'project' ? { projectId: attachment.id } : {}),
      ...(attachment?.kind === 'commitment' ? { commitmentId: attachment.id } : {}),
    });
    setBusy(false);
  };

  return (
    <Panel className="items-stretch">
      <div className="grid gap-2">
        <span className="text-sm font-bold">How long?</span>
        <div
          className="grid grid-cols-2 gap-2 sm:grid-cols-3"
          role="radiogroup"
          aria-label="Session length"
        >
          {presets.map((p, i) => (
            <PresetChip key={i} selected={choice === i} onSelect={() => setChoice(i)}>
              <span className="font-display text-2xl font-semibold">{p.focusMinutes} min</span>
              <span className="text-xs font-bold text-muted-foreground">
                {p.breakMinutes ? `${p.breakMinutes} min break` : 'no break'}
              </span>
            </PresetChip>
          ))}
          <PresetChip selected={choice === 'custom'} onSelect={() => setChoice('custom')}>
            <span className="font-display text-2xl font-semibold">Custom</span>
            <span className="text-xs font-bold text-muted-foreground">your numbers</span>
          </PresetChip>
        </div>
        {choice === 'custom' && (
          <div className="grid grid-cols-2 gap-3 pt-1">
            <MinutesField
              label="Focus (min)"
              value={custom.focusMinutes}
              min={FOCUS_LIMITS.plannedMinutes.min}
              max={FOCUS_LIMITS.plannedMinutes.max}
              onChange={(focusMinutes) => setCustom((c) => ({ ...c, focusMinutes }))}
            />
            <MinutesField
              label="Break (min)"
              value={custom.breakMinutes}
              min={FOCUS_LIMITS.breakMinutes.min}
              max={FOCUS_LIMITS.breakMinutes.max}
              onChange={(breakMinutes) => setCustom((c) => ({ ...c, breakMinutes }))}
            />
          </div>
        )}
      </div>

      <div className="grid gap-2">
        <span className="text-sm font-bold">On what?</span>
        <AttachPicker value={attachment} onChange={setAttach} />
      </div>

      <Button
        size="lg"
        className="h-14 text-lg"
        disabled={!valid || busy}
        onClick={() => void start()}
      >
        <Play className="size-5" />
        Start {preset && valid ? `${preset.focusMinutes} min` : ''}
      </Button>
      <p className="-mt-2 text-center text-xs text-muted-foreground">
        Sessions of {GAME.focus.minMinutes}+ minutes earn 1 XP a minute and count for your streak.
        Change the presets in{' '}
        <Link to="/settings" className="underline underline-offset-2">
          Settings
        </Link>
        .
      </p>
    </Panel>
  );
}

function PresetChip({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex flex-col items-start rounded-2xl border-2 px-4 py-3 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        selected ? 'border-ember bg-glow/60 shadow-ledge' : 'bg-card hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}
