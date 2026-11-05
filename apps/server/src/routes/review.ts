import {
  idOf,
  keepParkedSchema,
  reviewFinishSchema,
  reviewSaveSchema,
} from '@streakatron/shared/schemas';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireUser, type AuthedEnv } from '../http/session';
import { validate } from '../http/validate';
import { withGame } from '../services/game';
import {
  finishReview,
  keepParked,
  reviewStatus,
  saveReview,
  startReview,
  weekReview,
} from '../services/review';

const param = validate('param', z.object({ id: idOf('weeklyReview') }));

export const reviewRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  .get('/', async (c) => c.json(await weekReview(c.get('user').id)))
  .get('/status', async (c) => c.json(await reviewStatus(c.get('user').id)))
  .post('/start', async (c) => c.json(await startReview(c.get('user').id)))
  .patch('/:id', param, validate('json', reviewSaveSchema), async (c) =>
    c.json(
      await saveReview(c.get('user').id, c.req.valid('param').id, c.req.valid('json').reflection),
    ),
  )
  .post('/:id/finish', param, validate('json', reviewFinishSchema), async (c) =>
    c.json(
      await withGame(
        c.get('user').id,
        () =>
          finishReview(c.get('user').id, c.req.valid('param').id, c.req.valid('json').reflection),
        { touches: ['review'] },
      ),
    ),
  )
  .post('/keep-parked', validate('json', keepParkedSchema), async (c) =>
    c.json(
      await withGame(
        c.get('user').id,
        () => keepParked(c.get('user').id, c.req.valid('json').projectId),
        { touches: ['project'] },
      ),
    ),
  );
