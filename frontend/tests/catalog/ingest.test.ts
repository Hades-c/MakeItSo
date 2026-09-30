import { describe, expect, it, vi } from "vitest";
import { setNow, upstreamDown, withCatalogDb } from "./db";
import { fixtureItems, fixtureSections } from "./helpers";
import { SectionSchema } from "@/lib/types/catalog";
import CatalogMeta from "@/models/CatalogMeta";
import CatalogSection from "@/models/CatalogSection";
import SourceSync from "@/models/SourceSync";
import { ingestTerm } from "@/server/catalog/ingest";
import { acquireTermLease, releaseTermLease, termKey } from "@/server/catalog/meta";
import { searchCourses } from "@/server/catalog";
import { drainBackground } from "@/server/catalog/background";
import {
  isLockedElsewhere,
  isRefreshDue,
  refreshTerm,
  setIngestDepsForTests,
} from "@/server/catalog/refresh";
import { resetCatalogState } from "@/server/catalog/state";
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

  it("measures against the high-water mark, so partial results cannot shrink a term step by step", async () => {
    await ingestTerm(SPRING);
    expect(await meta()).toMatchObject({ peakSectionCount: 485 });
    expect((await ingestWith(springItems().slice(0, 243))).status).toBe("updated");
    // 243 are stored now, but the baseline stays 485: 122 is still below half of it.
    const second = await ingestWith(springItems().slice(0, 122));
    expect(second).toMatchObject({ status: "rejected", sectionCount: 243 });
    expect(second.error).toBe(
      "Upstream returned 122 sections (had 243, up to 485 recently); kept the stored data.",
    );
    expect(await CatalogSection.countDocuments({ termCode: SPRING })).toBe(243);
    expect(await meta()).toMatchObject({ peakSectionCount: 485, rejectedCount: 122 });
    // Growing back is always accepted; the mark lapses after 30 days without reaching it.
    setNow("2026-11-05T12:00:00-04:00");
    expect((await ingestWith(springItems().slice(0, 122))).status).toBe("updated");
    expect(await meta()).toMatchObject({ peakSectionCount: 122 });
  });

  it("halving over and over stops at the first step below half of the peak (Fall 2026, 676 sections)", async () => {
    const fall = fixtureItems("202601");
    await ingestTerm("202601");
    const statuses: string[] = [];
    let n = fall.length;
    for (let step = 0; step < 5; step++) {
      n = Math.ceil(n / 2);
      const items = fall.slice(0, n);
      statuses.push(
        `${n}:${(await ingestTerm("202601", { fetchPage: async () => items, timeoutMs: 8000 })).status}`,
      );
    }
    expect(statuses).toEqual([
      "338:updated",
      "169:rejected",
      "85:rejected",
      "43:rejected",
      "22:rejected",
    ]);
    expect(await CatalogSection.countDocuments({ termCode: "202601" })).toBe(338);
  });

  it("never shrinks a past term by more than 10% (its schedule is final)", async () => {
    const past = fixtureItems("202501"); // Fall 2025: a past term on 2026-09-30
    await ingestTerm("202501");
    const shrunk = past.slice(0, 110); // 85% of 130
    const outcome = await ingestTerm("202501", { fetchPage: async () => shrunk, timeoutMs: 8000 });
    expect(outcome).toMatchObject({ status: "rejected", sectionCount: 130 });
    expect((await meta("202501"))?.lastError).toContain("Upstream returned 110 sections");
    const slight = past.slice(0, 120); // 92%
    expect(
      (await ingestTerm("202501", { fetchPage: async () => slight, timeoutMs: 8000 })).status,
    ).toBe("updated");
    // Hot terms keep the 50% rule; the caller may say which kind a term is.
    expect(
      (
        await ingestTerm(
          "202501",
          { fetchPage: async () => past.slice(0, 70), timeoutMs: 8000 },
          { hot: true },
        )
      ).status,
    ).toBe("updated");
  });
});

