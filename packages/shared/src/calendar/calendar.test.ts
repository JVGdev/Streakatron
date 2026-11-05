import { describe, expect, it } from 'vitest';
import {
  dayLoad,
  deadlineOf,
  describeEventReminder,
  describeRepeat,
  eventReminderDue,
  monthEnd,
  monthsBetween,
  nextOccurrence,
  normalizeRepeat,
  occurrences,
  repeatProblem,
  timeRange,
  type RemindableEvent,
  type Repeat,
} from '.';

const SP = 'America/Sao_Paulo'; // UTC−3, no DST
/** A São Paulo wall-clock instant. */
const sp = (day: string, time: string) => new Date(`${day}T${time}:00-03:00`);

// The use case's course: Mon and Wed classes (2026-11-02 is a Monday).
const classes: Repeat = { every: 'week', interval: 1, weekdays: [1, 3] };

describe('tentative dates', () => {
  it('a month is due at its end', () => {
    expect(monthEnd('2027-02-01')).toBe('2027-02-28');
    expect(monthEnd('2028-02-10')).toBe('2028-02-29');
    expect(deadlineOf('2027-03-01', 'month')).toBe('2027-03-31');
    expect(deadlineOf('2027-03-05', 'day')).toBe('2027-03-05');
    expect(deadlineOf(null, 'tbd')).toBeNull();
  });
  it('counts months', () => {
    expect(monthsBetween('2026-11-04', '2027-03-01')).toBe(4);
    expect(monthsBetween('2026-11-30', '2026-11-01')).toBe(0);
    expect(monthsBetween('2027-01-01', '2026-12-31')).toBe(-1);
  });
});

