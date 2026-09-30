import { expect, test } from "@playwright/test";

/**
 * Academic programs API (W1b) on the production build: the checked-in snapshot is bundled (no sync has run in
 * the e2e database), program pages load from the recorded Acalog fixtures, and the routes answer with the right
 * status and cache headers. The API does not depend on the viewport, so it runs in the desktop project only.
 */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "API checks run once");
});

test("GET /api/programs lists the official majors from the snapshot, CDN-cacheable", async ({
  request,
}) => {
  const res = await request.get("/api/programs?kind=major");
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"]).toBe("public, s-maxage=900, stale-while-revalidate=3600");
  const body = (await res.json()) as {
    catalogYear: string;
    programs: { name: string; offerings: { kind: string; name: string }[] }[];
  };
  expect(body.catalogYear).toBe("2026-2027");
  const names = body.programs.flatMap((p) => p.offerings.map((o) => o.name));
  expect(names).toContain("Major in Computer Science (B.S. Degree)");
  expect(names).toContain("Major in Classical Studies (A.B. Degree)");
  expect(body.programs.flatMap((p) => p.offerings).every((o) => o.kind === "major")).toBe(true);
});

test("GET /api/programs/172 serves the Computer Science page with requirement text", async ({
  request,
}) => {
  const res = await request.get("/api/programs/172");
  expect(res.status()).toBe(200);
  const { program } = (await res.json()) as {
    program: { name: string; url: string; offerings: { name: string; requirementsText: string }[] };
  };
  expect(program.name).toBe("Computer Science");
  expect(program.url).toBe("https://catalog.davidson.edu/preview_program.php?catoid=28&poid=1799");
  expect(program.offerings[0]?.name).toBe("Major in Computer Science (B.S. Degree)");
  expect(program.offerings[0]?.requirementsText).toContain("Major Prerequisites:");
});

test("unknown programs are 404, id variants 400, and the cron route needs its secret", async ({
  request,
}) => {
  const missing = await request.get("/api/programs/999999");
  expect(missing.status()).toBe(404);
  expect(missing.headers()["cache-control"]).toBe("private, no-store");
  const variant = await request.get("/api/programs/0172");
  expect(variant.status()).toBe(400);
  expect(variant.headers()["cache-control"]).toBe("private, no-store");
  const cron = await request.get("/api/cron/programs");
  expect([401, 503]).toContain(cron.status());
});
