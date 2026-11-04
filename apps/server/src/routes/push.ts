// Web Push devices (D38) and "Snooze 1 h" from a notification.

import { idOf, pushSubscribeSchema, snoozeSchema } from '@streakatron/shared/schemas';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireUser, type AuthedEnv } from '../http/session';
import { validate } from '../http/validate';
import {
  deviceLabel,
  listSubscriptions,
  sendTest,
  subscribe,
  unsubscribe,
  vapidPublicKey,
} from '../services/push';
import { snooze } from '../services/reminders';

export const pushRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  .get('/key', async (c) => c.json({ publicKey: await vapidPublicKey() }))
  .get('/devices', async (c) => c.json({ devices: await listSubscriptions(c.get('user').id) }))
  .post('/devices', validate('json', pushSubscribeSchema), async (c) =>
    c.json(
      await subscribe(
        c.get('user').id,
        c.req.valid('json'),
        deviceLabel(c.req.header('user-agent')),
      ),
      201,
    ),
  )
  .delete(
    '/devices/:id',
    validate('param', z.object({ id: idOf('pushSubscription') })),
    async (c) => {
      await unsubscribe(c.get('user').id, c.req.valid('param').id);
      return c.json({ ok: true });
    },
  )
  .post('/test', async (c) => c.json(await sendTest(c.get('user').id)));

export const reminderRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  .post('/snooze', validate('json', snoozeSchema), async (c) =>
    c.json(await snooze(c.get('user').id, c.req.valid('json').id)),
  );
