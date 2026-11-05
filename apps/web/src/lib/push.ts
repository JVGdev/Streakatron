// The installable app and Web Push on this browser (D38): the service worker (`public/sw.js`),
// turning notifications on or off for this device, and what the worker tells open windows
// (a push while the app is in front, a notification button that changed something, "go there").

import type { QueryClient } from '@tanstack/react-query';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, call } from './api';
import { report } from './report';
import { setUi } from './ui-store';

/** Register the worker (installability, push). Nothing breaks without it. */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  void navigator.serviceWorker.register('/sw.js').catch((err) => {
    console.warn('service worker: not registered', err);
  });
}

export type PushSupport =
  /** Push works here. */
  | 'ok'
  /** iPhone and iPad: only from the app added to the Home Screen. */
  | 'install'
  /** Plain HTTP (not localhost), or an old browser. */
  | 'unsupported';

const isIos = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1);

const standalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as { standalone?: boolean }).standalone === true;

export function pushSupport(): PushSupport {
  const capable =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (isIos() && !standalone()) return 'install';
  return capable && window.isSecureContext ? 'ok' : 'unsupported';
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration()) ?? navigator.serviceWorker.ready;
}

/** This browser's subscription, if it has one. */
export async function currentEndpoint(): Promise<string | null> {
  if (pushSupport() !== 'ok') return null;
  const sub = await (await registration()).pushManager.getSubscription();
  return sub?.endpoint ?? null;
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// "Turned off on this device" in Settings: kept so turning things on by itself respects it.
const OFF_KEY = 'streakatron:push-off';
const turnedOff = () => {
  try {
    return localStorage.getItem(OFF_KEY) === '1';
  } catch {
    return false;
  }
};
const setTurnedOff = (off: boolean) => {
  try {
    if (off) localStorage.setItem(OFF_KEY, '1');
    else localStorage.removeItem(OFF_KEY);
  } catch {
    // Private mode: nothing to remember.
  }
};

/**
 * Turn notifications on for this device: ask the browser when it hasn't been asked (`ask`, from a
 * click), subscribe with the server's key and send the subscription. Resolves to why not, or null
 * when it worked. Without `ask`, a browser that wasn't asked yet is left alone ('not asked').
 */
export async function enablePush({ ask = true } = {}): Promise<string | null> {
  if (pushSupport() !== 'ok') return 'This browser can’t get notifications from here.';
  const permission =
    Notification.permission === 'default' && ask
      ? await Notification.requestPermission()
      : Notification.permission;
  if (permission === 'default') return 'not asked';
  if (permission !== 'granted') {
    return 'Notifications are blocked for this site. Allow them in the browser’s site settings.';
  }
  const { publicKey } = await call(api.push.key.$get());
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  // A subscription made with another key (the server's keys were reset) can't be used.
  if (sub && sub.options.applicationServerKey) {
    const old = new Uint8Array(sub.options.applicationServerKey);
    const now = keyBytes(publicKey);
    if (old.length !== now.length || old.some((b, i) => b !== now[i])) {
      await sub.unsubscribe();
      sub = null;
    }
  }
  try {
    sub ??= await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(publicKey),
    });
  } catch (err) {
    // Incognito windows, a browser without a push service, or one the system blocks.
    console.warn('push: subscribe failed', err);
    return 'This browser wouldn’t turn notifications on. Try a normal (not private) window, and check that notifications are allowed for this site.';
  }
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await call(api.push.devices.$post({ json: { endpoint: json.endpoint, keys: json.keys } }));
  setTurnedOff(false);
  return null;
}

/** Stop notifications on this device (the browser's subscription and the server's row). */
export async function disablePush(deviceId: string | undefined) {
  setTurnedOff(true);
  const sub = await (await registration()).pushManager.getSubscription();
  await sub?.unsubscribe();
  if (deviceId) await call(api.push.devices[':id'].$delete({ param: { id: deviceId } }));
}

/**
 * On opening the app: a browser that already allows notifications (asked by the focus timer, or
 * a device turned on before) is subscribed without asking, unless it was turned off here. Also
 * re-sends the subscription, in case the server dropped it.
 */
export async function syncPush(qc: QueryClient) {
  if (pushSupport() !== 'ok' || Notification.permission !== 'granted' || turnedOff()) return;
  try {
    if (!(await enablePush({ ask: false }))) void qc.invalidateQueries({ queryKey: ['push'] });
  } catch (err) {
    console.warn('push: sync failed', err);
  }
}

export type PushState =
  /** This device gets them. */
  | 'on'
  /** Can be turned on with one click. */
  | 'off'
  /** Turned off here in Settings (left alone until turned on again). */
  | 'turned-off'
  /** The browser blocks them for this site. */
  | 'blocked'
  /** iPhone / iPad outside the Home Screen app. */
  | 'install'
  | 'unsupported'
  | 'loading';

