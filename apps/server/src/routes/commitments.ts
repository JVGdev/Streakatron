// Commitments (D31): CRUD with archive and undoable delete, and entries (a tick, +N, minutes).
// Writes carry the game block; entries can meet a commitment (XP, active day) and move quests.

import {
  commitmentCreateSchema,
  commitmentListQuerySchema,
  commitmentPatchSchema,
  entryCreateSchema,
  idOf,
} from '@streakatron/shared/schemas';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireUser, type AuthedEnv } from '../http/session';
import { validate } from '../http/validate';
import {
  addEntry,
  createCommitment,
  deleteCommitment,
  deleteEntry,
  getCommitment,
  listCommitments,
  restoreCommitment,
  updateCommitment,
} from '../services/commitments';
import { withGame } from '../services/game';

const param = validate('param', z.object({ id: idOf('commitment') }));
const entryParam = validate(
  'param',
  z.object({ id: idOf('commitment'), entryId: idOf('commitmentEntry') }),
);

/** Commitment changes move the quests about them (D30). */
const COMMITMENT = { touches: ['commitment'] } as const;

export const commitmentRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  .get('/', validate('query', commitmentListQuerySchema), async (c) =>
    c.json({
      commitments: await listCommitments(c.get('user').id, {
        archived: c.req.valid('query').archived === 'true',
      }),
    }),
  )
  .post('/', validate('json', commitmentCreateSchema), async (c) =>
    c.json(
      await withGame(
        c.get('user').id,
        () => createCommitment(c.get('user').id, c.req.valid('json')),
        COMMITMENT,
      ),
      201,
    ),
  )
  .get('/:id', param, async (c) =>
    c.json(await getCommitment(c.get('user').id, c.req.valid('param').id)),
  )
  .patch('/:id', param, validate('json', commitmentPatchSchema), async (c) =>
    c.json(
      await withGame(
        c.get('user').id,
        () => updateCommitment(c.get('user').id, c.req.valid('param').id, c.req.valid('json')),
        COMMITMENT,
      ),
    ),
  )
  .delete('/:id', param, async (c) =>
    c.json(
      await withGame(
        c.get('user').id,
        () => deleteCommitment(c.get('user').id, c.req.valid('param').id),
        COMMITMENT,
      ),
    ),
  )
  .post('/:id/restore', param, async (c) =>
    c.json(
      await withGame(
        c.get('user').id,
        () => restoreCommitment(c.get('user').id, c.req.valid('param').id),
        COMMITMENT,
      ),
    ),
  )
  .post('/:id/entries', param, validate('json', entryCreateSchema), async (c) =>
    c.json(
      await withGame(
        c.get('user').id,
        () => addEntry(c.get('user').id, c.req.valid('param').id, c.req.valid('json')),
        COMMITMENT,
      ),
      201,
    ),
  )
  .delete('/:id/entries/:entryId', entryParam, async (c) =>
    c.json(
      await withGame(
        c.get('user').id,
        () => deleteEntry(c.get('user').id, c.req.valid('param').id, c.req.valid('param').entryId),
        COMMITMENT,
      ),
    ),
  );
