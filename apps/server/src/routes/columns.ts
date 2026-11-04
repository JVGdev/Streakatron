import { columnDeleteQuerySchema, columnPatchSchema, idOf } from '@streakatron/shared/schemas';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireUser, type AuthedEnv } from '../http/session';
import { validate } from '../http/validate';
import { withGame } from '../services/game';
import { deleteColumn, updateColumn } from '../services/board';

const param = validate('param', z.object({ id: idOf('boardColumn') }));

export const columnRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  .patch('/:id', param, validate('json', columnPatchSchema), async (c) =>
    c.json(
      await withGame(
        c.get('user').id,
        () => updateColumn(c.get('user').id, c.req.valid('param').id, c.req.valid('json')),
        { touches: ['task'] },
      ),
    ),
  )
  .delete('/:id', param, validate('query', columnDeleteQuerySchema), async (c) =>
    c.json(
      await withGame(
        c.get('user').id,
        () => deleteColumn(c.get('user').id, c.req.valid('param').id, c.req.valid('query').moveTo),
        { touches: ['task'] },
      ),
    ),
  );
