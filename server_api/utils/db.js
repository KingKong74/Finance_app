// server_api/utils/db.js
// Replaces the MongoDB connectToDB() helper.
// Uses postgres.js as the low-level driver and Drizzle ORM for queries.
//
// Connection is cached on the global object so Vercel serverless functions
// reuse it across warm invocations (same pattern as the old Mongo client).

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../schema/index.js";

let cached = global._pgCached;

if (!cached) {
  cached = global._pgCached = { sql: null, db: null };
}

export function getDb() {
  if (cached.db) return cached.db;

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Missing DATABASE_URL env var");

  // max: 1 connection per serverless function instance is enough;
  // connection pooling (e.g. PgBouncer / Supabase pooler) sits in front.
  cached.sql = postgres(url, { max: 1, ssl: "require" });
  cached.db  = drizzle(cached.sql, { schema });

  return cached.db;
}

// Convenience re-export so callers can do:
//   import { db } from "../utils/db.js";
// identical to the old pattern.
export const db = new Proxy({}, {
  get(_t, prop) {
    return getDb()[prop];
  },
});