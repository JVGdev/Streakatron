import { goalCreateSchema, goalPatchSchema, idOf } from '@streakatron/shared/schemas';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireUser, type AuthedEnv } from '../http/session';
import { validate } from '../http/validate';
import { withGame } from '../services/game';
import { createGoal, deleteGoal, getGoal, restoreGoal, updateGoal } from '../services/goals';

const param = validate('param', z.object({ id: idOf('goal') }));

const GOAL = { touches: ['goal'] } as const;

export const goalRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  .post('/', validate('json', goalCreateSchema), async (c) =>
    c.json(
      await withGame(
        c.get('user').id,
        () => createGoal(c.get('user').id, c.req.valid('json')),
        GOAL,
      ),
      201,
    ),
  )
  .get('/:id', param, async (c) => c.json(await getGoal(c.get('user').id, c.req.valid('param').id)))
  .patch('/:id', param, validate('json', goalPatchSchema), async (c) =>
    c.json(
      await withGame(
        c.get('user').id,
        () => updateGoal(c.get('user').id, c.req.valid('param').id, c.req.valid('json')),
        GOAL,
      ),
    ),
  )
  .delete('/:id', param, async (c) =>
    c.json(
      await withGame(
        c.get('user').id,
        () => deleteGoal(c.get('user').id, c.req.valid('param').id),
        GOAL,
      ),
    ),
  )
  .post('/:id/restore', param, async (c) =>
    c.json(
      await withGame(
        c.get('user').id,
        () => restoreGoal(c.get('user').id, c.req.valid('param').id),
        GOAL,
      ),
    ),
  );
