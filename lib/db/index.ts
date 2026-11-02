import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import * as schema from './schema'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required')
}

const globalForDatabase = globalThis as unknown as { pool?: Pool }

export const pool = globalForDatabase.pool ?? new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 20_000,
  connectionTimeoutMillis: 10_000,
})

if (process.env.NODE_ENV !== 'production') globalForDatabase.pool = pool

export const db = drizzle(pool, { schema })
