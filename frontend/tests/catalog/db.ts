import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import { drainBackground } from "@/server/catalog/background";
import { resetCatalogState } from "@/server/catalog/state";
import { getDb } from "@/server/db";
import { ExternalFetchError } from "@/server/http/external";

/**
 * Integration-test lifecycle for W1: an in-memory MongoDB per file; after each test the detached background work
 * is awaited (a MissingFixtureError it hit fails the test), the in-process catalog caches are reset and the
 * database is emptied.
 */
export function withCatalogDb(): void {
  let testDb: TestDb;
  beforeAll(async () => {
    testDb = await startTestDb();
    await getDb();
  });
  afterEach(async () => {
    try {
      await drainBackground();
    } finally {
      resetCatalogState();
      vi.unstubAllEnvs();
      await testDb.clear();
    }
  });
  afterAll(async () => {
    await testDb.stop();
  });
}

/** Move the server clock (server/clock.ts now()) in fixtures mode. */
export function setNow(iso: string): void {
  vi.stubEnv("FIXTURES_NOW", iso);
}

export const FIXTURES_NOW = "2026-09-30T12:00:00-04:00";

/** An upstream failure as fetchExternal reports it. */
export function upstreamDown(url = "https://api.davidson.edu/api/public/v2/courses") {
  return new ExternalFetchError("course-schedule", url, "http", "Upstream answered 503", 503);
}
