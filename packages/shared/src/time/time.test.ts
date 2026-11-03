import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  eachDay,
  isDateString,
  isValidTimeZone,
  startOfWeek,
  timeZoneOffsetMs,
  userDay,
  userDayRange,
  wallClock,
  weekdayOf,
  zonedTime,
} from '.';

const at = (iso: string) => new Date(iso);
const H = 3_600_000;

describe('day strings', () => {
  it('accepts only real days', () => {
    expect(isDateString('2026-11-03')).toBe(true);
    expect(isDateString('2028-02-29')).toBe(true);
    expect(isDateString('2026-02-29')).toBe(false);
    expect(isDateString('2026-13-01')).toBe(false);
    expect(isDateString('2026-1-01')).toBe(false);
    expect(isDateString('2026-11-03T00:00')).toBe(false);
    expect(isDateString(20261103)).toBe(false);
  });

  it('adds days across months, years and leap days', () => {
    expect(addDays('2026-11-03', 1)).toBe('2026-11-04');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-11-03', 0)).toBe('2026-11-03');
    expect(addDays('2026-11-03', -365)).toBe('2025-11-03');
  });

  it('counts days between', () => {
    expect(daysBetween('2026-09-28', '2026-10-02')).toBe(4);
    expect(daysBetween('2026-10-02', '2026-09-28')).toBe(-4);
    expect(daysBetween('2026-01-01', '2027-01-01')).toBe(365);
    // A DST change in between doesn't matter: days, not hours.
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
  });

  it('lists every day of a range', () => {
    expect(eachDay('2026-12-30', '2027-01-02')).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
    expect(eachDay('2026-11-03', '2026-11-03')).toEqual(['2026-11-03']);
    expect(eachDay('2026-11-04', '2026-11-03')).toEqual([]);
  });

  it('throws on malformed input instead of guessing', () => {
    expect(() => addDays('2026-02-30', 1)).toThrow(RangeError);
    expect(() => daysBetween('nope', '2026-01-01')).toThrow(RangeError);
  });
});

describe('weeks', () => {
  it('numbers weekdays like JS (0 = Sunday)', () => {
    expect(weekdayOf('2026-11-01')).toBe(0); // Sunday
    expect(weekdayOf('2026-11-03')).toBe(2); // Tuesday
  });

  it('finds the start of the week', () => {
    expect(startOfWeek('2026-11-03')).toBe('2026-11-02'); // Monday
    expect(startOfWeek('2026-11-02')).toBe('2026-11-02');
    expect(startOfWeek('2026-11-01')).toBe('2026-10-26'); // Sunday belongs to the week before
    expect(startOfWeek('2026-11-01', 0)).toBe('2026-11-01');
    expect(startOfWeek('2026-11-03', 0)).toBe('2026-11-01');
    expect(startOfWeek('2027-01-01', 6)).toBe('2026-12-26');
  });

  it('rejects a bad week start', () => {
    expect(() => startOfWeek('2026-11-03', 7)).toThrow(RangeError);
  });
});

