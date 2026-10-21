import { PGlite } from '@electric-sql/pglite';
import { drizzle as pgliteDrizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { drizzle as postgresDrizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.js';

export type Database = PgliteDatabase<typeof schema>;
export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

export async function connectDatabase(options: { url?: string; path?: string } = {}) {
  const url = options.url;
  const migrationFolder = resolve(repositoryRoot, 'infra/migrations');
  const migrations = (await readdir(migrationFolder)).filter((f) => f.endsWith('.sql')).sort();
  if (url) {
    const pool = new pg.Pool({ connectionString: url, max: 10 });
    for (const migration of migrations) await pool.query(await readFile(resolve(migrationFolder, migration), 'utf8'));
    // Drizzle's query API is identical across both PostgreSQL drivers.
    return { db: postgresDrizzle(pool, { schema }) as unknown as Database, close: () => pool.end(), driver: 'postgres' };
  }
  const dataPath = options.path ?? resolve(repositoryRoot, '.data/postgres');
  if (dataPath !== 'memory://') await mkdir(dataPath, { recursive: true });
  const client = new PGlite(dataPath);
  await client.waitReady;
  for (const migration of migrations) await client.exec(await readFile(resolve(migrationFolder, migration), 'utf8'));
  return { db: pgliteDrizzle(client, { schema }), close: () => client.close(), driver: 'pglite' };
}
