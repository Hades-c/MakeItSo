import { expect, test } from "@playwright/test";
import { registerViaApi, signIn, uniqueEmail } from "./helpers";

/**
 * Professor ratings (W2) in the production build: the routes are wired, signed-in only, validated, never cached,
 * and never reach RateMyProfessors (the e2e server blocks outbound fetches; the roster job needs CRON_SECRET,
 * which the e2e server does not set). The ratings UI itself is tested with the course page (W8).
 */

test("the ratings route is signed-in only, validated and private", async ({ page, request }) => {
  const signedOut = await request.get("/api/ratings?term=202602&code=CHE%20250");
  expect(signedOut.status()).toBe(401);
  expect(signedOut.headers()["cache-control"]).toBe("private, no-store");

  const email = uniqueEmail("e2e-ratings");
  await registerViaApi(request, { name: "Rae Ratings", email, password: "ratings e2e password" });
  await signIn(page, email, "ratings e2e password");

  const invalid = await page.request.get("/api/ratings?term=202602&code=not-a-course");
  expect(invalid.status()).toBe(400);
  expect(((await invalid.json()) as { error: { code: string } }).error.code).toBe(
    "validation_failed",
  );

  // The course comes from the catalog (W1): 501 while it is a stub; afterwards 200 (no roster synced in e2e, so
  // nobody is matched) or 404.
  const res = await page.request.get("/api/ratings?term=202602&code=CHE%20250");
  expect([200, 404, 501]).toContain(res.status());
  expect(res.headers()["cache-control"]).toBe("private, no-store");
  if (res.status() === 200) {
    const body = (await res.json()) as { enabled: boolean; ratings: { status: string }[] };
    expect(body.enabled).toBe(true);
    for (const rating of body.ratings) expect(["unmatched", "staff"]).toContain(rating.status);
  }
});

test("the roster cron answers 503 without CRON_SECRET and never runs for visitors", async ({
  request,
}) => {
  const res = await request.get("/api/cron/rmp", {
    headers: { authorization: "Bearer guess-guess-guess-guess" },
  });
  expect(res.status()).toBe(503);
  expect(res.headers()["cache-control"]).toBe("private, no-store");
});