type DevicesData = { devices: PushDevice[]; endpoint: string | null };

function stateOf(data: DevicesData | undefined): PushState {
  const support = pushSupport();
  if (support !== 'ok') return support;
  if (!data) return 'loading';
  if (data.endpoint && data.devices.some((d) => d.endpoint === data.endpoint)) return 'on';
  if (Notification.permission === 'denied') return 'blocked';
  return turnedOff() ? 'turned-off' : 'off';
}

/** Where this device stands, and a one-click "turn on" that says how it went. */
export function usePush() {
  const qc = useQueryClient();
  const { data } = usePushDevices();
  const state = stateOf(data);
  const turnOn = async () => {
    try {
      const problem = await enablePush();
      if (problem) toast.error(problem);
      else toast.success('Notifications are on for this device');
      return !problem;
    } catch (err) {
      report(err);
      return false;
    } finally {
      void qc.invalidateQueries({ queryKey: ['push'] });
    }
  };
  return { state, turnOn, devices: data?.devices ?? [], endpoint: data?.endpoint ?? null };
}

/** Why this device won't show a reminder just set (the dialog after setting one). */
export type PushProblem = Exclude<PushState, 'on' | 'loading' | 'off'> | 'dismissed' | 'failed';

/**
 * After a reminder is set (D38): make sure this device will show it. Asks the browser first, while
 * the click still counts; turns notifications on when it can; otherwise opens the dialog that says
 * why not and what to do, with the devices that will still get it (once per visit and reason).
 */
export async function checkAfterReminder(qc: QueryClient, { force = false } = {}) {
  if (pushSupport() === 'ok' && Notification.permission === 'default' && !turnedOff()) {
    await Notification.requestPermission().catch(() => 'default');
  }
  try {
    const data = await qc.fetchQuery({ ...pushDevicesQuery, staleTime: 0 });
    const state = stateOf(data);
    const others = data.devices.filter((d) => d.endpoint !== data.endpoint).map((d) => d.label);
    if (state === 'on' || state === 'loading') return;
    if (state === 'off') {
      const problem = await enablePush({ ask: false });
      void qc.invalidateQueries({ queryKey: ['push'] });
      if (!problem) {
        toast.success('Notifications are on for this device');
        return;
      }
      return openPushPrompt(
        problem === 'not asked' ? 'dismissed' : 'failed',
        others,
        problem,
        force,
      );
    }
    openPushPrompt(state, others, undefined, force);
  } catch (err) {
    report(err);
  }
}

function openPushPrompt(problem: PushProblem, others: string[], message?: string, force = false) {
  const key = `streakatron:push-prompt:${problem}`;
  try {
    if (sessionStorage.getItem(key) && !force) return;
    sessionStorage.setItem(key, '1');
  } catch {
    // Private mode: it may show again this visit.
  }
  setUi({ pushPrompt: { problem, others, message } });
}

const fetchDevices = () => call(api.push.devices.$get());
export type PushDevice = Awaited<ReturnType<typeof fetchDevices>>['devices'][number];

export const pushDevicesQuery = {
  queryKey: ['push', 'devices'] as const,
  queryFn: async () => {
    const [{ devices }, endpoint] = await Promise.all([fetchDevices(), currentEndpoint()]);
    return { devices, endpoint };
  },
};

export const usePushDevices = () => useQuery(pushDevicesQuery);

// --- Messages from the worker ----------------------------------------------------------------

interface PushMessage {
  title: string;
  body: string;
  url: string;
  target?: { kind: 'task' | 'commitment'; id: string };
  actions?: { action: 'done' | 'plus1' | 'snooze'; title: string }[];
}

type WorkerMessage =
  { type: 'push'; message: PushMessage } | { type: 'changed' } | { type: 'navigate'; url: string };

/**
 * Listen to the worker: a push while the app is in front becomes a toast (its first button
 * included), a notification button refreshes what's on screen, a click opens the page it names.
 */
export function listenToServiceWorker(
  qc: QueryClient,
  go: (url: string) => void,
  act: (action: string, target: NonNullable<PushMessage['target']>) => Promise<unknown>,
) {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
    const data = event.data;
    if (data?.type === 'changed') void qc.invalidateQueries();
    if (data?.type === 'navigate') go(data.url);
    if (data?.type === 'push') {
      const { message } = data;
      const first = message.actions?.find((a) => a.action !== 'snooze');
      toast(message.title, {
        description: message.body,
        duration: 15_000,
        action:
          first && message.target
            ? { label: first.title, onClick: () => void act(first.action, message.target!) }
            : { label: 'Open', onClick: () => go(message.url) },
      });
    }
  });
}
