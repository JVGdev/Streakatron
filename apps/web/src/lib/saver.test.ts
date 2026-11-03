import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushAll, live, Saver, type SaveStatus } from './saver';

/** A send that resolves (or rejects) only when told to. */
function controlledSend<T>() {
  const calls: { value: T; resolve: () => void; reject: (e: unknown) => void }[] = [];
  const send = (value: T) =>
    new Promise<void>((resolve, reject) => calls.push({ value, resolve, reject }));
  return { send, calls };
}

/** Let pending promise callbacks run (timers are faked, so no setTimeout here). */
const tick = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe('Saver', () => {
  let value: { title: string };
  const read = () => value;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    value = { title: 'a' };
  });
  afterEach(() => {
    vi.useRealTimers();
    live.clear();
  });

  it('saves a moment after the changes stop', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const statuses: SaveStatus[] = [];
    const s = new Saver(read, send, 500, { status: (x) => statuses.push(x) });

    value = { title: 'ab' };
    s.changed();
    vi.advanceTimersByTime(300);
    value = { title: 'abc' };
    s.changed();
    vi.advanceTimersByTime(499);
    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    await vi.waitFor(() => expect(s.status).toBe('saved'));

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ title: 'abc' });
    expect(statuses).toEqual(['pending', 'saving', 'saved']);
  });

  it('sends nothing for a change undone before it goes', () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const s = new Saver(read, send, 500);
    value = { title: 'b' };
    s.changed();
    value = { title: 'a' };
    s.changed();
    vi.advanceTimersByTime(1000);
    expect(send).not.toHaveBeenCalled();
    expect(s.status).toBe('saved');
  });

  it('keeps one save in flight; what changed meanwhile goes next, as it is then', async () => {
    const { send, calls } = controlledSend<{ title: string }>();
    const s = new Saver(read, send, 100);

    value = { title: 'b' };
    void s.flush();
    await tick();
    value = { title: 'c' };
    void s.flush();
    value = { title: 'd' };
    void s.flush();
    await tick();
    expect(calls.map((c) => c.value)).toEqual([{ title: 'b' }]);

    calls[0]!.resolve();
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]!.value).toEqual({ title: 'd' }); // not 'c': the value as it is now
    calls[1]!.resolve();
    await vi.waitFor(() => expect(s.status).toBe('saved'));
    expect(calls).toHaveLength(2);
  });

  it('keeps a failed change and reports a run of failures once', async () => {
    const errors: boolean[] = [];
    const send = vi.fn().mockRejectedValue(new Error('offline'));
    const s = new Saver(read, send, 100, { error: (_e, first) => errors.push(first) });

    value = { title: 'b' };
    await s.flush();
    expect(s.status).toBe('error');
    expect(s.dirty()).toBe(true);
    await s.flush();
    expect(errors).toEqual([true, false]);

    send.mockResolvedValue(undefined);
    await s.flush();
    expect(s.status).toBe('saved');
    expect(s.dirty()).toBe(false);
  });

  it('accepts a value that came from the server', () => {
    const send = vi.fn();
    const s = new Saver(read, send, 100);
    value = { title: 'from server' };
    s.accept();
    s.changed();
    vi.advanceTimersByTime(500);
    expect(send).not.toHaveBeenCalled();
  });

  it('flushes every live saver at once', async () => {
    const sendA = vi.fn().mockResolvedValue(undefined);
    const sendB = vi.fn().mockResolvedValue(undefined);
    let b = 1;
    const a = new Saver(read, sendA, 10_000);
    const other = new Saver(() => b, sendB, 10_000);
    live.add(a);
    live.add(other);
    value = { title: 'z' };
    b = 2;
    a.changed();
    other.changed();
    await flushAll();
    expect(sendA).toHaveBeenCalledWith({ title: 'z' });
    expect(sendB).toHaveBeenCalledWith(2);
  });
});