describe('time zones', () => {
  it('validates zone names', () => {
    expect(isValidTimeZone('America/Sao_Paulo')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
  });

  it('reads the wall clock', () => {
    expect(wallClock(at('2026-11-03T02:30:00Z'), 'America/Sao_Paulo')).toEqual({
      date: '2026-11-02',
      hour: 23,
      minute: 30,
      second: 0,
    });
    expect(wallClock(at('2026-11-03T11:00:00Z'), 'Pacific/Kiritimati').date).toBe('2026-11-04');
    expect(wallClock(at('2026-11-03T10:00:00Z'), 'Pacific/Pago_Pago').date).toBe('2026-11-02');
  });

  it('computes offsets, including DST', () => {
    expect(timeZoneOffsetMs(at('2026-11-03T12:00:00Z'), 'America/Sao_Paulo')).toBe(-3 * H);
    expect(timeZoneOffsetMs(at('2026-07-01T12:00:00Z'), 'America/New_York')).toBe(-4 * H);
    expect(timeZoneOffsetMs(at('2026-12-01T12:00:00Z'), 'America/New_York')).toBe(-5 * H);
    expect(timeZoneOffsetMs(at('2026-11-03T12:00:00Z'), 'Asia/Kolkata')).toBe(5.5 * H);
  });

  it('converts wall time to an instant', () => {
    expect(zonedTime('2026-11-03', 4, 'America/Sao_Paulo').toISOString()).toBe(
      '2026-11-03T07:00:00.000Z',
    );
    expect(zonedTime('2026-11-03', 0, 'UTC').toISOString()).toBe('2026-11-03T00:00:00.000Z');
    expect(zonedTime('2026-11-04', 4, 'Pacific/Kiritimati').toISOString()).toBe(
      '2026-11-03T14:00:00.000Z',
    );
  });

  it('moves a time skipped by DST past the jump', () => {
    // New York springs forward 2026-03-08 at 02:00 → 03:00.
    expect(zonedTime('2026-03-08', 2, 'America/New_York').toISOString()).toBe(
      '2026-03-08T07:00:00.000Z', // 03:00 EDT
    );
    expect(zonedTime('2026-03-08', 4, 'America/New_York').toISOString()).toBe(
      '2026-03-08T08:00:00.000Z', // 04:00 EDT
    );
  });

  it('takes the first of a time that happens twice', () => {
    // New York falls back 2026-11-01 at 02:00 → 01:00.
    expect(zonedTime('2026-11-01', 1, 'America/New_York').toISOString()).toBe(
      '2026-11-01T05:00:00.000Z', // 01:00 EDT
    );
  });
});

describe('the user day', () => {
  const sp = { timeZone: 'America/Sao_Paulo', dayStartHour: 4 };

  it('counts late-night work for the day before', () => {
    expect(userDay(at('2026-11-03T05:30:00Z'), sp)).toBe('2026-11-02'); // 02:30 local
    expect(userDay(at('2026-11-03T06:59:59Z'), sp)).toBe('2026-11-02'); // 03:59:59 local
    expect(userDay(at('2026-11-03T07:00:00Z'), sp)).toBe('2026-11-03'); // 04:00 local
    expect(userDay(at('2026-11-04T02:59:00Z'), sp)).toBe('2026-11-03'); // 23:59 local
  });

  it('uses the calendar day with a midnight start', () => {
    const utc = { timeZone: 'UTC', dayStartHour: 0 };
    expect(userDay(at('2026-11-03T00:00:00Z'), utc)).toBe('2026-11-03');
    expect(userDay(at('2026-11-02T23:59:59Z'), utc)).toBe('2026-11-02');
  });

  it('handles the far ends of the offsets', () => {
    const plus14 = { timeZone: 'Pacific/Kiritimati', dayStartHour: 4 };
    const minus11 = { timeZone: 'Pacific/Pago_Pago', dayStartHour: 4 };
    const t = at('2026-11-03T12:00:00Z');
    expect(userDay(t, plus14)).toBe('2026-11-03'); // 02:00 on the 4th, before the day start
    expect(userDay(at('2026-11-03T14:00:00Z'), plus14)).toBe('2026-11-04'); // 04:00 on the 4th
    expect(userDay(t, minus11)).toBe('2026-11-02'); // 01:00 on the 3rd, before the day start
    expect(userDay(at('2026-11-03T15:00:00Z'), minus11)).toBe('2026-11-03'); // 04:00 on the 3rd
  });

  it('gives day ranges that agree with userDay', () => {
    const zones = [
      sp,
      { timeZone: 'America/New_York', dayStartHour: 4 },
      { timeZone: 'America/New_York', dayStartHour: 2 },
      { timeZone: 'Europe/London', dayStartHour: 0 },
      { timeZone: 'Asia/Kolkata', dayStartHour: 5 },
      { timeZone: 'Pacific/Kiritimati', dayStartHour: 4 },
      { timeZone: 'Pacific/Pago_Pago', dayStartHour: 23 },
    ];
    // Around both 2026 New York DST changes, and the London ones.
    const days = [
      ...eachDay('2026-03-06', '2026-03-10'),
      ...eachDay('2026-03-28', '2026-03-30'),
      ...eachDay('2026-10-24', '2026-11-03'),
    ];
    for (const settings of zones) {
      for (const day of days) {
        const { start, end } = userDayRange(day, settings);
        expect(end.getTime()).toBeGreaterThan(start.getTime());
        expect(userDay(start, settings), `${settings.timeZone} ${day} start`).toBe(day);
        expect(
          userDay(new Date(end.getTime() - 1), settings),
          `${settings.timeZone} ${day} end`,
        ).toBe(day);
        expect(userDay(end, settings)).toBe(addDays(day, 1));
      }
    }
  });

  it('makes DST days 23 or 25 hours long', () => {
    const ny = { timeZone: 'America/New_York', dayStartHour: 4 };
    const len = (day: string) => {
      const { start, end } = userDayRange(day, ny);
      return (end.getTime() - start.getTime()) / H;
    };
    expect(len('2026-03-07')).toBe(23);
    expect(len('2026-10-31')).toBe(25);
    expect(len('2026-11-03')).toBe(24);
  });
});
