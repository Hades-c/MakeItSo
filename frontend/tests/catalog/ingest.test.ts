import { describe, expect, it, vi } from "vitest";
import { setNow, upstreamDown, withCatalogDb } from "./db";
import { fixtureItems, fixtureSections } from "./helpers";
import { SectionSchema } from "@/lib/types/catalog";
import CatalogMeta from "@/models/CatalogMeta";
import CatalogSection from "@/models/CatalogSection";
import SourceSync from "@/models/SourceSync";
import { ingestTerm } from "@/server/catalog/ingest";
import { acquireTermLease, releaseTermLease, termKey } from "@/server/catalog/meta";
import { refreshTerm, setIngestDepsForTests } from "@/server/catalog/refresh";
import { rowToSection } from "@/server/catalog/store";
import {
  COURSES_PAGE_SIZE,
  coursesUrl,
  fetchAllSections,
  fetchSectionsPage,
  MAX_COURSE_PAGES,
} from "@/server/catalog/upstream";
import { trusted } from "@/server/db";
import { MissingFixtureError } from "@/server/http/fixtures";

withCatalogDb();

const SPRING = "202602";
const springItems = () => fixtureItems(SPRING) as Record<string, unknown>[];

/** `count` distinct copies of a real section (new CRNs), for pagination. */
function syntheticItems(count: number, firstCrn = 50000): Record<string, unknown>[] {
  const template = springItems()[0]!;
  return Array.from({ length: count }, (_, i) => ({ ...template, crn: firstCrn + i }));
}

const meta = (term = SPRING) => CatalogMeta.findOne({ key: termKey(term) }).lean();

