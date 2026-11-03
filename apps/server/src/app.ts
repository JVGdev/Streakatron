// The HTTP app. `AppType` is what the web client's typed RPC client (`hc`) is built from.

import { existsSync } from 'node:fs';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { auth } from './auth';
import { env } from './env';
import { DEFAULT_STATIC_DIR } from './paths';
import { errorBody, onError } from './http/errors';
import { adminRoutes } from './routes/admin';
import { healthRoutes } from './routes/health';
import { meRoutes } from './routes/me';
import { setupRoutes } from './routes/setup';

const api = new Hono()
  // Accounts are made through /api/setup only, while sign-up is closed (D1).
  .post('/auth/sign-up/*', (c) => c.json(errorBody('signup_closed', 'Sign-up is closed.'), 403))
  .on(['GET', 'POST'], '/auth/*', (c) => auth.handler(c.req.raw))
  .route('/', healthRoutes)
  .route('/', setupRoutes)
  .route('/', meRoutes)
  .route('/', adminRoutes);

export const app = new Hono();

if (env.NODE_ENV === 'development') app.use('/api/*', logger());
app.onError(onError);
app.route('/api', api);
app.all('/api/*', (c) => c.json(errorBody('not_found', `No such endpoint: ${c.req.path}`), 404));

// In production the server also serves the built web app, with the SPA's routes falling back to
// index.html.
const staticDir =
  env.STATIC_DIR ?? (env.NODE_ENV === 'production' ? DEFAULT_STATIC_DIR : undefined);
if (staticDir && existsSync(staticDir)) {
  app.use('*', serveStatic({ root: staticDir }));
  app.get('*', serveStatic({ root: staticDir, path: 'index.html' }));
}

export type AppType = typeof api;
