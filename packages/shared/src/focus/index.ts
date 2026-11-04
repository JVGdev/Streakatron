// Focus-session timing as pure functions, shared by the server (what counts, D17) and the web app
// (what the timer shows). A session is a start time, the pauses so far, and maybe an end:
//
//   focused = (end or now) − started − paused so far − (the open pause, if paused)
//
// At the planned time the timer chimes and keeps counting as overtime; a running session ends on
// its own `overtimeMinutes` past the plan, so a timer left on can't farm XP (D29).

import { GAME } from '../game/config';

export const FOCUS_STATUSES = ['running', 'paused', 'completed', 'abandoned'] as const;
export type FocusStatus = (typeof FOCUS_STATUSES)[number];

/** Sessions that are still going (one per user at a time). */
export const OPEN_FOCUS_STATUSES = ['running', 'paused'] as const satisfies readonly FocusStatus[];

export const FOCUS_LIMITS = {
  plannedMinutes: { min: 1, max: 240 },
  breakMinutes: { min: 0, max: 60 },
  noteLength: 500,
} as const;

type Instant = Date | string | number;
const ms = (t: Instant) => (typeof t === 'number' ? t : new Date(t).getTime());

export interface FocusTiming {
  startedAt: Instant;
  /** Pauses that are over, in milliseconds. */
  pausedMs: number;
  /** When the open pause began (paused sessions only). */
  pausedAt: Instant | null;
  endedAt: Instant | null;
  plannedMinutes: number;
}

const MINUTE = 60_000;

/** The most focus a session can count: its plan plus the overtime allowance. */
export const focusCapMs = (plannedMinutes: number) =>
  (plannedMinutes + GAME.focus.overtimeMinutes) * MINUTE;

/** Milliseconds focused so far (pauses left out), up to the end or `now`, and never past the cap. */
export function focusedMs(s: FocusTiming, now: Instant): number {
  const end = s.endedAt != null ? ms(s.endedAt) : ms(now);
  const openPause = s.pausedAt != null ? Math.max(0, end - ms(s.pausedAt)) : 0;
  const raw = end - ms(s.startedAt) - s.pausedMs - openPause;
  return Math.min(focusCapMs(s.plannedMinutes), Math.max(0, raw));
}

/** When a running session reaches its planned time (null while paused: the clock is stopped). */
export function plannedEndAt(s: FocusTiming): Date | null {
  if (s.pausedAt != null || s.endedAt != null) return null;
  return new Date(ms(s.startedAt) + s.pausedMs + s.plannedMinutes * MINUTE);
}

/** When a running session ends on its own (null while paused or once it has ended). */
export function autoFinishAt(s: FocusTiming): Date | null {
  if (s.pausedAt != null || s.endedAt != null) return null;
  return new Date(ms(s.startedAt) + s.pausedMs + focusCapMs(s.plannedMinutes));
}

/** Whether a running session has reached its cap at `now` (the server then finishes it). */
export function isPastCap(s: FocusTiming, now: Instant): boolean {
  const at = autoFinishAt(s);
  return at !== null && ms(now) >= at.getTime();
}

/** Whole minutes a session counts when it ends: focus time, capped, rounded down. */
export const creditedMinutes = (s: FocusTiming, now: Instant) =>
  Math.floor(focusedMs(s, now) / MINUTE);

/** Whether a session of this many minutes earns XP and makes the day active. */
export const focusCounts = (minutes: number) => minutes >= GAME.focus.minMinutes;

export type FocusPhase = 'focus' | 'overtime';

export interface FocusClock {
  focusedMs: number;
  /** Until the planned time (0 once it's past). */
  remainingMs: number;
  /** Past the planned time (0 before it). */
  overtimeMs: number;
  phase: FocusPhase;
  /** 0…1 of the planned time. */
  progress: number;
}

/** What the timer shows at `now`. */
export function focusClock(s: FocusTiming, now: Instant): FocusClock {
  const focused = focusedMs(s, now);
  const planned = s.plannedMinutes * MINUTE;
  return {
    focusedMs: focused,
    remainingMs: Math.max(0, planned - focused),
    overtimeMs: Math.max(0, focused - planned),
    phase: focused >= planned ? 'overtime' : 'focus',
    progress: Math.min(1, focused / planned),
  };
}

/** `12:05`, or `1:02:05` from an hour up (rounded up to the second, as a countdown reads). */
export function formatClock(milliseconds: number, round: 'up' | 'down' = 'up'): string {
  const total = Math.max(0, (round === 'up' ? Math.ceil : Math.floor)(milliseconds / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
