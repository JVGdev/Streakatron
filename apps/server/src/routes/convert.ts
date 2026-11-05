import { convertSchema, convertUndoSchema } from '@streakatron/shared/schemas';
import { Hono } from 'hono';
import { requireUser, type AuthedEnv } from '../http/session';
import { validate } from '../http/validate';
import { convertEntry, undoConvert } from '../services/convert';
import { withGame } from '../services/game';

/** A conversion can move task and commitment quests (D30). */
const TOUCHES = { touches: ['task', 'commitment'] } as const;

export const convertRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  .post('/', validate('json', convertSchema), async (c) =>
    c.json(
      await withGame(
        c.get('user').id,
        () => convertEntry(c.get('user').id, c.req.valid('json')),
        TOUCHES,
      ),
    ),
  )
  .post('/undo', validate('json', convertUndoSchema), async (c) =>
    c.json(
      await withGame(
        c.get('user').id,
        () => undoConvert(c.get('user').id, c.req.valid('json')),
        TOUCHES,
      ),
    ),
  );
