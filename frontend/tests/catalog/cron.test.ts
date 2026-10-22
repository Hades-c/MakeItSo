import { describe, expect, it, vi } from "vitest";
import { setNow, upstreamDown, withCatalogDb } from "./db";
import { getCourseHistory } from "@/server/catalog";
import { drainBackground } from "@/server/catalog/background";
import { runCatalogCron } from "@/server/catalog/cron";
import { setIngestDepsForTests } from "@/server/catalog/refresh";
import { fetchSectionsPage, type FetchSectionsPage } from "@/server/catalog/upstream";

withCatalogDb();

/** Upstream that fails for some terms and serves the fixtures for the rest; counts requests per term. */
function upstreamFailingFor(...failing: string[]) {
  const calls = new Map<string, number>();
  const fetchPage: FetchSectionsPage = async (term, offset, options) => {
    calls.set(term, (calls.get(term) ?? 0) + 1);
    if (failing.includes(term)) throw upstreamDown();
    return fetchSectionsPage(term, offset, options);
  };
  setIngestDepsForTests({ fetchPage });
  return calls;
}

describe("runCatalogCron", () => {
  it("refreshes past terms nightly and hot terms when stale", async () => {
    await runCatalogCron();
    setNow("2026-10-01T06:00:00-04:00"); // 18 h later: only the hot terms are due
    const morning = await runCatalogCron();
    const status = (term: string) => morning.terms.find((t) => t.term === term)?.status;
    expect(status("202501")).toBe("fresh");
    expect(status("202601")).toBe("unchanged");
    expect(status("202602")).toBe("unchanged");
    setNow("2026-10-01T09:00:00-04:00"); // 21 h after the first run: past terms too
    const next = await runCatalogCron();
    expect(next.terms.find((t) => t.term === "202201")?.status).toBe("unchanged");
  });

  it("reports failures, and stops starting terms when out of time", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    upstreamFailingFor("202301");
    const failed = await runCatalogCron();
    expect(failed.ok).toBe(false);
    expect(failed.terms.find((t) => t.term === "202301")).toMatchObject({
      status: "failed",
      error: expect.stringContaining("Upstream answered 503"),
    });
    const again = await runCatalogCron();
    expect(again.terms.find((t) => t.term === "202301")?.status).toBe("waiting");
    expect(again.terms.find((t) => t.term === "202302")?.status).toBe("fresh");
    setNow("2026-09-30T12:06:00-04:00");
    const skipped = await runCatalogCron({ budgetMs: -1 });
    expect(skipped.terms.find((t) => t.term === "202301")?.status).toBe("skipped");
    expect(skipped.terms.find((t) => t.term === "202302")?.status).toBe("fresh");
  });
});

describe("history backfill", () => {
  it("does not retry a failing term on every read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const calls = upstreamFailingFor("202201");
    await getCourseHistory("CSC 221");
    await drainBackground();
    await getCourseHistory("CSC 221");
    await drainBackground();
    expect(calls.get("202201")).toBe(1);
    expect(calls.get("202202")).toBe(1);
    const history = await getCourseHistory("CSC 221");
    expect(history.map((a) => a.termCode)).not.toContain("202201");
    expect(history.find((a) => a.termCode === "202202")).toMatchObject({ status: "offered" });
  });
});
