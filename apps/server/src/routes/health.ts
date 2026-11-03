import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db/client';

export const healthRoutes = new Hono().get('/health', async (c) => {
  try {
    await db.execute(sql`select 1`);
    return c.json({ ok: true, db: 'up' as const });
  } catch (err) {
    console.error('[health] database unreachable', err);
    return c.json({ ok: false, db: 'down' as const }, 503);
  }
});
