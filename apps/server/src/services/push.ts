// Web Push (D38): devices subscribe through the Settings card; the reminder job (and "Send a test")
// send to every device of a user. The VAPID keys are made on first use and kept in the database.
// A push service answering 404 or 410 means the subscription is gone: its row is removed.

import { newId } from '@streakatron/shared/ids';
import type { PushSubscribeInput } from '@streakatron/shared/schemas';
import { and, desc, eq, inArray } from 'drizzle-orm';
import webpush from 'web-push';
import { db } from '../db/client';
import { pushSubscriptions, serverKeys } from '../db/schema';
import { env } from '../env';
import { notFound } from './common';

/** What the service worker gets (`apps/web/public/sw.js` reads it). */
export interface PushMessage {
  title: string;
  body: string;
  /** Same tag, same notification: a repeat replaces the one before it. */
  tag: string;
  /** Opened on a click. */
  url: string;
  /** What the notification's buttons act on. */
  target?: { kind: 'task' | 'commitment'; id: string };
  actions?: { action: 'done' | 'plus1' | 'snooze'; title: string }[];
}

interface Vapid {
  publicKey: string;
  privateKey: string;
}

let cached: Vapid | null = null;

async function vapid(): Promise<Vapid> {
  if (cached) return cached;
  const read = async () =>
    (await db.select().from(serverKeys).where(eq(serverKeys.name, 'vapid')))[0]?.value as
      Vapid | undefined;
  let keys = await read();
  if (!keys) {
    const made = webpush.generateVAPIDKeys();
    await db
      .insert(serverKeys)
      .values({ name: 'vapid', value: made })
      .onConflictDoNothing({ target: serverKeys.name });
    keys = (await read())!;
  }
  cached = { publicKey: keys.publicKey, privateKey: keys.privateKey };
  return cached;
}

/** Who sends: the app's HTTPS address (Apple's push service wants a real one), else a mailto. */
const subject = () =>
  env.APP_ORIGINS.find((o) => o.startsWith('https://')) ?? 'mailto:streakatron@localhost';

export const vapidPublicKey = async () => (await vapid()).publicKey;

// --- Subscriptions ---------------------------------------------------------------------------

const view = {
  id: pushSubscriptions.id,
  endpoint: pushSubscriptions.endpoint,
  label: pushSubscriptions.label,
  createdAt: pushSubscriptions.createdAt,
  lastSentAt: pushSubscriptions.lastSentAt,
};

export async function listSubscriptions(userId: string) {
  return db
    .select(view)
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .orderBy(desc(pushSubscriptions.createdAt));
}
export type PushDevice = Awaited<ReturnType<typeof listSubscriptions>>[number];

/** "Chrome on Android", from the browser's User-Agent; enough to tell devices apart. */
export function deviceLabel(ua: string | undefined): string {
  if (!ua) return 'A browser';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\/|CriOS\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'A browser';
  const os = /Android/.test(ua)
    ? 'Android'
    : /iPhone/.test(ua)
      ? 'iPhone'
      : /iPad/.test(ua)
        ? 'iPad'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(ua)
            ? 'Mac'
            : /CrOS/.test(ua)
              ? 'ChromeOS'
              : /Linux/.test(ua)
                ? 'Linux'
                : null;
  return os ? `${browser} on ${os}` : browser;
}

/** Add this browser, or refresh it (a browser keeps its endpoint until it unsubscribes). */
export async function subscribe(userId: string, input: PushSubscribeInput, label: string) {
  const values = {
    userId,
    endpoint: input.endpoint,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    label,
  };
  const [row] = await db
    .insert(pushSubscriptions)
    .values({ id: newId('pushSubscription'), ...values })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: values })
    .returning(view);
  return row!;
}

export async function unsubscribe(userId: string, id: string) {
  const gone = await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.id, id), eq(pushSubscriptions.userId, userId)))
    .returning({ id: pushSubscriptions.id });
  if (!gone.length) throw notFound('device');
}

// --- Sending ---------------------------------------------------------------------------------

type Subscription = typeof pushSubscriptions.$inferSelect;
export type PushTransport = (
  sub: Subscription,
  message: PushMessage,
  ttlSeconds: number,
) => Promise<'sent' | 'gone'>;

const webPushTransport: PushTransport = async (sub, message, ttlSeconds) => {
  const keys = await vapid();
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(message),
      {
        vapidDetails: { subject: subject(), ...keys },
        TTL: ttlSeconds,
        urgency: 'high',
      },
    );
    return 'sent';
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return 'gone';
    throw err;
  }
};

let transport: PushTransport = webPushTransport;

/** Tests swap in a fake; returns the one it replaced. */
export function setPushTransport(next: PushTransport): PushTransport {
  const before = transport;
  transport = next;
  return before;
}

/**
 * Send to every device of the user. A reminder that waits in a push service longer than `ttl`
 * (the device was off) is dropped there instead of arriving late. Returns how many got it.
 */
export async function sendToUser(userId: string, message: PushMessage, ttlSeconds = 3600) {
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  const sent: string[] = [];
  const gone: string[] = [];
  await Promise.all(
    subs.map(async (sub) => {
      try {
        if ((await transport(sub, message, ttlSeconds)) === 'gone') gone.push(sub.id);
        else sent.push(sub.id);
      } catch (err) {
        console.error(`push: sending to ${sub.label} (${sub.id}) failed`, err);
      }
    }),
  );
  if (gone.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
  if (sent.length) {
    await db
      .update(pushSubscriptions)
      .set({ lastSentAt: new Date() })
      .where(inArray(pushSubscriptions.id, sent));
  }
  return { sent: sent.length, devices: subs.length };
}

/** "Send a test" from Settings. */
export async function sendTest(userId: string) {
  const result = await sendToUser(
    userId,
    {
      title: 'Streakatron',
      body: 'Notifications work on this device.',
      tag: 'test',
      url: '/settings',
    },
    120,
  );
  return result;
}
