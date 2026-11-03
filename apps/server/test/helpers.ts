import { sql } from 'drizzle-orm';
import { app } from '../src/app';
import { db } from '../src/db/client';

export const ORIGIN = 'http://localhost:3001';

/** Every table emptied (keeps the schema). */
export async function resetDb() {
  await db.execute(sql`truncate table users, verifications restart identity cascade`);
}

/** A request to the app, as the browser would send it (JSON, same-origin). */
export function request(
  path: string,
  init: { method?: string; body?: unknown; cookie?: string } = {},
) {
  const headers = new Headers({ origin: ORIGIN });
  if (init.body !== undefined) headers.set('content-type', 'application/json');
  if (init.cookie) headers.set('cookie', init.cookie);
  return app.request(path, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

/** The cookies a response sets, as a `Cookie` header for the next request. */
export function cookiesFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

export const owner = {
  name: 'Ada',
  email: 'ada@example.com',
  password: 'correct horse battery',
  timezone: 'America/Sao_Paulo',
};

/** Set the app up with the owner account; returns its session cookie. */
export async function setUpOwner(): Promise<string> {
  const res = await request('/api/setup', { body: owner });
  if (res.status !== 200) throw new Error(`setup failed: ${res.status} ${await res.text()}`);
  return cookiesFrom(res);
}
