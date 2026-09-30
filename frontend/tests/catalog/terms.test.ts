import { describe, expect, it, vi } from "vitest";
import { setNow, upstreamDown, withCatalogDb } from "./db";
import { ResolvedTermsSchema } from "@/lib/types/catalog";
import CatalogMeta from "@/models/CatalogMeta";
import { resolveTerms } from "@/server/catalog";
import { drainBackground } from "@/server/catalog/background";
import { refreshTerm } from "@/server/catalog/refresh";
import { resetCatalogState } from "@/server/catalog/state";
import {
  normaliseTermEntries,
  setTermsFetchForTests,
  TERMS_KEY,
  toDayKey,
} from "@/server/catalog/terms";
import { fetchTermsList } from "@/server/catalog/upstream";

withCatalogDb();

/** Count upstream terms requests (still served from the fixture). */
function countTermsFetches() {
  const spy = vi.fn(fetchTermsList);
  setTermsFetchForTests(spy);
  return spy;
}

function failTermsFetches() {
  const spy = vi.fn(async () => {
    throw upstreamDown("https://api.davidson.edu/api/public/v2/terms?limit=500");
  });
  setTermsFetchForTests(spy);
  return spy;
}

describe("normalising the upstream list", () => {
  it("keeps semester-era codes only and reads UTC-midnight dates as UTC calendar dates", () => {
    const entries = normaliseTermEntries([
      { term_code: "000001", description: "Transfer", start_date: 0, end_date: 0 },
      { term_code: "196002", description: "Winter 1960-61" },
      { term_code: "202601", is_active: true, start_date: 1787529600000, end_date: 1797292800000 },
      { term_code: "202603", is_summer: true, start_date: "2027-05-19T00:00:00Z" },
      { term_code: 202602, is_next: true },
      { junk: true },
    ]);
    expect(entries).toEqual([
      {
        code: "202601",
        isSummer: false,
        isActive: true,
        isNext: false,
        startDate: "2026-08-24",
        endDate: "2026-12-15",
      },
      {
        code: "202602",
        isSummer: false,
        isActive: false,
        isNext: true,
        startDate: null,
        endDate: null,
      },
      {
        code: "202603",
        isSummer: true,
        isActive: false,
        isNext: false,
        startDate: "2027-05-19",
        endDate: null,
      },
    ]);
    expect(toDayKey("2026-08-24")).toBe("2026-08-24");
    expect(toDayKey("nonsense")).toBeNull();
    expect(toDayKey(null)).toBeNull();
  });
});

describe("resolveTerms", () => {
  it("resolves the fixture list on 2026-09-30: current Fall 2026, registration Spring 2027", async () => {
    const resolved = ResolvedTermsSchema.parse(await resolveTerms());
    expect(resolved.current).toBe("202601");
    expect(resolved.registration).toBe("202602");
    expect(resolved.asOf).toBe("2026-09-30T16:00:00.000Z");
    const codes = resolved.terms.map((t) => t.code);
    expect(codes[0]).toBe("202201");
    expect(codes).toEqual([...codes].sort());
    expect(codes).toContain("202902");
    expect(codes.every((code) => /^20\d\d0[1-3]$/.test(code))).toBe(true);
    expect(resolved.terms.filter((t) => t.isActive).map((t) => t.code)).toEqual(["202601"]);
    expect(resolved.terms.filter((t) => t.isRegistration).map((t) => t.code)).toEqual(["202602"]);
    expect(resolved.terms.find((t) => t.code === "202601")).toEqual({
      code: "202601",
      label: "Fall 2026",
      isActive: true,
      isRegistration: false,
      isSummer: false,
      published: false,
      startDate: "2026-08-24",
      endDate: "2026-12-15",
    });
    expect(resolved.terms.find((t) => t.code === "202603")?.isSummer).toBe(true);
  });

  it.each([
    ["2026-12-20T12:00:00-05:00", "202601", "202602"],
    ["2027-02-01T09:00:00-05:00", "202602", "202701"],
    ["2027-06-15T12:00:00-04:00", "202602", "202701"],
    ["2027-08-30T12:00:00-04:00", "202701", "202702"],
  ])("at %s: current %s, registration %s", async (at, current, registration) => {
    setNow(at);
    expect(await resolveTerms()).toMatchObject({ current, registration });
    resetCatalogState();
    setNow("2026-09-30T12:00:00-04:00");
    expect(await resolveTerms({ now: new Date(at) })).toMatchObject({ current, registration });
  });

  it("marks terms published once sections are ingested", async () => {
    await refreshTerm("202602");
    const { terms } = await resolveTerms();
    expect(terms.find((t) => t.code === "202602")?.published).toBe(true);
    expect(terms.find((t) => t.code === "202601")?.published).toBe(false);
  });

  it("caches the list in CatalogMeta for 6 h and refreshes it in the background after", async () => {
    const fetches = countTermsFetches();
    await resolveTerms();
    await resolveTerms();
    expect(fetches).toHaveBeenCalledTimes(1);
    const stored = await CatalogMeta.findOne({ key: TERMS_KEY }).lean();
    expect(Array.isArray(stored?.data)).toBe(true);

    // A new process (empty memo) serves the stored list without asking upstream.
    resetCatalogState();
    const second = countTermsFetches();
    setNow("2026-09-30T17:59:00-04:00");
    expect((await resolveTerms()).asOf).toBe("2026-09-30T16:00:00.000Z");
    expect(second).not.toHaveBeenCalled();

    // Older than 6 h: served stale, refreshed in the background.
    resetCatalogState();
    const third = countTermsFetches();
    setNow("2026-09-30T18:30:00-04:00");
    expect((await resolveTerms()).asOf).toBe("2026-09-30T16:00:00.000Z");
    await drainBackground();
    expect(third).toHaveBeenCalledTimes(1);
    const refreshed = await CatalogMeta.findOne({ key: TERMS_KEY }).lean();
    expect(refreshed?.lastSuccessAt?.toISOString()).toBe("2026-09-30T22:30:00.000Z");
  });

  it("keeps serving the last good list when upstream fails", async () => {
    await resolveTerms();
    resetCatalogState();
    setNow("2026-10-01T12:00:00-04:00");
    const failing = failTermsFetches();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const resolved = await resolveTerms();
    await drainBackground();
    expect(failing).toHaveBeenCalledTimes(1);
    expect(resolved).toMatchObject({ current: "202601", registration: "202602" });
    expect(resolved.asOf).toBe("2026-09-30T16:00:00.000Z");
    expect(resolved.terms.find((t) => t.code === "202601")?.startDate).toBe("2026-08-24");
    const stored = await CatalogMeta.findOne({ key: TERMS_KEY }).lean();
    expect(stored?.lastError).toContain("Upstream answered 503");
    expect(log).toHaveBeenCalled();
  });

  it("falls back to the date rules when no list was ever fetched, without retrying at once", async () => {
    const failing = failTermsFetches();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const resolved = ResolvedTermsSchema.parse(await resolveTerms());
    expect(resolved).toMatchObject({ current: "202601", registration: "202602", asOf: null });
    expect(resolved.terms.map((t) => t.code)).toEqual([
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
      "202603",
      "202701",
    ]);
    expect(resolved.terms.every((t) => t.startDate === undefined)).toBe(true);
    resetCatalogState();
    setTermsFetchForTests(failing);
    await resolveTerms();
    expect(failing).toHaveBeenCalledTimes(1);
  });
});
