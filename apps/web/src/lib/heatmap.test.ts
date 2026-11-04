import { describe, expect, it } from 'vitest';
import { heatLevel, heatWeeks } from './heatmap';

const day = (minutes: number, active = true) => ({
  date: '2026-11-04',
  xp: 0,
  tasks: 0,
  minutes,
  active,
});

describe('heatmap', () => {
  it('levels days by focus, active days first', () => {
    expect(heatLevel(undefined)).toBe(0);
    expect(heatLevel(day(60, false))).toBe(0);
    expect(heatLevel(day(0))).toBe(1);
    expect(heatLevel(day(29))).toBe(2);
    expect(heatLevel(day(30))).toBe(3);
    expect(heatLevel(day(90))).toBe(4);
  });

  it('lays weeks out from the week start, blank outside the span', () => {
    // 2026-11-04 is a Wednesday; weeks start on Monday.
    const weeks = heatWeeks('2026-11-04', '2026-11-10', 1);
    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toEqual([
      null,
      null,
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
    ]);
    expect(weeks[1]).toEqual(['2026-11-09', '2026-11-10', null, null, null, null, null]);
  });
});
