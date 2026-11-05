import {
  idOf,
  noteAppendSchema,
  noteCreateSchema,
  notePatchSchema,
} from '@streakatron/shared/schemas';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireUser, type AuthedEnv } from '../http/session';
import { validate } from '../http/validate';
import { withGame } from '../services/game';
import {
  appendNoteToTask,
  createNote,
  dismissNote,
  getNote,
  listNotes,
  restoreNote,
  undoAppendNote,
  updateNote,
} from '../services/notes';

const param = validate('param', z.object({ id: idOf('note') }));

/** Sorting a note can move the notes quest (D46); adding it to a task, the task's quests. */
const SORTS = { touches: ['note'] } as const;
const APPENDS = { touches: ['note', 'task'] } as const;

export const noteRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  .get('/', async (c) => c.json({ notes: await listNotes(c.get('user').id) }))
  .post('/', validate('json', noteCreateSchema), async (c) =>
    c.json(await createNote(c.get('user').id, c.req.valid('json')), 201),
  )
  .get('/:id', param, async (c) => c.json(await getNote(c.get('user').id, c.req.valid('param').id)))
  .patch('/:id', param, validate('json', notePatchSchema), async (c) =>
    c.json(await updateNote(c.get('user').id, c.req.valid('param').id, c.req.valid('json'))),
  )
  .delete('/:id', param, async (c) =>
    c.json(
      await withGame(
        c.get('user').id,
        () => dismissNote(c.get('user').id, c.req.valid('param').id),
        SORTS,
      ),
    ),
  )
  .post('/:id/restore', param, async (c) =>
    c.json(await restoreNote(c.get('user').id, c.req.valid('param').id)),
  )
  .post('/:id/append', param, validate('json', noteAppendSchema), async (c) =>
    c.json(
      await withGame(
        c.get('user').id,
        () =>
          appendNoteToTask(c.get('user').id, c.req.valid('param').id, c.req.valid('json').taskId),
        APPENDS,
      ),
    ),
  )
  .post('/:id/unappend', param, validate('json', noteAppendSchema), async (c) =>
    c.json(
      await undoAppendNote(c.get('user').id, c.req.valid('param').id, c.req.valid('json').taskId),
    ),
  );
