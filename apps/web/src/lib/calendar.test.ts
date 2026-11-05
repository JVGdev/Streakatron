import { describe, expect, it } from 'vitest';
import { loadOf, monthGrid, placeEvents, placeTasks, weekDays } from './calendar';

describe('views', () => {
  it('a month in whole weeks', () => {
    const g = monthGrid('2026-11-17', 1);
    expect(g.from).toBe('2026-10-26');
    expect(g.to).toBe('2026-12-06');
    expect(g.weeks).toHaveLength(6);
    expect(g.weeks[0]![0]).toBe('2026-10-26');
    expect(monthGrid('2026-02-10', 0).weeks).toHaveLength(4); // Feb 2026 starts on a Sunday
  });
  it('a week', () => {
    expect(weekDays('2026-11-05', 1)).toMatchObject({ from: '2026-11-02', to: '2026-11-08' });
  });
});

describe('placing', () => {
  const t = (id: string, scheduledDate: string | null, dueDate: string | null) => ({
    id,
    scheduledDate,
    dueDate,
    effort: null,
  });
  it('tasks on their scheduled and due days', () => {
    const m = placeTasks(
      [
        t('a', '2026-11-03', '2026-11-05'),
        t('b', '2026-11-04', '2026-11-04'),
        t('c', null, '2026-12-01'),
      ],
      '2026-11-02',
      '2026-11-08',
    );
    expect(m.get('2026-11-03')).toEqual([
      { task: expect.objectContaining({ id: 'a' }), planned: true, due: false },
    ]);
    expect(m.get('2026-11-05')![0]).toMatchObject({ planned: false, due: true });
    expect(m.get('2026-11-04')![0]).toMatchObject({ planned: true, due: true });
    expect([...m.keys()].sort()).toEqual(['2026-11-03', '2026-11-04', '2026-11-05']);
  });
  it('events all day first, then by time; the load counts each task once', () => {
    const e = (startTime: string | null, durationMinutes: number | null) => ({
      startTime,
      durationMinutes,
      days: ['2026-11-04'],
    });
    const list = placeEvents([e('19:00', 90), e(null, null), e('08:00', null)]).get('2026-11-04')!;
    expect(list.map((x) => x.startTime)).toEqual([null, '08:00', '19:00']);
    const tasks = placeTasks([t('a', '2026-11-03', '2026-11-04')], '2026-11-01', '2026-11-30');
    // Scheduled on the 3rd: it weighs there, not on its due day.
    expect(loadOf(tasks.get('2026-11-04')!, list)).toMatchObject({ tasks: 0, eventMinutes: 90 });
    expect(loadOf(tasks.get('2026-11-03')!, [])).toMatchObject({ tasks: 1, level: 'light' });
  });
});
