import { describe, expect, it } from 'vitest';
import { addDays, eachDay } from '../time';
import {
  commitmentPeriodKey,
  countsAsActive,
  dailyStreak,
  foldXp,
  gameEvents,
  gameState,
  levelFor,
  softCapped,
  weeklyStreak,
  xpFor,
  xpForLevel,
  type XpActivity,
} from '.';

const done = (
  entityId: string,
  localDate = '2026-11-02',
  payload: XpActivity['payload'] = {},
): XpActivity => ({ type: 'task_completed', entityId, localDate, payload });
const reopened = (entityId: string, localDate = '2026-11-02'): XpActivity => ({
  type: 'task_reopened',
  entityId,
  localDate,
  payload: {},
});

describe('task XP', () => {
  const fresh = { earnedBefore: false, taskXpThatDay: 0 };

  it('follows effort, with unset effort earning like S (D27)', () => {
    expect(xpFor(done('a', undefined, { effort: 'S' }), fresh)).toBe(10);
    expect(xpFor(done('a', undefined, { effort: 'M' }), fresh)).toBe(25);
    expect(xpFor(done('a', undefined, { effort: 'L' }), fresh)).toBe(50);
    expect(xpFor(done('a', undefined, { effort: null }), fresh)).toBe(10);
    expect(xpFor(done('a'), fresh)).toBe(10);
  });

  it('gives subtasks nothing', () => {
    expect(xpFor(done('a', undefined, { effort: 'L', subtask: true }), fresh)).toBe(0);
  });

  it('earns once: re-completing after a reopen earns 0 (D15)', () => {
    const log = [
      done('a', '2026-11-02', { effort: 'M' }),
      reopened('a'),
      done('a', '2026-11-03', { effort: 'L' }),
    ];
    expect(foldXp(log)).toEqual([25, 0, 0]);
  });

  it('keeps sources apart', () => {
    expect(foldXp([done('a'), done('b'), done('a')])).toEqual([10, 10, 0]);
  });

  it('halves task XP above 200 a day, rounding up', () => {
    expect(softCapped(25, 0)).toBe(25);
    expect(softCapped(25, 190)).toBe(10 + 8);
    expect(softCapped(50, 200)).toBe(25);
    expect(softCapped(25, 300)).toBe(13);
  });

  it('applies the soft cap per day', () => {
    const big = (id: string, day: string) => done(id, day, { effort: 'L' });
    const log = [1, 2, 3, 4, 5].map((i) => big(`d${i}`, '2026-11-02'));
    log.push(big('next', '2026-11-03'));
    // 50 × 4 = 200 at full rate, the fifth halved; the next day starts over.
    expect(foldXp(log)).toEqual([50, 50, 50, 50, 25, 50]);
  });

  it('counts halved XP toward the cap, not the base', () => {
    const log = Array.from({ length: 6 }, (_, i) => done(`t${i}`, '2026-11-02', { effort: 'L' }));
    expect(foldXp(log).reduce((a, b) => a + b, 0)).toBe(200 + 25 + 25);
  });
});

describe('levels', () => {
  it('follows 50 · n · (n − 1)', () => {
    expect([1, 2, 3, 4, 5, 10].map(xpForLevel)).toEqual([0, 100, 300, 600, 1000, 4500]);
  });

  it('reads the level from XP at every boundary', () => {
    expect(levelFor(0)).toEqual({ level: 1, xp: 0, floor: 0, next: 100 });
    expect(levelFor(99).level).toBe(1);
    expect(levelFor(100).level).toBe(2);
    expect(levelFor(299).level).toBe(2);
    expect(levelFor(300)).toEqual({ level: 3, xp: 300, floor: 300, next: 600 });
    expect(levelFor(4499).level).toBe(9);
    expect(levelFor(4500).level).toBe(10);
    for (let n = 1; n < 200; n++) {
      expect(levelFor(xpForLevel(n)).level).toBe(n);
      expect(levelFor(xpForLevel(n) - 1).level).toBe(Math.max(1, n - 1));
    }
  });
});

