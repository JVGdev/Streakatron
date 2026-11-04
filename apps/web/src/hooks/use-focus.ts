// The focus timer's state for components: the open session with a ticking clock, the break, and
// one-click starting. Components live in components/focus-timer.tsx.

import { focusClock, formatClock, type FocusClock } from '@streakatron/shared/focus';
import { DEFAULT_USER_SETTINGS } from '@streakatron/shared/schemas';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useFocusActions } from '@/lib/actions';
import { currentBreak, useFocusMemory, useServerNow } from '@/lib/focus-timer';
import { focusQuery, meQuery, type FocusSession } from '@/lib/queries';

/** The open session and its clock, ticking every second while it runs. */
export function useFocus() {
  const { data: state } = useQuery(focusQuery);
  const session = state?.session ?? null;
  const now = useServerNow(session?.status === 'running');
  const clock = session ? focusClock(session, now) : null;
  return { state, session, clock, now };
}

/** The break in progress (this browser only), ticking every second. */
export function useBreak() {
  const brk = useFocusMemory(currentBreak);
  const now = useServerNow(brk !== null);
  if (!brk) return null;
  return { ...brk, remainingMs: Math.max(0, brk.endsAt - now), over: now >= brk.endsAt };
}

/** What the clock reads: the countdown, or `+mm:ss` of overtime. */
export const clockText = (clock: FocusClock) =>
  clock.phase === 'overtime'
    ? `+${formatClock(clock.overtimeMs, 'down')}`
    : formatClock(clock.remainingMs);

/** What a session is on, in a few words. */
export const sessionLabel = (s: Pick<FocusSession, 'task' | 'project' | 'commitment'>) =>
  s.task?.title ?? s.commitment?.title ?? s.project?.title ?? 'Focus';

/**
 * Start a session with the first preset in one click (Today, the task sheet, a commitment), then
 * show the timer. With a session already going, it just shows the timer.
 */
export function useQuickFocus() {
  const focus = useFocusActions();
  const navigate = useNavigate();
  const { data: me } = useQuery(meQuery);
  const { data: state } = useQuery(focusQuery);
  return async (on?: { taskId: string } | { projectId: string } | { commitmentId: string }) => {
    if (!state?.session) {
      const preset = me?.settings.focusPresets[0] ?? DEFAULT_USER_SETTINGS.focusPresets[0]!;
      await focus.start({ ...preset, ...on });
    }
    await navigate({ to: '/focus', search: {} });
  };
}
