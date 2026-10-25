import mongoose from "mongoose";
import { expect, test } from "@playwright/test";
import {
  expectAllTagged,
  horizontalOverflow,
  isMobile,
  newSignedInAccount,
  registerViaApi,
  seriousViolations,
  signIn,
  smallTapTargets,
  uniqueEmail,
} from "./helpers";

/**
 * Professor ratings (W2) in the production build: the routes are wired, signed-in only, validated, never cached,
 * and never reach RateMyProfessors (the e2e server blocks outbound fetches; the roster job needs CRON_SECRET,
 * which the e2e server does not set). The course page test writes one synthetic roster row with its tag counts
 * straight to the database, as the daily cron would store it.
 */

/**
 * The synthetic roster's Arianna Smith (tests/fixtures/external/ratemyprofessors, legacyId 9000004) with the tag
 * counts the cron stores from tags-davidson.json; she teaches BIO 115 C and D in the Spring 2027 fixtures. Upserted,
 * never deleted: the desktop and mobile runs share it (two rows for one name would be ambiguous), and no other
 * spec opens BIO 115.
 */
const ARIANNA = {
  rmpId: "VGVhY2hlci05MDAwMDA0",
  legacyId: 9000004,
  firstName: "Arianna",
  lastName: "Smith",
  normalizedFirst: "arianna",
  normalizedLast: "smith",
  nameTokens: ["arianna", "smith"],
  department: "Biology",
  schoolId: "U2Nob29sLTM5NjU=",
  avgRating: 4.1,
  avgDifficulty: 2.4,
  numRatings: 8,
  wouldTakeAgainPct: 13.5,
  fetchedAt: new Date("2026-09-30T16:00:00Z"),
  topTags: [
    { tag: "Extra credit", count: 4 },
    { tag: "Get ready to read", count: 3 },
    { tag: "Beware of pop quizzes", count: 2 },
    { tag: "Amazing lectures", count: 1 },
    { tag: "Clear grading criteria", count: 1 },
  ],
  tagRatingsCounted: 8,
  tagsNumRatings: 8,
  // The daily tag count ran a day before this roster row was fetched: the tags line says its own date.
  tagsFetchedAt: new Date("2026-09-29T16:05:00Z"),
};

/**
 * A second BIO 115 instructor (sections E and F) with two ratings: the rating and its count show, but not the
 * difficulty, "would take again" or the tags, which need three ratings. Not in the synthetic roster.
 */
const BRYAN = {
  ...ARIANNA,
  rmpId: "VGVhY2hlci05MTAwMDAy",
  legacyId: 9100002,
  firstName: "Bryan",
  lastName: "Thurtle-Schmidt",
  normalizedFirst: "bryan",
  normalizedLast: "thurtle schmidt",
  nameTokens: ["bryan", "thurtle", "schmidt", "thurtleschmidt"],
  avgRating: 1.2,
  avgDifficulty: 1,
  numRatings: 2,
  wouldTakeAgainPct: 0,
  topTags: [{ tag: "Caring", count: 2 }],
  tagRatingsCounted: 2,
  tagsNumRatings: 2,
};

test("the course page shows a matched rating's difficulty, would-take-again and most common tags", async ({
  page,
  request,
}) => {
  const uri = process.env.E2E_MONGODB_URI;
  test.skip(!uri, "needs E2E_MONGODB_URI: the roster row is written to the database");
  const conn = await mongoose.createConnection(uri!).asPromise();
  try {
    for (const row of [ARIANNA, BRYAN]) {
      await conn
        .collection("rmpteachers")
        .updateOne({ legacyId: row.legacyId }, { $set: row }, { upsert: true });
    }
  } finally {
    await conn.close();
  }

  await newSignedInAccount(page, request, "e2e-ratings-course");
  const res = await page.goto("/courses/202602/BIO-115");
  expect(res?.status()).toBe(200);
  const sections = page.getByRole("region", { name: /Sections/ });

  // Each of her section rows: the short form, rating and difficulty.
  for (const name of [/^Section C,/, /^Section D,/]) {
    const row = sections
      .getByRole("article", { name })
      .locator('[data-aggregated="ratemyprofessors"]');
    await expect(row).toContainText("4.1");
    await expect(row).toContainText("8 ratings");
    await expect(row).toContainText("Difficulty 2.4 of 5");
    await expect(row).not.toContainText(/would take again|Most common tags/);
    await expect(
      row.getByRole("link", { name: /Arianna Smith on RateMyProfessors/ }),
    ).toHaveAttribute("href", "https://www.ratemyprofessors.com/professor/9000004");
  }
  // Unmatched instructors get nothing.
  await expect(
    sections
      .getByRole("article", { name: /^Section A,/ })
      .locator('[data-aggregated="ratemyprofessors"]'),
  ).toHaveCount(0);

  // Two ratings: the rating and its count, nothing more (the details need three ratings).
  for (const name of [/^Section E,/, /^Section F,/]) {
    const row = sections
      .getByRole("article", { name })
      .locator('[data-aggregated="ratemyprofessors"]');
    await expect(row).toContainText("1.2");
    await expect(row).toContainText("2 ratings");
    await expect(row).not.toContainText("Difficulty");
  }

  // The details once per instructor, under the sections.
  const instructors = sections.getByRole("list", { name: "Instructors on RateMyProfessors" });
  await expect(instructors.getByRole("listitem")).toHaveCount(2);
  const arianna = instructors.getByRole("listitem").filter({ hasText: "Arianna Smith" });
  await expect(arianna.getByText("Arianna Smith", { exact: true })).toBeVisible();
  await expect(arianna).toContainText("8 ratings");
  await expect(arianna).toContainText("Difficulty 2.4 of 5");
  await expect(arianna).toContainText("14% would take again");
  // The tags' own freshness: how many ratings they were counted from, and when (not the roster's date).
  await expect(arianna.getByTestId("rating-tags")).toContainText(
    "Most common tags (from 8 ratings, as of Sep 29): Extra credit (4)",
  );
  await expect(arianna.getByTestId("rating-tags")).toHaveText(/ via RateMyProfessors$/);
  await expect(arianna.getByTestId("rating-tags")).toContainText("Get ready to read (3)");
  await expect(arianna.getByTestId("rating-tags")).toContainText("Beware of pop quizzes (2)");
  await expect(arianna.getByTestId("rating-tags")).not.toContainText("Amazing lectures");
  await expect(arianna.getByText("as of Sep 30, 2026")).toBeVisible();
  await expect(arianna.getByRole("link", { name: /Arianna Smith’s page/ })).toHaveAttribute(
    "href",
    "https://www.ratemyprofessors.com/professor/9000004",
  );
  const bryan = instructors.getByRole("listitem").filter({ hasText: "Bryan Thurtle-Schmidt" });
  await expect(bryan).toContainText("2 ratings");
  await expect(bryan).not.toContainText(/Difficulty|would take again|Most common tags/);
  await expect(bryan.getByRole("link", { name: /Bryan Thurtle-Schmidt’s page/ })).toHaveAttribute(
    "href",
    "https://www.ratemyprofessors.com/professor/9100002",
  );
  await expect(sections).toContainText(
    "ratings only where a RateMyProfessors profile matches the instructor’s full name.",
  );

  expect(await expectAllTagged(page)).toBeGreaterThan(0);
  expect(await seriousViolations(page, "#sections")).toEqual([]);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  if (isMobile(page)) expect(await smallTapTargets(page), "tap targets under 44px").toEqual([]);
});

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
