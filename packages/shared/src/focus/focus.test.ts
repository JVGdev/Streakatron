import { describe, expect, it } from 'vitest';
import {
  autoFinishAt,
  creditedMinutes,
  focusCapMs,
  focusClock,
  focusCounts,
  focusedMs,
  formatClock,
  isPastCap,
  plannedEndAt,
  type FocusTiming,
} from '.';
import { foldXp, xpFor, type XpActivity } from '../game';

const MIN = 60_000;
const T0 = Date.parse('2026-11-04T13:00:00Z');
const at = (minutes: number) => T0 + minutes * MIN;

const session = (extra: Partial<FocusTiming> = {}): FocusTiming => ({
  startedAt: T0,
  pausedMs: 0,
  pausedAt: null,
  endedAt: null,
  plannedMinutes: 25,
  ...extra,
});

describe('focused time', () => {
  it('counts from the start to now while running', () => {
    expect(focusedMs(session(), at(10))).toBe(10 * MIN);
    expect(focusedMs(session(), T0 - MIN)).toBe(0); // clock skew never goes negative
  });

  it('leaves out finished pauses and the open one', () => {
    expect(focusedMs(session({ pausedMs: 5 * MIN }), at(20))).toBe(15 * MIN);
    // Paused at minute 12 after a 3-minute pause: 9 minutes, however long the pause lasts.
    const paused = session({ pausedMs: 3 * MIN, pausedAt: at(12) });
    expect(focusedMs(paused, at(12))).toBe(9 * MIN);
    expect(focusedMs(paused, at(500))).toBe(9 * MIN);
  });

  it('stops at the end once ended', () => {
    expect(focusedMs(session({ endedAt: at(30) }), at(999))).toBe(30 * MIN);
  });

  it('never passes the plan plus the overtime allowance', () => {
    expect(focusCapMs(25)).toBe(85 * MIN);
    expect(focusedMs(session(), at(60 * 24))).toBe(85 * MIN);
    expect(creditedMinutes(session(), at(60 * 24))).toBe(85);
  });

  it('accepts ISO strings and dates', () => {
    const s = session({ startedAt: new Date(T0).toISOString(), pausedAt: new Date(at(4)) });
    expect(focusedMs(s, new Date(at(9)).toISOString())).toBe(4 * MIN);
  });
});

describe('credited minutes', () => {
  it('rounds down to whole minutes', () => {
    expect(creditedMinutes(session(), at(9) + 59_999)).toBe(9);
    expect(creditedMinutes(session(), at(10))).toBe(10);
  });

  it('counts from 10 minutes', () => {
    expect(focusCounts(9)).toBe(false);
    expect(focusCounts(10)).toBe(true);
  });
});

describe('planned end and auto-finish', () => {
  it('moves later by the pauses', () => {
    expect(plannedEndAt(session())?.getTime()).toBe(at(25));
    expect(plannedEndAt(session({ pausedMs: 4 * MIN }))?.getTime()).toBe(at(29));
    expect(autoFinishAt(session({ pausedMs: 4 * MIN }))?.getTime()).toBe(at(89));
  });

  it('has none while paused or ended', () => {
    expect(plannedEndAt(session({ pausedAt: at(3) }))).toBeNull();
    expect(autoFinishAt(session({ pausedAt: at(3) }))).toBeNull();
    expect(autoFinishAt(session({ endedAt: at(3) }))).toBeNull();
  });

  it('is past the cap exactly at the auto-finish time', () => {
    expect(isPastCap(session(), at(85) - 1)).toBe(false);
    expect(isPastCap(session(), at(85))).toBe(true);
    expect(isPastCap(session({ pausedAt: at(1) }), at(1000))).toBe(false);
  });
});

describe('the clock', () => {
  it('counts down, then up as overtime', () => {
    expect(focusClock(session(), at(10))).toEqual({
      focusedMs: 10 * MIN,
      remainingMs: 15 * MIN,
      overtimeMs: 0,
      phase: 'focus',
      progress: 0.4,
    });
    expect(focusClock(session(), at(25)).phase).toBe('overtime');
    expect(focusClock(session(), at(32))).toMatchObject({
      remainingMs: 0,
      overtimeMs: 7 * MIN,
      progress: 1,
    });
  });

  it('formats minutes and hours', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(1)).toBe('00:01'); // a countdown rounds up
    expect(formatClock(1, 'down')).toBe('00:00');
    expect(formatClock(25 * MIN)).toBe('25:00');
    expect(formatClock(62 * MIN + 5000)).toBe('1:02:05');
    expect(formatClock(-5)).toBe('00:00');
  });
});

describe('focus XP', () => {
  const focus = (entityId: string, minutes: number): XpActivity => ({
    type: 'focus_completed',
    entityId,
    localDate: '2026-11-04',
    payload: { minutes },
  });
  const fresh = { earnedBefore: false, taskXpThatDay: 0 };

  it('earns 1 XP a minute from 10 minutes', () => {
    expect(xpFor(focus('fcs_a', 25), fresh)).toBe(25);
    expect(xpFor(focus('fcs_a', 10), fresh)).toBe(10);
    expect(xpFor(focus('fcs_a', 9), fresh)).toBe(0);
  });

  it('is not soft-capped like tasks', () => {
    expect(xpFor(focus('fcs_a', 85), { earnedBefore: false, taskXpThatDay: 500 })).toBe(85);
  });

  it('earns once per session', () => {
    expect(foldXp([focus('fcs_a', 30), focus('fcs_a', 30), focus('fcs_b', 20)])).toEqual([
      30, 0, 20,
    ]);
  });

  it('leaves the task soft cap to tasks', () => {
    const task = (id: string): XpActivity => ({
      type: 'task_completed',
      entityId: id,
      localDate: '2026-11-04',
      payload: { effort: 'L' },
    });
    // 4 L tasks = 200 (the cap); the focus between them doesn't use any of it.
    const xps = foldXp([task('a'), task('b'), focus('fcs_a', 60), task('c'), task('d'), task('e')]);
    expect(xps).toEqual([50, 50, 60, 50, 50, 25]);
  });
});
