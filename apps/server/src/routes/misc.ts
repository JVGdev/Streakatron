// Search, mentions (resolve, backlinks), deleted-item snapshots and settings.

import {
  idOf,
  linkableId,
  resolveQuerySchema,
  searchQuerySchema,
  settingsPatchSchema,
} from '@streaktron/shared/schemas';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/client';
import { userSettings } from '../db/schema';
import { requireUser, type AuthedEnv } from '../http/session';
import { validate } from '../http/validate';
import { backlinks, resolveEntities } from '../services/entities';
import { search } from '../services/search';
import { listSnapshots, restoreSnapshot } from '../services/snapshots';

export const searchRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  .get('/', validate('query', searchQuerySchema), async (c) => {
    const { q, limit, types } = c.req.valid('query');
    return c.json({ results: await search(c.get('user').id, q, limit, types) });
  });

export const entityRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  /** Current titles and state for mention chips; unknown ids are left out (broken links). */
  .get('/resolve', validate('query', resolveQuerySchema), async (c) =>
    c.json({ entities: await resolveEntities(c.get('user').id, c.req.valid('query').ids) }),
  )
  /** What mentions this entity. */
  .get('/:id/backlinks', validate('param', z.object({ id: linkableId })), async (c) =>
    c.json({ backlinks: await backlinks(c.get('user').id, c.req.valid('param').id) }),
  );

export const snapshotRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  .get('/', async (c) => c.json({ snapshots: await listSnapshots(c.get('user').id) }))
  .post('/:id/restore', validate('param', z.object({ id: idOf('snapshot') })), async (c) =>
    c.json(await restoreSnapshot(c.get('user').id, c.req.valid('param').id)),
  );

export const settingsRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  .patch('/', validate('json', settingsPatchSchema), async (c) => {
    const values = c.req.valid('json');
    const userId = c.get('user').id;
    if (Object.keys(values).length) {
      await db.update(userSettings).set(values).where(eq(userSettings.userId, userId));
    }
    const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
    const { userId: _, createdAt: __, updatedAt: ___, ...settings } = row!;
    return c.json(settings);
  });
