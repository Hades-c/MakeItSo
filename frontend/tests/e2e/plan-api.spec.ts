import { expect, test } from "@playwright/test";
import { registerViaApi, SAME_ORIGIN, signIn, uniqueEmail } from "./helpers";

/**
 * W5s: the plan API against the production server (fixtures catalog, in-memory database, pinned 2026-09-30).
 * A new (unverified) account may plan: add Spring 2027 courses from the catalog, keep a WebTree list with its
 * conflict check and copy text, read the unofficial progress and the day schedule. API-only, so it runs once
 * (desktop project); the page's own requests carry the session cookie.
 */

test.describe("plan API", () => {
  test.skip(({ isMobile }) => isMobile, "API checks run once, in the desktop project");

  test("a student plans Spring 2027 and builds a WebTree list", async ({ page }) => {
    const email = uniqueEmail("e2e-plan");
    const password = "a long e2e password for plans";
    await registerViaApi(page.request, { name: "Pat Planner", email, password });
    await signIn(page, email, password);
    const api = page.request;

    const empty = await api.get("/api/plan");
    expect(empty.status()).toBe(200);
    expect(empty.headers()["cache-control"]).toBe("private, no-store");
    expect(await empty.json()).toMatchObject({
      plan: { items: [], legacy: false, updatedAt: null },
    });

    const added = await api.post("/api/plan/items", {
      data: { termCode: "202602", courseCode: "csc221", crn: "20135" },
      headers: SAME_ORIGIN,
    });
    expect(added.status()).toBe(201);
    const { item } = (await added.json()) as {
      item: { id: string; title: string; reqCodes: string[] };
    };
    expect(item).toMatchObject({ title: "Data Structures", reqCodes: ["MQRQ"] });

    const duplicate = await api.post("/api/plan/items", {
      data: { termCode: "202602", courseCode: "CSC 221" },
      headers: SAME_ORIGIN,
    });
    expect(duplicate.status()).toBe(409);

    const crossSite = await api.post("/api/plan/items", {
      data: { termCode: "202602", courseCode: "MAT 150" },
      headers: { origin: "https://evil.example" },
    });
    expect(crossSite.status()).toBe(403);

    const webtree = await api.put("/api/plan/webtree", {
      data: {
        termCode: "202602",
        choices: [
          { rank: 1, crn: "20135", courseCode: "CSC 221", alternates: ["20136"] },
          { rank: 2, crn: "20478", courseCode: "SPA 201", alternates: [] },
        ],
      },
      headers: SAME_ORIGIN,
    });
    expect(webtree.status()).toBe(200);
    const report = (await webtree.json()) as {
      conflicts: { day: string }[];
      copyText: string;
      deadlines: { id: string }[];
    };
    expect(report.conflicts.map((c) => c.day)).toEqual(["M", "W", "F"]);
    expect(report.copyText).toContain("1. CRN 20135  CSC 221 A  Data Structures");
    expect(report.deadlines[0]?.id).toBe("calendar:f26-webtree-spring27");

    const progress = await api.get("/api/plan/progress");
    expect(await progress.json()).toMatchObject({
      progress: {
        required: 32,
        reqs: { MQRQ: "planned" },
        disclaimer: "Unofficial — verify in Degree Works",
      },
    });

    const schedule = await api.get("/api/plan/schedule?date=2026-09-30");
    expect(await schedule.json()).toMatchObject({
      schedule: { date: "2026-09-30", empty: "no-sections" },
    });

    const removed = await api.delete(`/api/plan/items/${item.id}`, { headers: SAME_ORIGIN });
    expect(removed.status()).toBe(204);
  });

  test("signed-out requests are refused and never cached", async ({ request }) => {
    const res = await request.get("/api/plan");
    expect(res.status()).toBe(401);
    expect(res.headers()["cache-control"]).toBe("private, no-store");
  });
});
