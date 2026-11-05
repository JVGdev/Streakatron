// The focus timer's client side (D29). The server owns the session; this keeps the clock in step
// with it and remembers small per-browser things: which finished session you've already seen, the
// break you're on (breaks aren't stored), which session already chimed, and whose time shows (D41).

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

/** Ask once, from a click (browsers require it). Resolves when answered (or not asked). */
export async function askNotifications() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'default') return;
  await Notification.requestPermission().catch(() => undefined);
}

/**
 * Show a notification when allowed and the page isn't in front (the toast covers that case).
 * Through the service worker when there is one (phones allow no other way); `tag` matches the
 * server's push for the same thing, so the two replace each other instead of stacking (D38).
 */
export function notify(title: string, body: string, tag = 'streakatron-focus') {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible' && document.hasFocus()) return;
  const options = { body, tag, icon: '/icons/icon-192.png', data: { url: location.pathname } };
  const fallback = () => {
    try {
      const n = new Notification(title, options);
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch {
      // Not allowed outside a service worker here; the chime still plays.
    }
  };
  if (!('serviceWorker' in navigator)) return fallback();
  void navigator.serviceWorker
    .getRegistration()
    .then((reg) => (reg ? reg.showNotification(title, options) : fallback()))
    .catch(fallback);
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

// --- Hidden time (D41) -------------------------------------------------------------------------

const SHOWN = 'streakatron.focus.shown';

/** The session whose time was shown with a click; every other session's time is hidden. */
export const shownSession = () => read<string>(SHOWN);
export const setTimeShown = (id: string, shown: boolean) => write(SHOWN, shown ? id : null);

/** Whether this session's time shows (D41): hidden until clicked, for each new session. */
export function useTimeShown(id: string | undefined): boolean {
  return useFocusMemory(shownSession) === id && !!id;
}
