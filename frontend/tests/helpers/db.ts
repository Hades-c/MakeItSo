import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { disconnectDb } from "@/server/db";
import { resetEnvCache } from "@/server/env";

/**
 * In-memory MongoDB for integration tests.
 *
 *   let db: TestDb;
 *   beforeAll(async () => { db = await startTestDb(); });
 *   afterEach(() => db.clear());
 *   afterAll(() => db.stop());
 *
 * startTestDb() points MONGODB_URI at a fresh server (unique database per call), so code under test that calls
 * getDb() connects to it. The first run downloads a mongod binary into the mongodb-memory-server cache.
 */
export interface TestDb {
  uri: string;
  clear(): Promise<void>;
  stop(): Promise<void>;
}

let counter = 0;

export async function startTestDb(): Promise<TestDb> {
  const server = await MongoMemoryServer.create();
  const uri = server.getUri(`wave0-test-${process.pid}-${++counter}`);
  const previousUri = process.env.MONGODB_URI;
  process.env.MONGODB_URI = uri;
  resetEnvCache();

  return {
    uri,
    async clear() {
      const db = mongoose.connection.db;
      if (!db) return;
      const collections = await db.collections();
      await Promise.all(collections.map((c) => c.deleteMany({})));
    },
    async stop() {
      await disconnectDb();
      await server.stop();
      if (previousUri === undefined) delete process.env.MONGODB_URI;
      else process.env.MONGODB_URI = previousUri;
      resetEnvCache();
    },
  };
}