describe('daily streak', () => {
  const today = '2026-11-20';
  const run = (from: string, to: string) => eachDay(from, to);

  it('is empty without activity', () => {
    expect(dailyStreak([], today)).toMatchObject({ current: 0, longest: 0, freezes: 0 });
  });

  it('counts consecutive days, today included', () => {
    expect(dailyStreak(run('2026-11-18', today), today)).toMatchObject({
      current: 3,
      todayActive: true,
    });
  });

  it('isn’t broken by today still being in progress', () => {
    expect(dailyStreak(run('2026-11-17', '2026-11-19'), today)).toMatchObject({
      current: 3,
      todayActive: false,
    });
  });

  it('ends after a missed day with no freeze', () => {
    const days = [...run('2026-11-10', '2026-11-12'), ...run('2026-11-14', '2026-11-15')];
    expect(dailyStreak(days, '2026-11-15')).toMatchObject({ current: 2, longest: 3 });
  });

  it('ends when yesterday was missed', () => {
    expect(dailyStreak(run('2026-11-15', '2026-11-18'), today)).toMatchObject({
      current: 0,
      longest: 4,
    });
  });

  it('earns a freeze per 7 consecutive days, banking at most 2', () => {
    expect(dailyStreak(run('2026-11-01', '2026-11-06'), '2026-11-06').freezes).toBe(0);
    expect(dailyStreak(run('2026-11-01', '2026-11-07'), '2026-11-07').freezes).toBe(1);
    expect(dailyStreak(run('2026-11-01', '2026-11-14'), '2026-11-14').freezes).toBe(2);
    expect(dailyStreak(run('2026-10-01', '2026-11-14'), '2026-11-14').freezes).toBe(2);
  });

  it('uses a banked freeze on a missed day and keeps the streak', () => {
    const days = [...run('2026-11-01', '2026-11-07'), ...run('2026-11-09', '2026-11-10')];
    expect(dailyStreak(days, '2026-11-10')).toMatchObject({
      current: 9,
      freezes: 0,
      frozenDays: ['2026-11-08'],
    });
  });

  it('spends two freezes on two missed days, and ends on a third', () => {
    const before = run('2026-11-01', '2026-11-14'); // 2 freezes
    expect(dailyStreak([...before, '2026-11-17'], '2026-11-17')).toMatchObject({
      current: 15,
      freezes: 0,
      frozenDays: ['2026-11-15', '2026-11-16'],
    });
    expect(dailyStreak([...before, '2026-11-18'], '2026-11-18')).toMatchObject({
      current: 1,
      longest: 14,
    });
  });

  it('keeps the streak alive across a freeze while today is pending', () => {
    // Active through the 7th (1 freeze), missed the 8th, today (the 9th) not yet active.
    expect(dailyStreak(run('2026-11-01', '2026-11-07'), '2026-11-09')).toMatchObject({
      current: 7,
      freezes: 0,
      frozenDays: ['2026-11-08'],
      todayActive: false,
    });
  });

  it('restarts the run toward a freeze after a frozen day', () => {
    // 7 days (freeze), miss one (spent), then 6 days: no new freeze yet.
    const days = [...run('2026-11-01', '2026-11-07'), ...run('2026-11-09', '2026-11-14')];
    expect(dailyStreak(days, '2026-11-14')).toMatchObject({ freezes: 0, run: 6 });
    expect(dailyStreak([...days, '2026-11-15'], '2026-11-15')).toMatchObject({ freezes: 1 });
  });

  it('ignores repeats, order and days after today', () => {
    const days = ['2026-11-19', '2026-11-18', '2026-11-19', '2026-11-25'];
    expect(dailyStreak(days, '2026-11-19')).toMatchObject({ current: 2, todayActive: true });
  });

  it('handles long histories', () => {
    const start = '2024-01-01';
    const days = eachDay(start, addDays(start, 900));
    expect(dailyStreak(days, addDays(start, 900)).current).toBe(901);
  });
});

