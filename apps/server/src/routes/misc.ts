// Search, mentions (resolve, backlinks), deleted-item snapshots, settings and the game.

import {
  heatmapQuerySchema,
  idOf,
  linkableId,
  resolveQuerySchema,
  searchQuerySchema,
  settingsPatchSchema,
} from '@streakatron/shared/schemas';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireUser, type AuthedEnv } from '../http/session';
import { validate } from '../http/validate';
import { backlinks, resolveEntities } from '../services/entities';
import { getGameState } from '../services/game';
import { search } from '../services/search';
import { heatmap } from '../services/stats';
import { listSnapshots, restoreSnapshot } from '../services/snapshots';
import { updateSettings } from '../services/users';

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
  .patch('/', validate('json', settingsPatchSchema), async (c) =>
    c.json(await updateSettings(c.get('user').id, c.req.valid('json'))),
  );

export const gameRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  /** XP, level, streaks, freezes and this week, as the server counts them (D17). */
  .get('/state', async (c) => c.json(await getGameState(c.get('user').id)));

export const statsRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  /** Per day: active, XP, tasks completed, focus minutes (a year to today by default). */
  .get('/heatmap', validate('query', heatmapQuerySchema), async (c) =>
    c.json(await heatmap(c.get('user').id, c.req.valid('query'))),
  );