describe("items from another term", () => {
  const retermed = (items: Record<string, unknown>[], code: number) =>
    items.map((item) => ({ ...item, term: { ...(item.term as object), code } }));

  it("fails a refresh whose answer ignored term_code (every term mixed together), keeping the data", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await ingestTerm(SPRING);
    // A term-agnostic answer: full pages of sections from other terms (here: Spring 2027 relabelled Fall 2024).
    const foreign = retermed(springItems(), 202401);
    const outcome = await ingestTerm(SPRING, { fetchPage: async () => foreign, timeoutMs: 8000 });
    expect(outcome).toMatchObject({ status: "failed", sectionCount: 485 });
    expect(outcome.error).toBe(
      "485 of 485 upstream sections were malformed (485 from another term); kept the stored data.",
    );
    expect(await CatalogSection.countDocuments({ termCode: SPRING })).toBe(485);
    // A handful of strays is dropped, the rest stored.
    const mixed = [...springItems().slice(3), ...retermed(springItems().slice(0, 3), 202401)];
    const few = await ingestTerm(SPRING, { fetchPage: async () => mixed, timeoutMs: 8000 });
    expect(few).toMatchObject({ status: "updated", sectionCount: 482 });
    expect((await meta())?.invalidCount).toBe(3);
    warn.mockRestore();
  });

  it("accepts the recorded payloads, whose items all carry the requested term", () => {
    for (const term of ["202501", "202601", "202602"]) {
      const items = fixtureItems(term) as { term?: { code?: unknown } }[];
      expect(
        items.every((item) => String(item.term?.code) === term),
        term,
      ).toBe(true);
    }
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
    // hot: given, so the ingest does not resolve terms (the stubbed network would hang that request too).
    const outcome = await ingestTerm(
      SPRING,
      { fetchPage: fetchSectionsPage, timeoutMs: 50 },
      { hot: true },
    );
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
    expect(isLockedElsewhere(SPRING)).toBe(true);
    await CatalogMeta.updateOne(
      { key: termKey(SPRING) },
      { $set: { lockUntil: new Date(Date.now() - 1000) } },
    );
    // The held lease is remembered for at most 15 s; after that the expired lease is taken over.
    const realNow = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(realNow + 16_000);
    expect(isLockedElsewhere(SPRING)).toBe(false);
    clock.mockRestore();
    expect(await refreshTerm(SPRING)).toMatchObject({ status: "updated", sectionCount: 485 });
    await releaseTermLease(SPRING, owner!);
    expect((await meta())?.lockUntil).toBeNull();
  });

  it("returns the lease in a current shape (returnDocument 'after', not the deprecated `new`)", async () => {
    const spy = vi.spyOn(CatalogMeta, "findOneAndUpdate");
    const owner = await acquireTermLease(SPRING);
    expect(owner).toMatch(/^[a-f0-9]{8}:\d+$/);
    expect(spy.mock.calls[0]?.[2]).toMatchObject({ upsert: true, returnDocument: "after" });
    expect(spy.mock.calls[0]?.[2]).not.toHaveProperty("new");
    await releaseTermLease(SPRING, owner!);
  });

  it("skips the fetch when another instance refreshed the term just before the lease was taken", async () => {
    await ingestTerm(SPRING);
    setNow("2026-09-30T12:20:00-04:00"); // stale by this instance's (memoised) view…
    const fetchPage = vi.fn(async () => springItems());
    setIngestDepsForTests({ fetchPage });
    // … but another instance refreshed it a moment ago and released its lease.
    await CatalogMeta.updateOne(
      { key: termKey(SPRING) },
      { $set: { lastSuccessAt: new Date("2026-09-30T16:20:00Z") } },
    );
    const outcome = await refreshTerm(SPRING, {
      hot: true,
      due: (latest) => isRefreshDue(latest, true),
    });
    expect(outcome).toMatchObject({ status: "fresh", sectionCount: 485 });
    expect(fetchPage).not.toHaveBeenCalled();
    expect((await meta())?.lockUntil).toBeNull();
  });

  it("does not retry the lease on every read while another instance holds it", async () => {
    await searchCourses({}); // load Spring 2027
    const owner = await acquireTermLease(SPRING); // another instance starts refreshing it
    resetCatalogState();
    setNow("2026-09-30T12:20:00-04:00"); // stale: every read wants a background refresh
    const attempts = vi.spyOn(CatalogMeta, "findOneAndUpdate");
    for (let i = 0; i < 50; i++) {
      await searchCourses({ q: "CSC 121" });
      await drainBackground();
    }
    expect(attempts).toHaveBeenCalledTimes(1);
    expect(isLockedElsewhere(SPRING)).toBe(true);
    await releaseTermLease(SPRING, owner!);
  });
});
