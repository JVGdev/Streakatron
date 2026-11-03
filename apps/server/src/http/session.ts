import { createMiddleware } from 'hono/factory';
import { auth, type AuthSession, type AuthUser } from '../auth';
import { HttpError } from './errors';

export type AuthedEnv = { Variables: { user: AuthUser; session: AuthSession['session'] } };

/** Routes behind sign-in: the user is on the context, or the request is answered 401. */
export const requireUser = createMiddleware<AuthedEnv>(async (c, next) => {
  const result = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!result) throw new HttpError(401, 'unauthorized', 'Sign in to continue.');
  c.set('user', result.user);
  c.set('session', result.session);
  await next();
});
