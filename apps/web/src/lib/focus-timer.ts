// The focus timer's client side (D29). The server owns the session; this keeps the clock in step
// with it and remembers small per-browser things: which finished session you've already seen, the
// break you're on (breaks aren't stored), and which session already chimed.

import { useEffect, useState } from 'react';

// --- The server's clock ----------------------------------------------------------------------

let offsetMs = 0;

/** Note the server's time from a response, so the timer runs on its clock, not this device's. */
export function syncServerClock(serverNow: string) {
  const t = Date.parse(serverNow);
  if (Number.isFinite(t)) offsetMs = t - Date.now();
}

export const serverNow = () => Date.now() + offsetMs;

/** The server's time, re-rendering on every second while `active`. */
export function useServerNow(active: boolean): number {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const t = serverNow();
      setNow(t);
      // Wake just after the next whole second, so the display never skips one.
      timer = setTimeout(tick, 1000 - (t % 1000) + 15);
    };
    tick();
    return () => clearTimeout(timer);
  }, [active]);
  return active ? now : serverNow();
}

// --- Browser notifications -------------------------------------------------------------------

/** Ask once, from a click (browsers require it). */
export function askNotifications() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'default') return;
  void Notification.requestPermission().catch(() => undefined);
}

/** Show a notification when allowed and the page isn't in front (the toast covers that case). */
export function notify(title: string, body: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible' && document.hasFocus()) return;
  try {
    const n = new Notification(title, { body, icon: '/favicon.svg', tag: 'streakatron-focus' });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // Some browsers only allow notifications from a service worker; the chime still plays.
  }
}

// --- Per-browser memory ----------------------------------------------------------------------

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be off (private windows); these are conveniences only.
  }
  for (const l of listeners) l();
}

const listeners = new Set<() => void>();

/** Re-render when any of the values below changes (in this tab). */
export function useFocusMemory<T>(get: () => T): T {
  const [value, setValue] = useState(get);
  useEffect(() => {
    const update = () => setValue(get);
    listeners.add(update);
    window.addEventListener('storage', update);
    return () => {
      listeners.delete(update);
      window.removeEventListener('storage', update);
    };
    // `get` is a module function; reading it once is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return value;
}

const SEEN = 'streakatron.focus.seen';
const BREAK = 'streakatron.focus.break';
const CHIMED = 'streakatron.focus.chimed';

/** The finished session whose card was closed (it isn't shown again). */
export const seenSession = () => read<string>(SEEN);
export const markSeen = (id: string) => write(SEEN, id);

export interface Break {
  /** Server-clock milliseconds. */
  endsAt: number;
  minutes: number;
}
export const currentBreak = () => read<Break>(BREAK);
export const startBreak = (minutes: number) =>
  write(BREAK, { endsAt: serverNow() + minutes * 60_000, minutes } satisfies Break);
export const endBreak = () => write(BREAK, null);

/** Whether the planned-time chime already played for this session (in any tab, or before a reload). */
export const hasChimed = (id: string) => read<string>(CHIMED) === id;
export const markChimed = (id: string) => write(CHIMED, id);
