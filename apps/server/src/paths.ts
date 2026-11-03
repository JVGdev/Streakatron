// Paths relative to this package. This file sits one level below `apps/server`, like the bundled
// `dist/index.js`, so the same relative URLs work from source (tsx) and from the build.

import { fileURLToPath } from 'node:url';

const at = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

/** SQL migrations made by drizzle-kit. */
export const MIGRATIONS_DIR = at('../drizzle');
/** The repository's `data/` folder (backups, snapshots); gitignored. */
export const DEFAULT_DATA_DIR = at('../../../data');
/** The built web app, served by this server in production. */
export const DEFAULT_STATIC_DIR = at('../../web/dist');
