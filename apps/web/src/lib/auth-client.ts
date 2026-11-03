import { createAuthClient } from 'better-auth/react';

/** Better Auth's client; same origin, under /api/auth. */
export const authClient = createAuthClient({ basePath: '/api/auth' });
