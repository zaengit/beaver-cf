import { getBeaverRuntime, type BeaverDatabase } from "@zbeaver/beaver/app/runtime"

export type { BeaverDatabase }

export function getDb(): BeaverDatabase {
  return getBeaverRuntime().db
}

// Repositories use a shared `db` identifier. This proxy resolves the actual
// D1 client from the current request context and never stores request state in
// a mutable module-global variable.
export const db = new Proxy({} as BeaverDatabase, {
  get(_target, property) {
    const value = Reflect.get(getDb() as object, property)
    return typeof value === "function" ? value.bind(getDb()) : value
  },
})

export async function closeDatabase() {
  // D1 owns connection lifecycle. Kept as a harmless cleanup hook for callers
  // that share lifecycle code with local tooling.
}

/**
 * Explicitly drops Beaver's D1 tables. This is not called by the Worker and
 * should only be exposed through an operator-controlled maintenance command.
 */
export async function resetDatabase() {
  const tables = [
    "admin_two_factor",
    "admin_refresh_sessions",
    "password_reset_tokens",
    "post_categories",
    "posts",
    "menus",
    "categories",
    "media",
    "settings",
    "contact_submissions",
    "activity_logs",
    "users",
    "__drizzle_migrations",
  ] as const
  const database = getBeaverRuntime().env.DB
  await database.batch(tables.map((table) => database.prepare(`DROP TABLE IF EXISTS "${table}"`)))
}