describe("pagination (PLAN §5: offset pages of 1000, stop on a short page, cap 20)", () => {
  it("requests limit=1000&offset=N&term_code=T", () => {
    expect(coursesUrl("202602", 2000)).toBe(
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=2000&term_code=202602",
    );
  });

  it("stops on the first short page", async () => {
    const pages = [syntheticItems(1000, 1), syntheticItems(1000, 2001), syntheticItems(7, 4001)];
    const fetchPage = vi.fn(async (_term: string, offset: number) => pages[offset / 1000] ?? []);
    const fetched = await fetchAllSections("202602", fetchPage);
    expect(fetchPage.mock.calls.map(([, offset]) => offset)).toEqual([0, 1000, 2000]);
    expect(fetched).toMatchObject({ pages: 3, truncated: false });
    expect(fetched.items).toHaveLength(2007);
  });

  it("stops after an empty page too, and never asks for more than 20 pages", async () => {
    const exact = vi.fn(async (_term: string, offset: number) =>
      offset === 0 ? syntheticItems(COURSES_PAGE_SIZE) : [],
    );
    expect((await fetchAllSections("202602", exact)).pages).toBe(2);
    const endless = vi.fn(async () => syntheticItems(COURSES_PAGE_SIZE));
    const fetched = await fetchAllSections("202602", endless);
    expect(endless).toHaveBeenCalledTimes(MAX_COURSE_PAGES);
    expect(fetched).toMatchObject({ pages: 20, truncated: true });
  });

  it("ignores x-next and x-record-count", async () => {
    vi.stubEnv("EXTERNAL_MODE", "live");
    const fetchMock = vi.fn(async () =>
      Response.json(syntheticItems(3), {
        headers: {
          "x-next": "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=1000",
          "x-record-count": "5000",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const fetched = await fetchAllSections("202602", fetchSectionsPage);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetched.items).toHaveLength(3);
    vi.unstubAllGlobals();
  });
});

describe("ingestTerm", () => {
  it("stores every section of a term with its meta and records the sync", async () => {
    const outcome = await ingestTerm(SPRING);
    const courseCount = new Set(fixtureSections(SPRING).map((s) => s.courseCode)).size;
    expect(outcome).toEqual({ term: SPRING, status: "updated", sectionCount: 485, courseCount });
    expect(await CatalogSection.countDocuments({ termCode: SPRING })).toBe(485);

    const stored = await meta();
    expect(stored).toMatchObject({
      kind: "term",
      termCode: SPRING,
      sectionCount: 485,
      courseCount,
      pageCount: 1,
      invalidCount: 0,
      lastError: null,
    });
    expect(stored?.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored?.lastSuccessAt?.toISOString()).toBe("2026-09-30T16:00:00.000Z");
    expect(stored?.fetchedAt?.toISOString()).toBe("2026-09-30T16:00:00.000Z");
    const names = stored?.data as { departments: unknown[]; requirements: unknown[] };
    expect(names.departments).toContainEqual({ code: "AFR", name: "Africana Studies" });
    expect(names.requirements).toContainEqual({ code: "CULT", name: "Cultural Diversity" });

    const sync = await SourceSync.findOne({ sourceId: "course-schedule" }).lean();
    expect(sync).toMatchObject({ ok: true, lastCount: 485 });
  });

  it("stores 'no requirement data' and 'open to every year' as absent fields and reads them back", async () => {
    await ingestTerm(SPRING);
    const rows = await CatalogSection.find({ termCode: SPRING }).lean();
    const expected = new Map(fixtureSections(SPRING).map((s) => [s.crn, SectionSchema.parse(s)]));
    for (const row of rows) {
      const record = row as unknown as Record<string, unknown>;
      const section = rowToSection(record)?.section;
      expect(section).toEqual(expected.get(String(row.crn)));
      if (section?.reqCodes === null) expect(record.reqCodes).toBeUndefined();
      if (section?.restrictions.eligibleYears === null) {
        expect((record.restrictions as Record<string, unknown>).eligibleYears).toBeUndefined();
      }
    }
  });

  it("skips the rewrite when the content is unchanged, but moves 'as of'", async () => {
    await ingestTerm(SPRING);
    const first = await meta();
    setNow("2026-09-30T12:20:00-04:00");
    expect((await ingestTerm(SPRING)).status).toBe("unchanged");
    const second = await meta();
    expect(second?.contentHash).toBe(first?.contentHash);
    expect(second?.fetchedAt?.toISOString()).toBe(first?.fetchedAt?.toISOString());
    expect(second?.lastSuccessAt?.toISOString()).toBe("2026-09-30T16:20:00.000Z");
  });

  it("replaces a term: changed sections are updated, vanished CRNs deleted", async () => {
    await ingestTerm(SPRING);
    const items = springItems().slice(10);
    const changed = { ...items[0]!, course_title: "A New Title" };
    const outcome = await ingestTerm(SPRING, {
      fetchPage: async () => [changed, ...items.slice(1)],
      timeoutMs: 8000,
    });
    expect(outcome).toMatchObject({ status: "updated", sectionCount: 475 });
    expect(await CatalogSection.countDocuments({ termCode: SPRING })).toBe(475);
    const gone = springItems()
      .slice(0, 10)
      .map((i) => String(i.crn));
    expect(
      await CatalogSection.countDocuments({ termCode: SPRING, crn: trusted({ $in: gone }) }),
    ).toBe(0);
    expect(
      (await CatalogSection.findOne({ termCode: SPRING, crn: String(items[0]!.crn) }).lean())
        ?.title,
    ).toBe("A New Title");
  });

  it("accepts an empty result for a term that never had sections (a summer)", async () => {
    expect(await ingestTerm("202503")).toEqual({
      term: "202503",
      status: "updated",
      sectionCount: 0,
      courseCount: 0,
    });
    expect((await meta("202503"))?.lastSuccessAt).toBeInstanceOf(Date);
  });

  it("dedupes CRNs repeated across pages", async () => {
    const items = springItems();
    const outcome = await ingestTerm(SPRING, {
      fetchPage: async (_t, offset) => (offset === 0 ? [...items, ...items.slice(0, 515)] : []),
      timeoutMs: 8000,
    });
    expect(outcome.sectionCount).toBe(485);
  });
});

describe("the empty / < 50% guard (PLAN §5: never replace a non-empty term)", () => {
  async function ingestWith(items: unknown[]) {
    return ingestTerm(SPRING, { fetchPage: async () => items, timeoutMs: 8000 });
  }

  it("rejects an empty result and keeps the stored data", async () => {
    await ingestTerm(SPRING);
    const before = await meta();
    setNow("2026-09-30T13:00:00-04:00");
    const outcome = await ingestWith([]);
    expect(outcome).toMatchObject({ status: "rejected", sectionCount: 485 });
    expect(outcome.error).toBe("Upstream returned 0 sections (had 485); kept the stored data.");
    expect(await CatalogSection.countDocuments({ termCode: SPRING })).toBe(485);
    const after = await meta();
    expect(after).toMatchObject({ sectionCount: 485, rejectedCount: 0 });
    expect(after?.contentHash).toBe(before?.contentHash);
    expect(after?.lastSuccessAt?.toISOString()).toBe(before?.lastSuccessAt?.toISOString());
    expect(after?.lastError).toContain("kept the stored data");
    expect(after?.lastErrorAt?.toISOString()).toBe("2026-09-30T17:00:00.000Z");
    const sync = await SourceSync.findOne({ sourceId: "course-schedule" }).lean();
    expect(sync).toMatchObject({ ok: false, lastCount: 485 });
    expect(sync?.lastError).toContain("Spring 2027: Upstream returned 0 sections");
  });

  it("rejects a result below half the stored size, accepts one at or above it", async () => {
    await ingestTerm(SPRING);
    expect((await ingestWith(springItems().slice(0, 242))).status).toBe("rejected");
    expect(await CatalogSection.countDocuments({ termCode: SPRING })).toBe(485);
    const accepted = await ingestWith(springItems().slice(0, 243));
    expect(accepted).toMatchObject({ status: "updated", sectionCount: 243 });
    expect((await meta())?.rejectedCount).toBeNull();
  });
});

describe("failures", () => {
  it("records an upstream failure and keeps the stored data", async () => {
    await ingestTerm(SPRING);
    const outcome = await ingestTerm(SPRING, {
      fetchPage: async () => {
        throw upstreamDown();
      },
      timeoutMs: 8000,
    });
    expect(outcome).toMatchObject({ status: "failed", sectionCount: 485 });
    expect(outcome.error).toContain("Upstream answered 503");
    expect(await CatalogSection.countDocuments({ termCode: SPRING })).toBe(485);
    expect((await SourceSync.findOne({ sourceId: "course-schedule" }).lean())?.ok).toBe(false);
  });

  it("fails on mostly malformed payloads, tolerates a few bad items", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const junk = Array.from({ length: 60 }, (_, i) => ({ crn: i, subject: "nope" }));
    const bad = await ingestTerm(SPRING, {
      fetchPage: async () => [...springItems(), ...junk],
      timeoutMs: 8000,
    });
    expect(bad.status).toBe("failed");
    expect(bad.error).toContain("60 of 545 upstream sections were malformed");
    const few = await ingestTerm(SPRING, {
      fetchPage: async () => [...springItems(), ...junk.slice(0, 3)],
      timeoutMs: 8000,
    });
    expect(few).toMatchObject({ status: "updated", sectionCount: 485 });
    expect((await meta())?.invalidCount).toBe(3);
    warn.mockRestore();
  });

  it("gives up at the upstream timeout instead of hanging", async () => {
    vi.stubEnv("EXTERNAL_MODE", "live");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
          }),
      ),
    );
    const started = Date.now();
    const outcome = await ingestTerm(SPRING, { fetchPage: fetchSectionsPage, timeoutMs: 50 });
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(outcome).toMatchObject({ status: "failed", sectionCount: 0 });
    expect(outcome.error).toContain("Timed out after 50 ms");
    vi.unstubAllGlobals();
  });

  it("never swallows a missing fixture", async () => {
    await expect(ingestTerm("201901")).rejects.toBeInstanceOf(MissingFixtureError);
  });
});

describe("single flight", () => {
  it("shares one refresh per term in a process", async () => {
    const fetchPage = vi.fn(async () => springItems());
    setIngestDepsForTests({ fetchPage });
    const [a, b] = await Promise.all([refreshTerm(SPRING), refreshTerm(SPRING)]);
    expect(a).toBe(b);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("does not refresh while another instance holds the lease; an expired lease is taken over", async () => {
    const owner = await acquireTermLease(SPRING);
    expect(owner).not.toBeNull();
    expect(await acquireTermLease(SPRING)).toBeNull();
    expect(await refreshTerm(SPRING)).toMatchObject({ status: "locked" });
    await CatalogMeta.updateOne(
      { key: termKey(SPRING) },
      { $set: { lockUntil: new Date(Date.now() - 1000) } },
    );
    expect(await refreshTerm(SPRING)).toMatchObject({ status: "updated", sectionCount: 485 });
    await releaseTermLease(SPRING, owner!);
    expect((await meta())?.lockUntil).toBeNull();
  });
});
