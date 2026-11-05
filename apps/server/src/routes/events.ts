import {
  calendarQuerySchema,
  eventCreateSchema,
  eventListQuerySchema,
  eventPatchSchema,
  idOf,
} from '@streakatron/shared/schemas';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireUser, type AuthedEnv } from '../http/session';
import { validate } from '../http/validate';
import {
  createEvent,
  deleteEvent,
  getCalendar,
  getEvent,
  listProjectEvents,
  restoreEvent,
  updateEvent,
} from '../services/events';

const param = validate('param', z.object({ id: idOf('event') }));

export const eventRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  .get('/', validate('query', eventListQuerySchema), async (c) =>
    c.json({
      events: await listProjectEvents(c.get('user').id, c.req.valid('query').project),
    }),
  )
  .post('/', validate('json', eventCreateSchema), async (c) =>
    c.json(await createEvent(c.get('user').id, c.req.valid('json')), 201),
  )
  .get('/:id', param, async (c) =>
    c.json(await getEvent(c.get('user').id, c.req.valid('param').id)),
  )
  .patch('/:id', param, validate('json', eventPatchSchema), async (c) =>
    c.json(await updateEvent(c.get('user').id, c.req.valid('param').id, c.req.valid('json'))),
  )
  .delete('/:id', param, async (c) =>
    c.json(await deleteEvent(c.get('user').id, c.req.valid('param').id)),
  )
  .post('/:id/restore', param, async (c) =>
    c.json(await restoreEvent(c.get('user').id, c.req.valid('param').id)),
  );

export const calendarRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  .get('/', validate('query', calendarQuerySchema), async (c) =>
    c.json(await getCalendar(c.get('user').id, c.req.valid('query'))),
  );
