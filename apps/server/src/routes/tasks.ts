import {
  idOf,
  taskCreateSchema,
  taskListQuerySchema,
  taskMoveSchema,
  taskPatchSchema,
} from '@streakatron/shared/schemas';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireUser, type AuthedEnv } from '../http/session';
import { withGame } from '../services/game';
import { validate } from '../http/validate';
import {
  completeTask,
  createTask,
  deleteTask,
  getTask,
  listTasks,
  moveTask,
  reopenTask,
  restoreTask,
  updateTask,
} from '../services/tasks';

const param = validate('param', z.object({ id: idOf('task') }));

/** Task writes re-read the quests a task change can move (D30). */
const TASK = { touches: ['task'] } as const;

export const taskRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  .get('/', validate('query', taskListQuerySchema), async (c) =>
    c.json({ tasks: await listTasks(c.get('user').id, c.req.valid('query')) }),
  )
  .post('/', validate('json', taskCreateSchema), async (c) =>
    c.json(
      await withGame(
        c.get('user').id,
        () => createTask(c.get('user').id, c.req.valid('json')),
        TASK,
      ),
      201,
    ),
  )
  .get('/:id', param, async (c) => c.json(await getTask(c.get('user').id, c.req.valid('param').id)))
  .patch('/:id', param, validate('json', taskPatchSchema), async (c) =>
    c.json(
      await withGame(
        c.get('user').id,
        () => updateTask(c.get('user').id, c.req.valid('param').id, c.req.valid('json')),
        TASK,
      ),
    ),
  )
  .post('/:id/complete', param, async (c) =>
    c.json(
      await withGame(
        c.get('user').id,
        () => completeTask(c.get('user').id, c.req.valid('param').id),
        TASK,
      ),
    ),
  )
  .post('/:id/reopen', param, async (c) =>
    c.json(
      await withGame(
        c.get('user').id,
        () => reopenTask(c.get('user').id, c.req.valid('param').id),
        TASK,
      ),
    ),
  )
  .post('/:id/move', param, validate('json', taskMoveSchema), async (c) =>
    c.json(
      await withGame(
        c.get('user').id,
        () => moveTask(c.get('user').id, c.req.valid('param').id, c.req.valid('json')),
        TASK,
      ),
    ),
  )
  .delete('/:id', param, async (c) =>
    c.json(
      await withGame(
        c.get('user').id,
        () => deleteTask(c.get('user').id, c.req.valid('param').id),
        TASK,
      ),
    ),
  )
  .post('/:id/restore', param, async (c) =>
    c.json(
      await withGame(
        c.get('user').id,
        () => restoreTask(c.get('user').id, c.req.valid('param').id),
        TASK,
      ),
    ),
  );
