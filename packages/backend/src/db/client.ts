import { drizzle } from "drizzle-orm/bun-sqlite";
import { getSqlite } from "./sqlite-client";

export { getSqlite } from "./sqlite-client";

let drizzleInstance: ReturnType<typeof drizzle> | null = null;

export function getDb(): ReturnType<typeof drizzle> {
  if (drizzleInstance !== null) return drizzleInstance;
  drizzleInstance = drizzle(getSqlite());
  return drizzleInstance;
}
