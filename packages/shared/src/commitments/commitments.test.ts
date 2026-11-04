import { describe, expect, it } from 'vitest';
import {
  commitmentDay,
  commitmentShapeProblem,
  commitmentStreak,
  isScheduled,
  normalizeSchedule,
  periodRange,
  progressIn,
  progressText,
  recentDays,
  targetText,
  type CommitmentRules,
} from '.';

// 2026-11-02 is a Monday.
const MON = '2026-11-02';
const TUE = '2026-11-03';
const WED = '2026-11-04';
const SUN = '2026-11-08';

const duolingo: CommitmentRules = { measure: 'check', target: 1, period: 'day', schedule: null };
const anki: CommitmentRules = { measure: 'count', target: 20, period: 'day', schedule: null };
const listening: CommitmentRules = {
  measure: 'minutes',
  target: 15,
  period: 'day',
  schedule: null,
};
const classes: CommitmentRules = { measure: 'check', target: 3, period: 'week', schedule: null };
const gym: CommitmentRules = {
  measure: 'check',
  target: 1,
  period: 'day',
  schedule: { days: [1, 3, 5] },
};

const totals = (entries: Record<string, number>) => new Map(Object.entries(entries));

describe('shape', () => {
  it('accepts the use case’s four commitments', () => {
    for (const c of [duolingo, anki, listening, classes, gym]) {
      expect(commitmentShapeProblem(c)).toBeNull();
    }
    expect(commitmentShapeProblem({ ...anki, unit: 'cards' })).toBeNull();
  });

  it('rejects shapes that make no sense', () => {
    expect(commitmentShapeProblem({ ...duolingo, target: 2 })).toMatch(/daily check/);
    expect(commitmentShapeProblem({ ...classes, target: 8 })).toMatch(/7 times/);
    expect(commitmentShapeProblem({ ...listening, target: 1441 })).toMatch(/1440/);
    expect(commitmentShapeProblem({ ...listening, unit: 'min' })).toMatch(/unit/);
    expect(commitmentShapeProblem({ ...classes, schedule: { days: [1] } })).toMatch(/weekdays/);
    expect(commitmentShapeProblem({ ...gym, schedule: { days: [] } })).toMatch(/one day/);
    expect(commitmentShapeProblem({ ...gym, schedule: { days: [1, 1] } })).toMatch(/each once/);
    expect(commitmentShapeProblem({ ...gym, schedule: { days: [7] } })).toMatch(/0 \(Sunday\)/);
    expect(commitmentShapeProblem({ ...anki, target: 0 })).toMatch(/1 or more/);
  });

  it('stores every day as no schedule, and none for weeks', () => {
    expect(normalizeSchedule('day', { days: [0, 1, 2, 3, 4, 5, 6] })).toBeNull();
    expect(normalizeSchedule('day', { days: [5, 1, 3, 1] })).toEqual({ days: [1, 3, 5] });
    expect(normalizeSchedule('week', { days: [1] })).toBeNull();
    expect(normalizeSchedule('day', null)).toBeNull();
  });
});

describe('days and periods', () => {
  it('knows which days are scheduled', () => {
    expect(isScheduled(gym, MON)).toBe(true);
    expect(isScheduled(gym, TUE)).toBe(false);
    expect(isScheduled(duolingo, TUE)).toBe(true);
    expect(isScheduled(classes, SUN)).toBe(true);
  });

  it('finds the period: the day, or its week', () => {
    expect(periodRange(anki, WED)).toEqual({ start: WED, end: WED });
    expect(periodRange(classes, WED)).toEqual({ start: MON, end: SUN });
    expect(periodRange(classes, WED, 0)).toEqual({ start: '2026-11-01', end: '2026-11-07' });
  });

  it('adds amounts, counts check days, caps a daily check at 1', () => {
    const t = totals({ [MON]: 12, [TUE]: 9, [WED]: 1 });
    expect(progressIn(anki, t, { start: MON, end: MON })).toBe(12);
    expect(progressIn({ ...anki, period: 'week' }, t, { start: MON, end: SUN })).toBe(22);
    expect(progressIn(classes, t, { start: MON, end: SUN })).toBe(3);
    expect(progressIn(duolingo, totals({ [MON]: 2 }), { start: MON, end: MON })).toBe(1);
  });
});

