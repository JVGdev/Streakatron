import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { MIGRATIONS_DIR } from '../paths';
import { db } from './client';

/** Apply pending migrations (run on every start, so the database is always current). */
export async function runMigrations(): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}
