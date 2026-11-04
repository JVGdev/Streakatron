// Focus sessions: one open at a time, so the actions name no id. Every answer is the timer's whole
// state (`currentFocus`), plus the game block when a session completed (D28).

import { focusPatchSchema, focusStartSchema, idOf } from '@streakatron/shared/schemas';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireUser, type AuthedEnv } from '../http/session';
import { validate } from '../http/validate';
import {
  abandonFocus,
  currentFocus,
  finishFocus,
  pauseFocus,
  resumeFocus,
  startFocus,
  updateFocus,
} from '../services/focus';
import { withGame } from '../services/game';

/** A session finishing (or its note) can move focus quests (D30). */
const FOCUS = { touches: ['focus'] } as const;

export const focusRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  /** Reading can finish a session that reached its cap, so it carries the game block too. */
  .get('/current', async (c) =>
    c.json(await withGame(c.get('user').id, () => currentFocus(c.get('user').id), FOCUS)),
  )
  .post('/start', validate('json', focusStartSchema), async (c) =>
    c.json(
      await withGame(c.get('user').id, () => startFocus(c.get('user').id, c.req.valid('json'))),
      201,
    ),
  )
  .post('/pause', async (c) =>
    c.json(await withGame(c.get('user').id, () => pauseFocus(c.get('user').id))),
  )
  .post('/resume', async (c) =>
    c.json(await withGame(c.get('user').id, () => resumeFocus(c.get('user').id))),
  )
  .post('/finish', async (c) =>
    c.json(await withGame(c.get('user').id, () => finishFocus(c.get('user').id), FOCUS)),
  )
  .post('/abandon', async (c) =>
    c.json(await withGame(c.get('user').id, () => abandonFocus(c.get('user').id))),
  )
  .patch(
    '/:id',
    validate('param', z.object({ id: idOf('focusSession') })),
    validate('json', focusPatchSchema),
    async (c) =>
      c.json(
        await withGame(
          c.get('user').id,
          () => updateFocus(c.get('user').id, c.req.valid('param').id, c.req.valid('json')),
          FOCUS,
        ),
      ),
  );
