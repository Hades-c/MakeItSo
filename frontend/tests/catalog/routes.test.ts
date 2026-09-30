import { describe, expect, it, vi } from "vitest";
import { upstreamDown, withCatalogDb } from "./db";
import { GET as availabilityRoute } from "@/app/api/catalog/availability/route";
import { GET as courseRoute } from "@/app/api/catalog/courses/[term]/[code]/route";
import { GET as filtersRoute } from "@/app/api/catalog/filters/route";
import { GET as searchRoute } from "@/app/api/catalog/search/route";
import { GET as termsRoute } from "@/app/api/catalog/terms/route";
import { GET as cronRoute } from "@/app/api/cron/catalog/route";
import {
  AvailabilityResponseSchema,
  CourseResponseSchema,
  TermsResponseSchema,
} from "@/lib/api/catalog";
import { CatalogFiltersSchema, CatalogSearchResultSchema } from "@/lib/types/catalog";
import CatalogSection from "@/models/CatalogSection";
import { drainBackground } from "@/server/catalog/background";
import { UNAVAILABLE_MESSAGE } from "@/server/catalog/config";
import { CatalogCronResultSchema } from "@/server/catalog/cron";
import { setIngestDepsForTests } from "@/server/catalog/refresh";
import { PUBLIC_CATALOG_CACHE } from "@/server/http";

withCatalogDb();

const request = (path: string, init?: RequestInit) => new Request(`http://localhost${path}`, init);

async function expectPublic(res: Response, status = 200) {
  expect(res.status).toBe(status);
  expect(res.headers.get("cache-control")).toBe(PUBLIC_CATALOG_CACHE);
  return res.json() as Promise<unknown>;
}

async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  const body = (await res.json()) as { error: { code: string; message: string } };
  expect(body.error.code).toBe(code);
  return body.error;
}

describe("GET /api/catalog/terms", () => {
  it("answers the terms with public CDN caching", async () => {
    const body = TermsResponseSchema.parse(
      await expectPublic(await termsRoute(request("/api/catalog/terms"))),
    );
    expect(body).toMatchObject({ current: "202601", registration: "202602" });
  });

  it("serves GET only", async () => {
    const res = await termsRoute(request("/api/catalog/terms", { method: "POST" }));
    await expectError(res, 405, "bad_request");
  });
});

describe("GET /api/catalog/search", () => {
  it("searches the registration term by default", async () => {
    const body = CatalogSearchResultSchema.parse(
      await expectPublic(await searchRoute(request("/api/catalog/search?q=csc%20121"))),
    );
    expect(body.term).toBe("202602");
    expect(body.items.map((i) => i.code)).toEqual(["CSC 121"]);
  });

  it("parses repeated and comma-separated filters", async () => {
    const res = await searchRoute(
      request(
        "/api/catalog/search?term=202601&dept=CSC&dept=MAT&level=100,200&openOnly=true&pageSize=5&page=2",
      ),
    );
    const body = CatalogSearchResultSchema.parse(await expectPublic(res));
    expect(body).toMatchObject({ term: "202601", page: 2, pageSize: 5 });
    expect(body.items.length).toBeLessThanOrEqual(5);
    for (const item of body.items) expect(item.code).toMatch(/^(CSC|MAT) [12]/);
  });

  it("answers 400 for a bad term, filter or page size", async () => {
    for (const query of [
      "term=2026",
      "term=000001",
      "days=X",
      "after=25:00",
      "req=FOO",
      "pageSize=500",
      "openOnly=maybe",
    ]) {
      await expectError(
        await searchRoute(request(`/api/catalog/search?${query}`)),
        400,
        "validation_failed",
      );
    }
  });

  it("answers 503 (not cached) when the schedule cannot be loaded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    setIngestDepsForTests({
      fetchPage: async () => {
        throw upstreamDown();
      },
    });
    const error = await expectError(
      await searchRoute(request("/api/catalog/search")),
      503,
      "unavailable",
    );
    expect(error.message).toBe(UNAVAILABLE_MESSAGE);
  });
});

describe("GET /api/catalog/courses/[term]/[code]", () => {
  const get = (term: string, code: string) =>
    courseRoute(request(`/api/catalog/courses/${term}/${code}`), {
      params: Promise.resolve({ term, code }),
    });

  it("answers the course with its 'as of' time", async () => {
    const body = CourseResponseSchema.parse(await expectPublic(await get("202602", "CSC-221")));
    expect(body.course.code).toBe("CSC 221");
    expect(body.asOf).toBe("2026-09-30T16:00:00.000Z");
    const lower = CourseResponseSchema.parse(await expectPublic(await get("202602", "csc-221")));
    expect(lower.course.code).toBe("CSC 221");
  });

  it("answers 404 when not offered, 400 for a bad term or code", async () => {
    const missing = await expectError(await get("202602", "ZZZ-999"), 404, "not_found");
    expect(missing.message).toBe("ZZZ 999 is not offered in Spring 2027.");
    await expectError(await get("2026", "CSC-221"), 400, "validation_failed");
    await expectError(await get("202602", "hello"), 400, "validation_failed");
  });
});

