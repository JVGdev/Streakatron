import { describe, expect, it } from 'vitest';
import { convertPlan, repeatOfSchedule, scheduleOfRepeat, type ConvertSource } from '.';

const today = '2026-11-05'; // a Thursday

const task = (over: Partial<ConvertSource & { kind: 'task' }> = {}): ConvertSource => ({
  kind: 'task',
  title: 'Duolingo',
  projectId: 'prj_1',
  spotlighted: false,
  dueDate: null,
  scheduledDate: null,
  repeat: null,
  reminder: false,
  subtasks: 0,
  goal: false,
  effort: false,
  ...over,
});

const commitment = (over: Partial<ConvertSource & { kind: 'commitment' }> = {}): ConvertSource => ({
  kind: 'commitment',
  title: 'Duolingo',
  projectId: null,
  measure: 'check',
  target: 1,
  unit: null,
  period: 'day',
  schedule: null,
  reminder: false,
  ...over,
});

describe('days and repeats', () => {
  it('maps both ways where they match', () => {
    expect(scheduleOfRepeat({ every: 'day', interval: 1 })).toBeNull();
    expect(scheduleOfRepeat({ every: 'week', interval: 1, weekdays: [1, 3] })).toEqual({
      days: [1, 3],
    });
    expect(scheduleOfRepeat({ every: 'week', interval: 2, weekdays: [1] })).toBeUndefined();
    expect(scheduleOfRepeat({ every: 'month', interval: 1 })).toBeUndefined();
    expect(repeatOfSchedule({ days: [5, 1] })).toEqual({
      every: 'week',
      interval: 1,
      weekdays: [1, 5],
      until: null,
    });
    expect(repeatOfSchedule(null)).toEqual({ every: 'day', interval: 1, until: null });
  });
});

describe('convertPlan', () => {
  it('a daily task becomes a daily commitment, and back', () => {
    const daily = task({
      dueDate: today,
      repeat: { kind: 'schedule', every: 'day', interval: 1 },
      subtasks: 2,
    });
    const plan = convertPlan(daily, 'commitment', today);
    expect(plan.fields).toMatchObject({ kind: 'commitment', measure: 'check', schedule: null });
    expect(plan.kept).toContain('Every day');
    expect(plan.dropped).toContain('2 subtasks');

    const back = convertPlan(commitment({ schedule: { days: [1, 3] } }), 'task', today);
    expect(back.fields).toMatchObject({
      kind: 'task',
      dueDate: null,
      repeat: { kind: 'schedule', every: 'week', weekdays: [1, 3] },
    });
    expect(back.kept).toContain('Days');
    expect(back.dropped).toContain('History and streak');
  });

  it('a task to a goal needs a project and keeps its date as the deadline', () => {
    const inbox = task({ projectId: null, dueDate: '2026-12-01', spotlighted: true });
    const plan = convertPlan(inbox, 'goal', today);
    expect(plan.needsProject).toBe(true);
    expect(plan.fields).toMatchObject({ kind: 'goal', dueDate: '2026-12-01', spotlight: true });
  });

  it('a commitment loses its spotlight-less shape: no spotlight to carry', () => {
    const plan = convertPlan(task({ spotlighted: true }), 'commitment', today);
    expect(plan.dropped).toContain('Spotlight');
  });

  it('minutes commitments and time goals', () => {
    const listening = commitment({
      measure: 'minutes',
      target: 15,
      schedule: { days: [1, 2, 3, 4, 5] },
    });
    expect(convertPlan(listening, 'goal', today).fields).toMatchObject({
      kind: 'goal',
      goalKind: 'time',
      targetMinutes: 75,
      period: 'week',
    });
    const goal: ConvertSource = {
      kind: 'goal',
      title: '4 h a week',
      projectId: 'prj_1',
      spotlighted: false,
      goalKind: 'time',
      targetMinutes: 240,
      period: 'week',
      dueDate: null,
      duePrecision: 'day',
    };
    expect(convertPlan(goal, 'commitment', today).fields).toMatchObject({
      measure: 'minutes',
      target: 240,
      period: 'week',
    });
  });

  it('events: months, repeats, times', () => {
    const departure: ConvertSource = {
      kind: 'event',
      title: 'Departure',
      projectId: null,
      spotlighted: true,
      date: '2027-03-01',
      precision: 'month',
      startTime: null,
      repeat: null,
      reminder: false,
    };
    expect(convertPlan(departure, 'goal', today).fields).toMatchObject({
      dueDate: '2027-03-01',
      duePrecision: 'month',
    });
    expect(convertPlan(departure, 'task', today).fields).toMatchObject({ dueDate: '2027-03-31' });

    const classes: ConvertSource = {
      ...departure,
      title: 'Course class',
      spotlighted: false,
      date: '2026-09-07',
      precision: 'day',
      startTime: '19:00',
      repeat: { every: 'week', interval: 1, weekdays: [1, 3] },
      reminder: true,
    };
    const asTask = convertPlan(classes, 'task', today);
    // The next class, not the first one months ago.
    expect(asTask.fields).toMatchObject({ dueDate: '2026-11-09', repeat: { kind: 'schedule' } });
    expect(asTask.dropped).toEqual(expect.arrayContaining(['Time', 'Reminder']));
    expect(convertPlan(classes, 'commitment', today).fields).toMatchObject({
      schedule: { days: [1, 3] },
    });
  });

  it('a commitment to an event starts on its next day', () => {
    const plan = convertPlan(commitment({ schedule: { days: [1] } }), 'event', today);
    expect(plan.fields).toMatchObject({
      kind: 'event',
      date: '2026-11-09',
      precision: 'day',
      repeat: { every: 'week', weekdays: [1] },
    });
  });

  it('after-done repeats only stay tasks', () => {
    const review = task({
      dueDate: today,
      repeat: { kind: 'after_done', every: 'day', interval: 2 },
    });
    expect(convertPlan(review, 'event', today).dropped).toContain('Repeat');
    expect(convertPlan(review, 'event', today).fields).toMatchObject({ repeat: null, date: today });
  });
});
