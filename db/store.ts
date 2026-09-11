import { env } from "cloudflare:workers";

export function getDatabase(): D1Database {
  if (!env.DB) {
    throw new Error("Court data is temporarily unavailable.");
  }
  return env.DB;
}
