import { describe, expect, it } from 'vitest';
import {
  addMonths,
  daysAhead,
  describeTaskRepeat,
  dueScheduleDay,
  firstSeriesDay,
  nextSeriesDay,
  seriesDateField,
  shiftedDates,
  taskRepeatProblem,
  timesPerWeek,
  type TaskRepeat,
} from '.';

// 2026-11-06 is a Friday.
const fridays: TaskRepeat = { kind: 'schedule', every: 'week', interval: 1, weekdays: [5] };
const fifth: TaskRepeat = { kind: 'schedule', every: 'month', interval: 1 };
const twoDays: TaskRepeat = { kind: 'after_done', every: 'day', interval: 2 };

describe('task repeats', () => {
  it('checks the rule', () => {
    expect(taskRepeatProblem(fridays, '2026-11-06')).toBeNull();
    expect(taskRepeatProblem({ ...twoDays, interval: 0 }, '2026-11-06')).toMatch(/1 to 90/);
    expect(
      taskRepeatProblem({ kind: 'schedule', every: 'week', interval: 1 }, '2026-11-06'),
    ).toMatch(/day of the week/);
  });

  it('starts on the task’s date, or the first matching day', () => {
    expect(firstSeriesDay(fridays, '2026-11-04', '2026-11-04')).toBe('2026-11-04');
    expect(firstSeriesDay(fridays, null, '2026-11-04')).toBe('2026-11-06');
    expect(firstSeriesDay(fridays, null, '2026-11-06')).toBe('2026-11-06');
    expect(firstSeriesDay(fifth, null, '2026-11-04')).toBe('2026-11-04');
    expect(firstSeriesDay(twoDays, null, '2026-11-04')).toBe('2026-11-04');
  });

  it('the next one after a completion', () => {
    // Done early or late, a schedule goes to its next day after the newest.
    expect(nextSeriesDay(fridays, '2026-11-06', '2026-11-06', '2026-11-05')).toBe('2026-11-13');
    expect(nextSeriesDay(fridays, '2026-11-06', '2026-11-06', '2026-11-20')).toBe('2026-11-13');
    expect(nextSeriesDay(fifth, '2026-11-05', '2026-11-05', '2026-11-05')).toBe('2026-12-05');
    // After done counts from the completion.
    expect(nextSeriesDay(twoDays, '2026-11-04', '2026-11-04', '2026-11-07')).toBe('2026-11-09');
    expect(
      nextSeriesDay({ kind: 'after_done', every: 'week', interval: 1 }, 'x', 'x', '2026-11-07'),
    ).toBe('2026-11-14');
    expect(
      nextSeriesDay({ kind: 'after_done', every: 'month', interval: 1 }, 'x', 'x', '2027-01-31'),
    ).toBe('2027-02-28');
    // Over.
    const short: TaskRepeat = { ...fridays, until: '2026-11-10' } as TaskRepeat;
    expect(nextSeriesDay(short, '2026-11-06', '2026-11-06', '2026-11-06')).toBeNull();
  });

  it('owes only the latest missed day', () => {
    expect(dueScheduleDay(fridays, '2026-11-06', '2026-11-06', '2026-11-12')).toBeNull();
    expect(dueScheduleDay(fridays, '2026-11-06', '2026-11-06', '2026-11-13')).toBe('2026-11-13');
    // Three weeks away: one, not three.
    expect(dueScheduleDay(fridays, '2026-11-06', '2026-11-06', '2026-11-30')).toBe('2026-11-27');
    expect(dueScheduleDay(twoDays, '2026-11-06', '2026-11-06', '2026-11-30')).toBeNull();
  });

  it('days ahead for the calendar', () => {
    expect(daysAhead(fridays, '2026-11-06', '2026-11-13', '2026-11-01', '2026-11-30')).toEqual([
      '2026-11-20',
      '2026-11-27',
    ]);
    expect(daysAhead(twoDays, '2026-11-06', '2026-11-13', '2026-11-01', '2026-11-30')).toEqual([]);
  });

  it('moves the other date by as many days', () => {
    expect(
      shiftedDates(
        { dueDate: '2026-11-06', scheduledDate: '2026-11-04' },
        'due',
        '2026-11-06',
        '2026-11-13',
      ),
    ).toEqual({ dueDate: '2026-11-13', scheduledDate: '2026-11-11', shift: 7 });
    expect(
      shiftedDates(
        { dueDate: null, scheduledDate: '2026-11-06' },
        'scheduled',
        '2026-11-06',
        '2026-11-08',
      ),
    ).toEqual({ dueDate: null, scheduledDate: '2026-11-08', shift: 2 });
    expect(seriesDateField({ dueDate: null, scheduledDate: '2026-11-06' })).toBe('scheduled');
    expect(seriesDateField({ dueDate: null, scheduledDate: null })).toBe('due');
  });

  it('adds months on the same day', () => {
    expect(addMonths('2026-11-05', 1)).toBe('2026-12-05');
    expect(addMonths('2026-12-31', 2)).toBe('2027-02-28');
  });

  it('counts how busy a schedule is', () => {
    expect(timesPerWeek({ kind: 'schedule', every: 'day', interval: 1 })).toBe(7);
    expect(timesPerWeek(fridays)).toBe(1);
    expect(
      timesPerWeek({ kind: 'schedule', every: 'week', interval: 2, weekdays: [1, 3, 5] }),
    ).toBe(1.5);
    expect(timesPerWeek(fifth)).toBeLessThan(1);
    expect(timesPerWeek(twoDays)).toBe(0);
  });

  it('describes', () => {
    expect(describeTaskRepeat(fridays, '2026-11-06')).toBe('Every week on Fri');
    expect(describeTaskRepeat(fifth, '2026-11-05')).toBe('Every month on the 5th');
    expect(describeTaskRepeat(twoDays, '2026-11-05')).toBe('2 days after it’s done');
    expect(describeTaskRepeat(null, '2026-11-05')).toBe('Doesn’t repeat');
  });
});
