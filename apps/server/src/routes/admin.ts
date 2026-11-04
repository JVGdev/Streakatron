import { Hono } from 'hono';
import { requireUser, type AuthedEnv } from '../http/session';
import { runBackup } from '../jobs/backup';
import { recompute } from '../services/game';

export const adminRoutes = new Hono<AuthedEnv>()
  .post('/admin/backup', requireUser, async (c) => {
    const result = await runBackup({ force: true });
    return c.json(result);
  })
  /** Replay the activity log with the current game rules (after a rule change or a bug fix). */
  .post('/admin/recompute', requireUser, async (c) => c.json(await recompute(c.get('user').id)));
