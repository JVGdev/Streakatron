import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../env';
import * as schema from './schema';

export const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 });

pool.on('error', (err) => console.error('[db] idle client error', err));

export const db = drizzle({ client: pool, schema, casing: 'snake_case' });

export type Db = typeof db;
