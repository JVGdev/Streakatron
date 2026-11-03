import { describe, expect, it } from 'vitest';
import { countdown, formatDayShort } from './days';

describe('days', () => {
  const today = '2026-11-04'; // Wednesday

  it('formats days relative to today', () => {
    expect(formatDayShort(today, today)).toBe('Today');
    expect(formatDayShort('2026-11-05', today)).toBe('Tomorrow');
    expect(formatDayShort('2026-11-03', today)).toBe('Yesterday');
    expect(formatDayShort('2026-11-07', today)).toBe('Sat');
    expect(formatDayShort('2026-11-20', today)).toBe('Nov 20');
    expect(formatDayShort('2027-01-03', today)).toBe('Jan 3, 2027');
  });

  it('counts down', () => {
    expect(countdown(today, today)).toBe('Due today');
    expect(countdown('2026-11-05', today)).toBe('1 day left');
    expect(countdown('2026-11-14', today)).toBe('10 days left');
    expect(countdown('2026-11-02', today)).toBe('2 days late');
  });
});