describe('weekly streak', () => {
  const rules = { weekStart: 1, target: 4 };
  // 2026-11-02 is a Monday.
  const week = (monday: string, n: number) => eachDay(monday, addDays(monday, n - 1));

  it('counts weeks meeting the target', () => {
    const days = [...week('2026-10-19', 4), ...week('2026-10-26', 5), ...week('2026-11-02', 4)];
    expect(weeklyStreak(days, '2026-11-08', rules)).toMatchObject({
      current: 3,
      week: {
        start: '2026-11-02',
        activeDays: 4,
        dates: ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'],
        target: 4,
        met: true,
      },
    });
  });

  it('doesn’t break on a current week still short of the target', () => {
    const days = [...week('2026-10-19', 4), ...week('2026-10-26', 4), '2026-11-02'];
    expect(weeklyStreak(days, '2026-11-03', rules)).toMatchObject({
      current: 2,
      week: { activeDays: 1, met: false },
    });
  });

  it('breaks on a past week short of the target', () => {
    const days = [...week('2026-10-19', 4), ...week('2026-10-26', 3), ...week('2026-11-02', 4)];
    expect(weeklyStreak(days, '2026-11-06', rules)).toMatchObject({ current: 1, longest: 1 });
  });

  it('breaks on an empty week', () => {
    const days = [...week('2026-10-12', 4), ...week('2026-10-26', 4)];
    expect(weeklyStreak(days, '2026-11-02', rules)).toMatchObject({ current: 1 });
  });

  it('follows the week start', () => {
    // Sunday–Wednesday: one week when weeks start on Sunday, split when they start on Monday.
    const days = eachDay('2026-11-01', '2026-11-04');
    expect(weeklyStreak(days, '2026-11-04', { weekStart: 0, target: 4 }).current).toBe(1);
    expect(weeklyStreak(days, '2026-11-04', rules).current).toBe(0);
  });
});

describe('events', () => {
  const rules = { weekStart: 1, weeklyTarget: 4 };

  it('reports XP, level up, the day becoming active, a freeze and a met week', () => {
    const days = eachDay('2026-11-03', '2026-11-08'); // Tue–Sun, 6 days
    const before = gameState(95, days, '2026-11-09', rules);
    const after = gameState(120, [...days, '2026-11-09'], '2026-11-09', rules);
    expect(gameEvents(before, after)).toEqual([
      { type: 'xp', amount: 25 },
      { type: 'level_up', level: 2 },
      { type: 'day_active', streak: 7 },
      { type: 'freeze_earned', freezes: 1 },
    ]);
  });

  it('reports a met week', () => {
    const days = eachDay('2026-11-02', '2026-11-04');
    const before = gameState(0, days, '2026-11-05', rules);
    const after = gameState(10, [...days, '2026-11-05'], '2026-11-05', rules);
    expect(gameEvents(before, after)).toContainEqual({ type: 'week_met', weeks: 1 });
  });

  it('reports nothing when nothing changed', () => {
    const s = gameState(50, ['2026-11-05'], '2026-11-05', rules);
    expect(gameEvents(s, s)).toEqual([]);
  });
});

describe('commitments (D31)', () => {
  const met = (
    key: string,
    localDate = '2026-11-02',
    period: 'day' | 'week' = 'day',
  ): XpActivity => ({
    type: 'commitment_met',
    entityId: key,
    localDate,
    payload: { period },
  });
  const logged = (period: 'day' | 'week'): XpActivity => ({
    type: 'commitment_logged',
    entityId: 'cme_1',
    localDate: '2026-11-02',
    payload: { period },
  });

  it('earns 10 XP once per commitment per period', () => {
    const k = commitmentPeriodKey('cmt_a', '2026-11-02');
    expect(k).toBe('cmt_a:2026-11-02');
    expect(foldXp([met(k), met(k), met(commitmentPeriodKey('cmt_a', '2026-11-03'))])).toEqual([
      10, 0, 10,
    ]);
    expect(xpFor(logged('day'), { earnedBefore: false, taskXpThatDay: 0 })).toBe(0);
  });

  it('makes the day active when met, or on any weekly entry, not on a partial daily one', () => {
    expect(countsAsActive('commitment_met', { period: 'day' })).toBe(true);
    expect(countsAsActive('commitment_logged', { period: 'week' })).toBe(true);
    expect(countsAsActive('commitment_logged', { period: 'day' })).toBe(false);
    expect(countsAsActive('commitment_logged')).toBe(false);
    expect(countsAsActive('task_completed')).toBe(true);
  });
});
