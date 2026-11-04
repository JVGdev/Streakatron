import { describe, expect, it } from 'vitest';
import { zonedTime } from '../time';
import {
  clockInstant,
  clockOf,
  commitmentReminderDue,
  describeReminder,
  formatEvery,
  latestDue,
  minutesOf,
  reminderProblem,
  reminderSlots,
  reminderTimes,
  type CommitmentReminder,
} from '.';

const SP = { timeZone: 'America/Sao_Paulo', dayStartHour: 4 };
const DAY = '2026-11-04';
/** São Paulo wall clock on DAY (UTC−3, no DST). */
const at = (time: string, day = DAY) => {
  const m = minutesOf(time);
  return zonedTime(day, Math.floor(m / 60), SP.timeZone, m % 60);
};
const duolingo: CommitmentReminder = {
  kind: 'repeat',
  from: '10:00',
  everyMinutes: 180,
  until: '22:00',
};

describe('clock times', () => {
  it('reads and writes HH:MM', () => {
    expect(minutesOf('00:00')).toBe(0);
    expect(minutesOf('22:30')).toBe(1350);
    expect(clockOf(1350)).toBe('22:30');
    expect(clockOf(1440 + 5)).toBe('00:05');
    expect(() => minutesOf('24:00')).toThrow();
    expect(() => minutesOf('9:00')).toThrow();
  });

  it('places a time inside the user day: before the day start is the night after', () => {
    expect(clockInstant(DAY, '10:00', SP).toISOString()).toBe('2026-11-04T13:00:00.000Z');
    expect(clockInstant(DAY, '01:00', SP).toISOString()).toBe('2026-11-05T04:00:00.000Z');
  });

  it('keeps minutes in zoned times', () => {
    expect(zonedTime(DAY, 9, SP.timeZone, 45).toISOString()).toBe('2026-11-04T12:45:00.000Z');
  });
});

describe('reminderProblem', () => {
  it('accepts the use case', () => {
    expect(reminderProblem(duolingo)).toBeNull();
    expect(reminderProblem({ kind: 'once', at: '08:15' })).toBeNull();
  });
  it('rejects bad shapes', () => {
    expect(reminderProblem({ kind: 'once', at: '8:15' })).toMatch(/time/);
    expect(reminderProblem({ ...duolingo, until: '09:00' })).toMatch(/later/);
    expect(reminderProblem({ ...duolingo, until: '10:00' })).toMatch(/later/);
    expect(reminderProblem({ ...duolingo, everyMinutes: 5 })).toMatch(/every/);
    expect(reminderProblem({ ...duolingo, everyMinutes: 1000 })).toMatch(/every/);
  });
});

describe('reminderTimes and reminderSlots', () => {
  it('repeats from a time every N until a time, both included', () => {
    expect(reminderTimes(duolingo)).toEqual(['10:00', '13:00', '16:00', '19:00', '22:00']);
    expect(reminderTimes({ ...duolingo, until: '21:59' })).toEqual([
      '10:00',
      '13:00',
      '16:00',
      '19:00',
    ]);
    expect(reminderTimes({ kind: 'once', at: '07:30' })).toEqual(['07:30']);
  });

  it('turns them into instants of the user day, in order', () => {
    expect(reminderSlots(duolingo, DAY, SP).map((d) => d.toISOString())).toEqual([
      '2026-11-04T13:00:00.000Z',
      '2026-11-04T16:00:00.000Z',
      '2026-11-04T19:00:00.000Z',
      '2026-11-04T22:00:00.000Z',
      '2026-11-05T01:00:00.000Z',
    ]);
  });

  it('never fires past the day end: a time before the day start is that night', () => {
    const late: CommitmentReminder = { kind: 'once', at: '03:59' };
    expect(reminderSlots(late, DAY, SP).map((d) => d.toISOString())).toEqual([
      '2026-11-05T06:59:00.000Z',
    ]);
    // With a midnight day start, 00:30 is the start of the day itself.
    const midnight = { ...SP, dayStartHour: 0 };
    expect(reminderSlots({ kind: 'once', at: '00:30' }, DAY, midnight)[0]!.toISOString()).toBe(
      '2026-11-04T03:30:00.000Z',
    );
  });
});

describe('latestDue', () => {
  const slots = reminderSlots(duolingo, DAY, SP);
  it('is the latest slot at or before now, within the grace', () => {
    expect(latestDue(slots, at('09:59'), 3_600_000)).toBeNull();
    expect(latestDue(slots, at('10:00'), 3_600_000)).toEqual(at('10:00'));
    expect(latestDue(slots, at('10:59'), 3_600_000)).toEqual(at('10:00'));
    expect(latestDue(slots, at('11:01'), 3_600_000)).toBeNull();
    expect(latestDue(slots, at('16:20'), 3_600_000)).toEqual(at('16:00'));
  });
});

describe('commitmentReminderDue', () => {
  const c = { reminder: duolingo, remindAgainAt: null };
  it('owes the latest slot', () => {
    expect(commitmentReminderDue(c, DAY, SP, at('13:05'))).toEqual(at('13:00'));
    expect(commitmentReminderDue({ ...c, reminder: null }, DAY, SP, at('13:05'))).toBeNull();
  });

  it('a snooze holds everything until it, then owes it once', () => {
    const snoozed = { ...c, remindAgainAt: at('13:40') }; // snoozed at 12:40
    expect(commitmentReminderDue(snoozed, DAY, SP, at('13:05'))).toBeNull();
    expect(commitmentReminderDue(snoozed, DAY, SP, at('13:40'))).toEqual(at('13:40'));
    expect(commitmentReminderDue(snoozed, DAY, SP, at('14:30'))).toEqual(at('13:40'));
    // The 16:00 slot is outside the snoozed hour: it comes as usual.
    expect(commitmentReminderDue(snoozed, DAY, SP, at('16:00'))).toEqual(at('16:00'));
  });

  it('a slot inside the snoozed hour is skipped', () => {
    const snoozed = { ...c, remindAgainAt: at('13:30') }; // snoozed at 12:30, over the 13:00 slot
    expect(commitmentReminderDue(snoozed, DAY, SP, at('13:30'))).toEqual(at('13:30'));
  });

  it("an old snooze from yesterday doesn't matter", () => {
    const old = { ...c, remindAgainAt: at('21:00', '2026-11-03') };
    expect(commitmentReminderDue(old, DAY, SP, at('10:01'))).toEqual(at('10:00'));
  });
});

describe('wording', () => {
  it('describes reminders', () => {
    expect(describeReminder(duolingo)).toBe('10:00–22:00, every 3 h');
    expect(describeReminder({ kind: 'once', at: '08:00' })).toBe('At 08:00');
    expect(describeReminder(null)).toBe('No reminder');
    expect(formatEvery(30)).toBe('30 min');
    expect(formatEvery(90)).toBe('1 h 30 min');
  });
});
