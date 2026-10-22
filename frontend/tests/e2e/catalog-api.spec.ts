import { expect, test } from "@playwright/test";

/**
 * W1: the public catalog API against the production server (fixtures mode, empty in-memory database). The first
 * request cold-loads the registration term from the recorded Davidson responses; every answer is public and
 * CDN-cacheable; errors are never cached. API-only, so it runs once (desktop project).
 */

const PUBLIC_CATALOG = "public, s-maxage=900, stale-while-revalidate=3600";

test.describe("catalog API", () => {
  test.skip(({ isMobile }) => isMobile, "API checks run once, in the desktop project");

  test("terms, search, course, availability and filters", async ({ request }) => {
    const terms = await request.get("/api/catalog/terms");
    expect(terms.status()).toBe(200);
    expect(terms.headers()["cache-control"]).toBe(PUBLIC_CATALOG);
    expect(await terms.json()).toMatchObject({ current: "202601", registration: "202602" });

    const search = await request.get("/api/catalog/search?q=csc121");
    expect(search.status()).toBe(200);
    expect(search.headers()["cache-control"]).toBe(PUBLIC_CATALOG);
    const found = (await search.json()) as { term: string; items: { code: string }[] };
    expect(found.term).toBe("202602");
    expect(found.items.map((item) => item.code)).toEqual(["CSC 121"]);

    const course = await request.get("/api/catalog/courses/202602/CSC-221");
    expect(course.status()).toBe(200);
    const body = (await course.json()) as { course: { code: string; sections: unknown[] } };
    expect(body.course.code).toBe("CSC 221");
    expect(body.course.sections.length).toBeGreaterThan(0);

    const availability = await request.get("/api/catalog/availability?code=CSC%20221&terms=202602");
    // Final (Spring 2027 is loaded), so CDN-cacheable; a history still waiting for its backfill is not.
    expect(availability.headers()["cache-control"]).toBe(PUBLIC_CATALOG);
    expect(await availability.json()).toEqual({
      code: "CSC 221",
      availability: [{ termCode: "202602", status: "offered", sectionCount: 2 }],
    });

    // A topics course is named neutrally; its sections keep their own titles.
    const wri = await request.get("/api/catalog/courses/202602/WRI-101");
    const topics = (await wri.json()) as {
      course: { title: string; sections: { title: string }[] };
    };
    expect(topics.course.title).toBe("Writing Program: topics vary by section");
    expect(topics.course.sections.map((s) => s.title)).toContain("Religion in the Public Square");

    const filters = await request.get("/api/catalog/filters");
    expect(((await filters.json()) as { term: string }).term).toBe("202602");
  });

  test("errors are typed and never cached", async ({ request }) => {
    const missing = await request.get("/api/catalog/courses/202602/ZZZ-999");
    expect(missing.status()).toBe(404);
    expect(missing.headers()["cache-control"]).toBe("private, no-store");
    const bad = await request.get("/api/catalog/search?term=2026");
    expect(bad.status()).toBe(400);
    expect(((await bad.json()) as { error: { code: string } }).error.code).toBe(
      "validation_failed",
    );
    // CRON_SECRET is not set on the e2e server.
    expect((await request.get("/api/cron/catalog")).status()).toBe(503);
  });
});