describe('occurrences', () => {
  it('a one-off event is on its day', () => {
    expect(occurrences('2027-07-04', null, '2027-07-01', '2027-07-31')).toEqual(['2027-07-04']);
    expect(occurrences('2027-07-04', null, '2027-08-01', '2027-08-31')).toEqual([]);
  });

  it('weekly on chosen days, from the start', () => {
    expect(occurrences('2026-11-04', classes, '2026-11-01', '2026-11-15')).toEqual([
      '2026-11-04',
      '2026-11-09',
      '2026-11-11',
    ]);
  });

  it('every 2 weeks counts weeks from the start', () => {
    const r: Repeat = { every: 'week', interval: 2, weekdays: [2] };
    expect(occurrences('2026-11-03', r, '2026-11-01', '2026-12-01')).toEqual([
      '2026-11-03',
      '2026-11-17',
      '2026-12-01',
    ]);
  });

  it('every N days, also from far back', () => {
    const r: Repeat = { every: 'day', interval: 3 };
    expect(occurrences('2026-01-01', r, '2026-01-05', '2026-01-12')).toEqual([
      '2026-01-07',
      '2026-01-10',
    ]);
  });

  it('monthly on the start day, the last day in shorter months', () => {
    const r: Repeat = { every: 'month', interval: 1 };
    expect(occurrences('2026-01-31', r, '2026-02-01', '2026-04-30')).toEqual([
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
    expect(occurrences('2020-05-05', r, '2026-11-01', '2026-12-31')).toEqual([
      '2026-11-05',
      '2026-12-05',
    ]);
  });

  it('yearly, Feb 29 on Feb 28 in other years', () => {
    const r: Repeat = { every: 'year', interval: 1 };
    expect(occurrences('2024-02-29', r, '2025-01-01', '2028-12-31')).toEqual([
      '2025-02-28',
      '2026-02-28',
      '2027-02-28',
      '2028-02-29',
    ]);
  });

  it('stops after until', () => {
    const r: Repeat = { ...classes, until: '2026-11-09' };
    expect(occurrences('2026-11-02', r, '2026-11-01', '2026-11-30')).toEqual([
      '2026-11-02',
      '2026-11-04',
      '2026-11-09',
    ]);
  });

  it('the next one', () => {
    expect(nextOccurrence('2026-11-02', classes, '2026-11-05')).toBe('2026-11-09');
    expect(nextOccurrence('2026-11-02', classes, '2026-11-04')).toBe('2026-11-04');
    expect(nextOccurrence('2027-07-04', null, '2026-11-04')).toBe('2027-07-04');
    expect(nextOccurrence('2026-07-04', null, '2026-11-04')).toBeNull();
    expect(nextOccurrence('2026-11-02', { ...classes, until: '2026-11-04' }, '2026-11-05')).toBe(
      null,
    );
    expect(nextOccurrence('2026-01-31', { every: 'month', interval: 1 }, '2026-02-01')).toBe(
      '2026-02-28',
    );
  });
});

describe('repeat rules', () => {
  it('checks the shape', () => {
    expect(repeatProblem(classes, '2026-11-02')).toBeNull();
    expect(repeatProblem({ every: 'week', interval: 1, weekdays: [] }, '2026-11-02')).toMatch(
      /day of the week/,
    );
    expect(repeatProblem({ every: 'day', interval: 0 }, '2026-11-02')).toMatch(/1 to 30/);
    expect(repeatProblem({ every: 'day', interval: 1, weekdays: [1] }, '2026-11-02')).toMatch(
      /weekly/,
    );
    expect(repeatProblem({ every: 'day', interval: 1, until: '2026-11-01' }, '2026-11-02')).toMatch(
      /before/,
    );
  });
  it('normalizes', () => {
    expect(normalizeRepeat({ every: 'week', interval: 1, weekdays: [3, 1, 3] })).toEqual({
      every: 'week',
      interval: 1,
      weekdays: [1, 3],
      until: null,
    });
    expect(normalizeRepeat({ every: 'month', interval: 2, weekdays: [1] })).toEqual({
      every: 'month',
      interval: 2,
      until: null,
    });
  });
  it('reads', () => {
    expect(describeRepeat(classes, '2026-11-02')).toBe('Every week on Mon and Wed');
    expect(describeRepeat({ every: 'day', interval: 2 }, '2026-11-02')).toBe('Every 2 days');
    expect(describeRepeat({ every: 'month', interval: 1 }, '2026-11-02')).toBe(
      'Every month on the 2nd',
    );
    expect(describeRepeat({ every: 'year', interval: 1 }, '2026-03-11')).toBe(
      'Every year on Mar 11',
    );
    expect(
      describeRepeat(
        { every: 'week', interval: 2, weekdays: [2], until: '2026-12-20' },
        '2026-11-03',
      ),
    ).toBe('Every 2 weeks on Tue, until Dec 20, 2026');
    expect(describeRepeat(null, '2026-11-02')).toBe('Doesn’t repeat');
  });
});

describe('times', () => {
  it('ranges', () => {
    expect(timeRange('19:00', 90)).toBe('19:00–20:30');
    expect(timeRange('23:00', 90)).toBe('23:00–00:30');
    expect(timeRange('08:00', null)).toBe('08:00');
  });
});

describe('event reminders', () => {
  const course: RemindableEvent = {
    date: '2026-11-02',
    precision: 'day',
    startTime: '19:00',
    repeat: classes,
    reminderMinutes: 15,
  };

  it('15 minutes before each class', () => {
    expect(eventReminderDue(course, sp('2026-11-04', '18:44'), SP)).toBeNull();
    expect(eventReminderDue(course, sp('2026-11-04', '18:45'), SP)).toEqual({
      at: sp('2026-11-04', '18:45'),
      day: '2026-11-04',
    });
    expect(eventReminderDue(course, sp('2026-11-04', '18:59'), SP)?.day).toBe('2026-11-04');
    // Not once the class has started, and not on Tuesdays.
    expect(eventReminderDue(course, sp('2026-11-04', '19:00'), SP)).toBeNull();
    expect(eventReminderDue(course, sp('2026-11-03', '18:50'), SP)).toBeNull();
  });

  it('all-day events remind at 09:00, days before too', () => {
    const exam: RemindableEvent = {
      date: '2027-07-04',
      precision: 'day',
      startTime: null,
      repeat: null,
      reminderMinutes: 1440,
    };
    expect(eventReminderDue(exam, sp('2027-07-03', '09:10'), SP)).toEqual({
      at: sp('2027-07-03', '09:00'),
      day: '2027-07-04',
    });
    expect(eventReminderDue(exam, sp('2027-07-03', '09:31'), SP)).toBeNull();
    expect(
      eventReminderDue({ ...exam, reminderMinutes: 0 }, sp('2027-07-04', '09:00'), SP)?.day,
    ).toBe('2027-07-04');
  });

  it('a reminder days ahead finds its occurrence', () => {
    const e: RemindableEvent = { ...course, reminderMinutes: 2 * 1440 };
    expect(eventReminderDue(e, sp('2026-11-07', '19:05'), SP)?.day).toBe('2026-11-09');
  });

  it('tentative and reminderless events never remind', () => {
    expect(
      eventReminderDue({ ...course, reminderMinutes: null }, sp('2026-11-04', '18:45'), SP),
    ).toBe(null);
    expect(
      eventReminderDue(
        { ...course, precision: 'month', repeat: null },
        sp('2026-11-01', '18:45'),
        SP,
      ),
    ).toBeNull();
  });

  it('reads', () => {
    expect(describeEventReminder(15, false)).toBe('15 min before');
    expect(describeEventReminder(0, false)).toBe('At start');
    expect(describeEventReminder(60, false)).toBe('1 h before');
    expect(describeEventReminder(1440, false)).toBe('1 day before');
    expect(describeEventReminder(0, true)).toBe('On the day at 09:00');
    expect(describeEventReminder(1440, true)).toBe('The day before at 09:00');
    expect(describeEventReminder(2880, true)).toBe('2 days before at 09:00');
    expect(describeEventReminder(10080, true)).toBe('A week before at 09:00');
    expect(describeEventReminder(null, true)).toBe('No reminder');
  });
});

describe('day load', () => {
  it('weighs tasks by effort and events by the hour', () => {
    expect(dayLoad([], 0)).toEqual({ tasks: 0, eventMinutes: 0, points: 0, level: 'free' });
    expect(dayLoad([{ effort: null }, { effort: 'M' }], 0).level).toBe('light');
    expect(dayLoad([{ effort: 'L' }], 90)).toMatchObject({ points: 4.5, level: 'busy' });
    expect(dayLoad([{ effort: 'L' }, { effort: 'L' }], 120).level).toBe('full');
  });
});
