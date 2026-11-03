import { Hono } from 'hono';
import { requireUser, type AuthedEnv } from '../http/session';
import { runBackup } from '../jobs/backup';

export const adminRoutes = new Hono<AuthedEnv>().post('/admin/backup', requireUser, async (c) => {
  const result = await runBackup({ force: true });
  return c.json(result);
});
