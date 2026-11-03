// A fresh test database for every run, migrated like the real one.

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import type { TestProject } from 'vitest/node';
import { MIGRATIONS_DIR } from '../src/paths';

export default async function setup(project: TestProject) {
  const url = new URL(project.config.env.TEST_DATABASE_URL as string);
  const name = decodeURIComponent(url.pathname.slice(1));
  const admin = new URL(url);
  admin.pathname = '/postgres';

  const client = new pg.Client({ connectionString: admin.toString() });
  try {
    await client.connect();
  } catch (err) {
    throw new Error(
      `The server tests need Postgres at ${url.host} (run \`pnpm db:up\`): ${(err as Error).message}`,
      { cause: err },
    );
  }
  await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await client.query(`CREATE DATABASE "${name}"`);
  await client.end();

  const pool = new pg.Pool({ connectionString: url.toString() });
  await migrate(drizzle({ client: pool }), { migrationsFolder: MIGRATIONS_DIR });
  await pool.end();
}
