// Quests (D30): the board (made on the day's first look, evaluated fully) and rerolls. Both answer
// the board, plus the game block for anything they completed.

import { idOf } from '@streakatron/shared/schemas';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireUser, type AuthedEnv } from '../http/session';
import { validate } from '../http/validate';
import { withGame } from '../services/game';
import { questBoard, rerollQuest } from '../services/quests';

export const questRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  .get('/', async (c) =>
    c.json(await withGame(c.get('user').id, () => questBoard(c.get('user').id))),
  )
  .post('/:id/reroll', validate('param', z.object({ id: idOf('quest') })), async (c) =>
    c.json(
      await withGame(c.get('user').id, () =>
        rerollQuest(c.get('user').id, c.req.valid('param').id),
      ),
    ),
  );
