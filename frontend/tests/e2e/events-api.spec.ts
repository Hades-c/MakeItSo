import { expect, test } from "@playwright/test";
import { registerViaApi, signIn, uniqueEmail } from "./helpers";

interface EventsBody {
  items: { title: string; kind: string; source: string; url: string }[];
  sources: { id: string; lastSync: string | null }[];
}

test("campus feeds: served from the fixtures and refreshed in the background after a read", async ({
  page,
  request,
}) => {
  const email = uniqueEmail("e2e-feeds");
  const password = "e2e password 123";
  await registerViaApi(request, { name: "Feed Reader", email, password });
  await signIn(page, email, password);

  // Nothing may be stored yet: the read answers at once and after() syncs the stale sources afterwards.
  await expect
    .poll(
      async () => {
        const res = await page.request.get("/api/events");
        expect(res.status()).toBe(200);
        expect(res.headers()["cache-control"]).toBe("private, no-store");
        return ((await res.json()) as EventsBody).items.length;
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThan(20);

  const all = (await (await page.request.get("/api/events?limit=500")).json()) as EventsBody;
  expect(new Set(all.items.map((i) => i.source))).toEqual(
    new Set(["wildcatsync", "hurt-hub", "library", "events-digest"]),
  );
  expect(all.items.every((i) => i.url.startsWith("https://"))).toBe(true);
  expect(all.sources.find((s) => s.id === "wildcatsync")?.lastSync).toBe(
    "2026-09-30T16:00:00.000Z",
  );

  const deadlines = (await (
    await page.request.get("/api/events?kinds=deadline")
  ).json()) as EventsBody;
  expect(deadlines.items.map((i) => i.title)).toEqual([
    "Watson Fellowship Nomination Application Deadline: 9/30/2026",
  ]);

  const hours = await page.request.get("/api/events/library-hours");
  expect(hours.status()).toBe(200);
  const { hours: body } = (await hours.json()) as { hours: { date: string; locations: unknown[] } };
  expect(body.date).toBe("2026-09-30");
  expect(body.locations).toHaveLength(11);
});

test("feeds API gating: signed-out reads are 401, cron is 503 without CRON_SECRET", async ({
  request,
}) => {
  expect((await request.get("/api/events")).status()).toBe(401);
  expect((await request.get("/api/events/library-hours")).status()).toBe(401);
  expect((await request.get("/api/cron/feeds")).status()).toBe(503);
});