describe("GET /api/catalog/availability", () => {
  it("is not CDN-cached while the history still waits for the backfill", async () => {
    const early = await availabilityRoute(request("/api/catalog/availability?code=csc221"));
    expect(early.status).toBe(200);
    expect(early.headers.get("cache-control")).toBe("private, no-store");
    const partial = AvailabilityResponseSchema.parse(await early.json());
    expect(partial.availability.map((a) => a.termCode)).toEqual(["202601", "202602", "202701"]);
    expect(partial.availability.at(-1)).toEqual({
      termCode: "202701",
      status: "not-yet-published",
    });
    // Requested terms that are known already are final, whatever the backfill does.
    await expectPublic(
      await availabilityRoute(request("/api/catalog/availability?code=CSC221&terms=202601,202602")),
    );
    // Fall 2027's "usually offered" depends on Fall 2024 and 2025: not final yet.
    const future = await availabilityRoute(
      request("/api/catalog/availability?code=CSC221&terms=202701"),
    );
    expect(future.headers.get("cache-control")).toBe("private, no-store");
  });

  it("reports the history, or just the requested terms", async () => {
    await availabilityRoute(request("/api/catalog/availability?code=csc221"));
    await drainBackground(); // the history backfill
    const all = AvailabilityResponseSchema.parse(
      await expectPublic(await availabilityRoute(request("/api/catalog/availability?code=csc221"))),
    );
    expect(all.code).toBe("CSC 221");
    expect(all.availability.map((a) => a.termCode)).toEqual([
      "202201",
      "202202",
      "202301",
      "202302",
      "202401",
      "202402",
      "202501",
      "202502",
      "202601",
      "202602",
      "202701",
    ]);
    const some = AvailabilityResponseSchema.parse(
      await expectPublic(
        await availabilityRoute(
          request("/api/catalog/availability?code=CSC%20221&terms=202602,202702"),
        ),
      ),
    );
    expect(some.availability).toEqual([
      { termCode: "202602", status: "offered", sectionCount: 2 },
      {
        termCode: "202702",
        status: "not-yet-published",
        usually: { season: "Spring", basedOn: expect.arrayContaining(["202602"]) },
      },
    ]);
  });

  it("answers 400 without a valid code or with a bad term", async () => {
    await expectError(
      await availabilityRoute(request("/api/catalog/availability")),
      400,
      "validation_failed",
    );
    await expectError(
      await availabilityRoute(request("/api/catalog/availability?code=hello")),
      400,
      "validation_failed",
    );
    await expectError(
      await availabilityRoute(request("/api/catalog/availability?code=CSC221&terms=2026")),
      400,
      "validation_failed",
    );
  });
});

describe("GET /api/catalog/filters", () => {
  it("answers the registration term's lists by default", async () => {
    const body = CatalogFiltersSchema.parse(
      await expectPublic(await filtersRoute(request("/api/catalog/filters"))),
    );
    expect(body.term).toBe("202602");
    expect(body.departments.length).toBeGreaterThan(30);
    const fall = CatalogFiltersSchema.parse(
      await expectPublic(await filtersRoute(request("/api/catalog/filters?term=202601"))),
    );
    expect(fall.term).toBe("202601");
    await expectError(
      await filtersRoute(request("/api/catalog/filters?term=abc")),
      400,
      "validation_failed",
    );
  });
});

describe("GET /api/cron/catalog", () => {
  const cron = (authorization?: string) =>
    cronRoute(
      request("/api/cron/catalog", authorization ? { headers: { authorization } } : undefined),
    );
  const SECRET = "catalog-cron-secret-0123456789";

  it("needs CRON_SECRET: 503 while unset, 401 with a wrong bearer", async () => {
    await expectError(await cron(`Bearer ${SECRET}`), 503, "unavailable");
    vi.stubEnv("CRON_SECRET", SECRET);
    await expectError(await cron(), 401, "unauthorized");
    await expectError(await cron("Bearer wrong-secret-0123456789"), 401, "unauthorized");
  });

  it("backfills 202201 → registration on the first run, then only what is due", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const first = await cron(`Bearer ${SECRET}`);
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("private, no-store");
    const body = CatalogCronResultSchema.parse(await first.json());
    expect(body.ok).toBe(true);
    expect(body.terms.map((t) => t.term)).toEqual([
      "202201",
      "202202",
      "202203",
      "202301",
      "202302",
      "202303",
      "202401",
      "202402",
      "202403",
      "202501",
      "202502",
      "202503",
      "202601",
      "202602",
    ]);
    expect(body.terms.every((t) => t.status === "updated")).toBe(true);
    expect(body.terms.find((t) => t.term === "202503")?.sectionCount).toBe(0);
    expect(await CatalogSection.countDocuments({ termCode: "202601" })).toBe(676);

    const second = CatalogCronResultSchema.parse(await (await cron(`Bearer ${SECRET}`)).json());
    expect(second.terms.every((t) => t.status === "fresh")).toBe(true);
  });
});
