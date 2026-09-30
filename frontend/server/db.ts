import "server-only";
import mongoose from "mongoose";
import { readEnv } from "@/server/env";

/**
 * Lazy, cached MongoDB connection.
 *
 * - Importing this module never connects and never throws (so `next build` needs no MONGODB_URI).
 * - The in-flight connection promise is cached (also across dev hot reloads via globalThis) so concurrent callers
 *   share one connection, but it is RESET when the attempt fails: the next call retries instead of replaying the
 *   cached rejection forever (audit performance/mongo-rejected-promise-cached).
 * - serverSelectionTimeoutMS is 5 s (driver default is 30 s), so an unreachable database fails fast.
 */

export const DB_CONNECT_OPTIONS = {
  bufferCommands: false,
  serverSelectionTimeoutMS: 5_000,
  maxPoolSize: 10,
} as const satisfies mongoose.ConnectOptions;

interface DbCache {
  promise: Promise<typeof mongoose> | null;
}

const globalForDb = globalThis as typeof globalThis & { __makeitsoDb?: DbCache };
const cache: DbCache = (globalForDb.__makeitsoDb ??= { promise: null });

/** Connect (once) and return the mongoose instance. Rejects with a clear error if MONGODB_URI is missing. */
export async function getDb(): Promise<typeof mongoose> {
  // Once connected, the driver handles transient disconnects/reconnects itself; we only start over after a
  // failed attempt or an explicit disconnectDb().
  if (!cache.promise) {
    const uri = readEnv("MONGODB_URI");
    const attempt = mongoose.connect(uri, DB_CONNECT_OPTIONS);
    cache.promise = attempt;
    attempt.catch(() => {
      // Only clear the cache if it still holds this attempt (a newer attempt may have replaced it).
      if (cache.promise === attempt) cache.promise = null;
    });
  }

  return cache.promise;
}

/** Close the connection and clear the cache (tests, scripts). */
export async function disconnectDb(): Promise<void> {
  const pending = cache.promise;
  cache.promise = null;
  if (pending) {
    await pending.catch(() => undefined);
  }
  await mongoose.disconnect();
}
