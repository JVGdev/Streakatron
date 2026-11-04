import { spotlightSchema } from '@streakatron/shared/schemas';
import { Hono } from 'hono';
import { requireUser, type AuthedEnv } from '../http/session';
import { validate } from '../http/validate';
import { getSpotlight, setSpotlight } from '../services/spotlight';

export const spotlightRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  .get('/', async (c) => c.json(await getSpotlight(c.get('user').id)))
  .post('/', validate('json', spotlightSchema), async (c) =>
    c.json(await setSpotlight(c.get('user').id, c.req.valid('json'))),
  );
