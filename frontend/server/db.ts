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
 * - Every wait is bounded (hardening: a black-holed database used to stall requests 35-43 s): server selection
 *   3 s (driver default 30 s), connect 5 s, and a socket that goes silent for 10 s fails its operation.
 * - Fail fast once the database is known to be down (a small circuit breaker): while the driver's monitor sees no
 *   reachable server, and for 10 s after a failed connection attempt to the same URI, getDb() throws
 *   DbUnavailableError at once instead of each read waiting out its own timeout (a page with sequential reads waited
 *   5 s per read). The driver's monitor keeps checking and closes the breaker when a server answers again.
 *   server/http/errors.ts answers these, and the driver's selection/network errors, with 503 + Retry-After.
 * - `sanitizeFilter` is on (PLAN §4.1.9): any object with a `$`-key inside a query FILTER is wrapped in `$eq`, so
 *   request data can never inject a query operator. Operators you write on purpose must be wrapped:
 *     Plan.findOneAndUpdate({ userId, items: trusted({ $not: { $elemMatch: { ... } } }) }, update)
 *   (updates such as `$set`/`$pull`/`$inc` are not filters and need nothing.)
 */

mongoose.set("sanitizeFilter", true);

/** Mark a hand-written query operator as intentional under sanitizeFilter (re-export of mongoose.trusted). */
export const trusted: typeof mongoose.trusted = (value) => mongoose.trusted(value);

export const DB_CONNECT_OPTIONS = {
  bufferCommands: false,
  serverSelectionTimeoutMS: 3_000,
  connectTimeoutMS: 5_000,
  socketTimeoutMS: 10_000,
  maxPoolSize: 10,
} as const satisfies mongoose.ConnectOptions;

/** How long getDb() fails fast after a connection attempt to the same URI failed. */
export const DB_FAIL_FAST_MS = 10_000;

/** The database is known to be unreachable right now: thrown at once instead of waiting out a timeout. */
export class DbUnavailableError extends Error {
  override name = "DbUnavailableError";
  constructor() {
    super("The database is unavailable right now.");
  }
}

interface DbCache {
  promise: Promise<typeof mongoose> | null;
  /** False while the driver's monitor sees no reachable server (after it had seen one). */
  reachable: boolean;
  /** Fail fast until this performance.now() time after a failed attempt to `failedUri`. */
  failFastUntil: number;
  failedUri: string | null;
  /** The client whose topology events are watched. */
  watched: unknown;
}

interface TopologyDescriptionLike {
  servers: Map<string, { type: string }>;
}

/**
 * The breaker's view of the driver's topology: reachable while any server is of a known type (not "Unknown"). Fed by
 * the client's topologyDescriptionChanged events; exported for tests.
 */
export function noteTopology(description: TopologyDescriptionLike): void {
  cache.reachable = [...description.servers.values()].some((server) => server.type !== "Unknown");
}

const globalForDb = globalThis as typeof globalThis & { __makeitsoDb?: DbCache };
const cache: DbCache = (globalForDb.__makeitsoDb ??= {
  promise: null,
  reachable: true,
  failFastUntil: 0,
  failedUri: null,
  watched: null,
});

function watchTopology(instance: typeof mongoose): void {
  const client = instance.connection.getClient?.();
  if (!client || cache.watched === client) return;
  cache.watched = client;
  client.on("topologyDescriptionChanged", (event: { newDescription: TopologyDescriptionLike }) => {
    if (cache.watched === client) noteTopology(event.newDescription);
  });
  // A closed client (mongoose.disconnect() elsewhere) is not an outage: the next getDb() connects again.
  client.on("topologyClosed", () => {
    if (cache.watched !== client) return;
    cache.watched = null;
    cache.promise = null;
    cache.reachable = true;
  });
}

/** Connect (once) and return the mongoose instance. Rejects with a clear error if MONGODB_URI is missing. */
export async function getDb(): Promise<typeof mongoose> {
  // Once connected, the driver handles transient disconnects/reconnects itself; we only start over after a
  // failed attempt or an explicit disconnectDb().
  if (cache.promise && !cache.reachable) throw new DbUnavailableError();
  if (!cache.promise) {
    const uri = readEnv("MONGODB_URI");
    if (cache.failedUri === uri && performance.now() < cache.failFastUntil) {
      throw new DbUnavailableError();
    }
    mongoose.set("sanitizeFilter", true);
    const attempt = mongoose.connect(uri, DB_CONNECT_OPTIONS);
    cache.promise = attempt;
    cache.reachable = true;
    attempt.then(watchTopology, () => {
      // Only clear the cache if it still holds this attempt (a newer attempt may have replaced it).
      if (cache.promise === attempt) cache.promise = null;
      cache.failedUri = uri;
      cache.failFastUntil = performance.now() + DB_FAIL_FAST_MS;
    });
  }

  return cache.promise;
}

/** Close the connection and clear the cache (tests, scripts). */
export async function disconnectDb(): Promise<void> {
  const pending = cache.promise;
  cache.promise = null;
  cache.reachable = true;
  cache.failFastUntil = 0;
  cache.failedUri = null;
  cache.watched = null;
  if (pending) {
    await pending.catch(() => undefined);
  }
  await mongoose.disconnect();
}