describe('today', () => {
  it('a daily check is due until ticked', () => {
    expect(commitmentDay(duolingo, totals({}), MON)).toMatchObject({
      scheduled: true,
      due: true,
      met: false,
      progress: 0,
      target: 1,
    });
    expect(commitmentDay(duolingo, totals({ [MON]: 1 }), MON)).toMatchObject({
      due: false,
      met: true,
      today: 1,
    });
  });

  it('an amount stays due while partial', () => {
    expect(commitmentDay(anki, totals({ [MON]: 12 }), MON)).toMatchObject({
      due: true,
      met: false,
      progress: 12,
    });
    expect(commitmentDay(anki, totals({ [MON]: 20 }), MON).met).toBe(true);
  });

  it('is not due on unscheduled days', () => {
    expect(commitmentDay(gym, totals({}), TUE)).toMatchObject({ scheduled: false, due: false });
  });

  it('a weekly check takes one a day and is done once met', () => {
    const one = commitmentDay(classes, totals({ [MON]: 1 }), MON);
    expect(one).toMatchObject({ due: false, met: false, progress: 1, today: 1 });
    const next = commitmentDay(classes, totals({ [MON]: 1 }), TUE);
    expect(next).toMatchObject({ due: true, progress: 1 });
    const met = commitmentDay(classes, totals({ [MON]: 1, [TUE]: 1, [WED]: 1 }), '2026-11-05');
    expect(met).toMatchObject({ due: false, met: true, progress: 3 });
  });
});

describe('streaks', () => {
  it('counts met days in a row, today pending', () => {
    const t = totals({ [MON]: 1, [TUE]: 1 });
    expect(commitmentStreak(duolingo, t, WED, MON)).toEqual({
      current: 2,
      longest: 2,
      unit: 'day',
    });
    expect(
      commitmentStreak(duolingo, totals({ [MON]: 1, [TUE]: 1, [WED]: 1 }), WED, MON).current,
    ).toBe(3);
  });

  it('breaks on a missed scheduled day', () => {
    const t = totals({ [MON]: 1, [WED]: 1 });
    expect(commitmentStreak(duolingo, t, WED, MON)).toMatchObject({ current: 1, longest: 1 });
  });

  it('skips unscheduled days', () => {
    // Mon, Wed, Fri: Tuesday and Thursday don't break it.
    const t = totals({ [MON]: 1, [WED]: 1, '2026-11-06': 1 });
    expect(commitmentStreak(gym, t, '2026-11-07', MON)).toMatchObject({ current: 3 });
  });

  it('a partial amount doesn’t keep it', () => {
    const t = totals({ [MON]: 20, [TUE]: 12 });
    expect(commitmentStreak(anki, t, WED, MON)).toMatchObject({ current: 0, longest: 1 });
  });

  it('starts at 0 on the day it’s made', () => {
    expect(commitmentStreak(duolingo, totals({}), WED, WED)).toMatchObject({ current: 0 });
  });

  it('counts weeks for weekly ones, this week pending', () => {
    const t = totals({
      '2026-10-26': 1,
      '2026-10-27': 1,
      '2026-10-28': 1,
      [MON]: 1,
    });
    expect(commitmentStreak(classes, t, WED, '2026-10-26')).toEqual({
      current: 1,
      longest: 1,
      unit: 'week',
    });
    const missed = totals({ '2026-10-19': 1, '2026-10-20': 1, '2026-10-21': 1 });
    expect(commitmentStreak(classes, missed, WED, '2026-10-19')).toMatchObject({
      current: 0,
      longest: 1,
    });
  });
});

describe('history and words', () => {
  it('lists recent days', () => {
    const days = recentDays(gym, totals({ [MON]: 1 }), WED, 3);
    expect(days).toEqual([
      { day: MON, scheduled: true, amount: 1, met: true },
      { day: TUE, scheduled: false, amount: 0, met: false },
      { day: WED, scheduled: true, amount: 0, met: false },
    ]);
  });

  it('asks nothing before it was made', () => {
    const days = recentDays(duolingo, totals({}), WED, 3, TUE);
    expect(days.map((d) => d.scheduled)).toEqual([false, true, true]);
  });

  it('says what it asks', () => {
    expect(targetText(duolingo)).toBe('Every day');
    expect(targetText({ ...anki, unit: 'cards' })).toBe('20 cards a day');
    expect(targetText(listening)).toBe('15 min a day');
    expect(targetText(classes)).toBe('3 times a week');
    expect(targetText(gym)).toBe('On Mon, Wed, Fri');
    expect(targetText({ ...gym, schedule: { days: [1, 2, 3, 4, 5] } })).toBe('On weekdays');
    expect(targetText({ ...listening, period: 'week', target: 90 })).toBe('1 h 30 min a week');
  });

  it('says where it stands', () => {
    expect(progressText({ ...anki, unit: 'cards' }, 12)).toBe('12/20 cards');
    expect(progressText(classes, 1)).toBe('1/3 this week');
    expect(progressText(listening, 10)).toBe('10/15 min');
    expect(progressText(duolingo, 0)).toBe('Not yet');
  });
});
