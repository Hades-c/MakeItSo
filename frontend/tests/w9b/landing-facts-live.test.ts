import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import { loadLandingFacts } from "@/app/(marketing)/_lib/facts";
import { countCourses, resolveTerms } from "@/server/catalog";
import { CAREERS } from "@/server/content/careers";
import { getDb } from "@/server/db";

/** The landing facts against the real catalog service (fixtures mode, in-memory MongoDB, no network). */

let testDb: TestDb;

beforeAll(async () => {
  testDb = await startTestDb();
  await getDb();
});

afterAll(async () => {
  await testDb.stop();
});

describe("landing facts from the fixtures", () => {
  it("counts the registration term's courses and the career paths", async () => {
    const facts = await loadLandingFacts({ timeoutMs: 20_000 });
    const { registration } = await resolveTerms();
    expect(registration).toBe("202602");
    const courses = await countCourses(registration);
    expect(courses).toBeGreaterThan(0);
    expect(facts).toEqual([
      {
        id: "courses",
        value: courses,
        label: "courses on the Spring 2027 schedule",
        source: "course-schedule",
      },
      {
        id: "careers",
        value: CAREERS.length,
        label: "career paths, each with real Davidson courses",
        source: null,
      },
    ]);
  });
});
