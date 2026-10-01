import mongoose from "mongoose";
import type { Session } from "next-auth";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { insertLegacyPlan, legacyDocs, planDoc, withPlanDb } from "../plan/helpers";
import { insertUser, sessionFor, stubAuthEnv } from "../w3/helpers";
import OnboardingPage, { metadata } from "@/app/onboarding/page";
import { loadOnboarding } from "@/app/onboarding/_lib/load";
import { classAction, classAddBody, findActiveItem } from "@/app/onboarding/_lib/plan-items";
import { resumeStep } from "@/app/onboarding/_lib/steps";
import { AddPlanItemBodySchema } from "@/lib/api/plan";
import { CAREERS } from "@/server/content/careers";
import { officialProgramNames } from "@/server/programs";
import { addItem, getPlan, updateItem } from "@/server/plan";
import { getProfile, updateProfile } from "@/server/auth";

/**
 * /onboarding against the real session, profile, programs, catalog and plan code (in-memory MongoDB with the
 * fixture catalog, fixtures mode, server now pinned to 2026-09-30): the loader's data, the page's redirects and
 * markup, and the re-run and legacy (v1 plan) cases through the same plan service the steps call.
 */

const auth = vi.hoisted(() => ({ session: null as Session | null }));
vi.mock("next-auth", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getServerSession: async () => auth.session,
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  connection: async () => undefined,
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

withPlanDb();

beforeEach(() => stubAuthEnv());
afterEach(() => {
  auth.session = null;
});

async function signIn(raw: Record<string, unknown> = {}, email = "casey@davidson.edu") {
  const user = await insertUser({
    name: "Casey Wildcat",
    email,
    raw: { emailVerifiedAt: null, sessionVersion: 0, ...raw },
  });
  auth.session = await sessionFor(user);
  return user;
}

async function render(step?: string): Promise<string> {
  const page = await OnboardingPage({
    searchParams: Promise.resolve(step === undefined ? {} : { step }),
  });
  return renderToStaticMarkup(createElement("div", null, page));
}

function v1Entry(patch: Record<string, unknown>) {
  return {
    _id: new mongoose.Types.ObjectId(),
    courseId: new mongoose.Types.ObjectId(),
    credits: 4,
    ...patch,
  };
}

describe("loadOnboarding", () => {
  it("reads the profile, official names, careers, terms and plan for a new student", async () => {
    const user = await signIn({ graduationYear: 2029 });
    const data = await loadOnboarding(user.id);
    expect(data.profile).toEqual({
      name: "Casey Wildcat",
      majors: [],
      minors: [],
      graduationYear: 2029,
      firstTerm: null,
      interests: [],
      onboardedAt: null,
    });
    expect(data.majors).toEqual(await officialProgramNames("major"));
    expect(data.majors).not.toContain("Undecided");
    expect(data.minors).toEqual([
      ...(await officialProgramNames("minor")),
      ...(await officialProgramNames("interdisciplinary-minor")),
    ]);
    expect(data.careers).toEqual(
      CAREERS.map(({ slug, name, cluster }) => ({ slug, name, cluster })),
    );
    expect(data.terms).toEqual({
      current: "202601",
      currentLabel: "Fall 2026",
      currentStatus: "in-progress",
      firstTerm: "202501",
      startsLater: false,
      completedTerms: ["202502", "202501"],
    });
    expect(data.items).toEqual([]);
    expect(data.legacyPlan).toBe(false);
    expect(data.progress).toEqual({
      about: false,
      classes: false,
      completed: false,
      interests: false,
    });
    expect(data.now).toBe("2026-09-30T16:00:00.000Z");
  });

  it("has nothing current or completed for an incoming student", async () => {
    const user = await signIn({ graduationYear: 2031 });
    const { terms } = await loadOnboarding(user.id);
    expect(terms).toMatchObject({ firstTerm: "202701", startsLater: true, completedTerms: [] });
  });

  it("uses the stored first term and counts saved steps", async () => {
    const user = await signIn({
      graduationYear: 2028,
      firstTerm: "202402",
      interests: ["law"],
    });
    const data = await loadOnboarding(user.id);
    expect(data.terms.completedTerms).toEqual(["202502", "202501", "202402"]);
    expect(data.progress).toEqual({
      about: true,
      classes: false,
      completed: false,
      interests: true,
    });
  });
});

describe("a legacy account with a v1 plan", () => {
  it("shows the converted v1 items, adds a CRN without duplicating, and never touches v1", async () => {
    const user = await signIn({ graduationYear: 2029, major: "Computer Science" }, "old@gmail.com");
    await insertLegacyPlan(user.id, {
      plannedCourses: [
        v1Entry({
          courseCode: "csc 121",
          courseName: "Intro",
          semester: "Fall",
          year: 2026,
          status: "planned",
        }),
        v1Entry({
          courseCode: "WRI 101",
          courseName: "Writing",
          semester: "Spring",
          year: 2026,
          status: "completed",
        }),
      ],
    });
    const before = await legacyDocs();

    const data = await loadOnboarding(user.id);
    expect(data.legacyPlan).toBe(true);
    expect(data.items.map((item) => [item.termCode, item.courseCode, item.status])).toEqual([
      ["202601", "CSC 121", "planned"],
      ["202502", "WRI 101", "completed"],
    ]);
    // Credits come from the catalog (1), never the hackathon's 4.
    expect(data.items.every((item) => item.credits === 1)).toBe(true);
    expect(data.progress).toMatchObject({ classes: true, completed: true });
    expect(resumeStep(data.progress, false)).toBe("interests");
    expect(await planDoc(user.id)).toBeNull();

    // Step 2 picks CSC 121 B: the course is already in the term, so only its CRN is set.
    const action = classAction(data.items, "202601", "CSC 121", [], "10142");
    expect(action.kind).toBe("set-crn");
    if (action.kind !== "set-crn") return;
    await updateItem(user.id, action.itemId, { crn: "10142" });

    const plan = await getPlan(user.id);
    expect(plan.legacy).toBe(false);
    expect(plan.items.map((item) => [item.termCode, item.courseCode, item.crn ?? null])).toEqual([
      ["202601", "CSC 121", "10142"],
      ["202502", "WRI 101", null],
    ]);
    expect(await legacyDocs()).toEqual(before);

    // A re-run sees the section as chosen; a stray add of the same course is refused (409).
    expect(classAction(plan.items, "202601", "CSC 121", [], "10142").kind).toBe("none");
    await expect(
      addItem(
        user.id,
        AddPlanItemBodySchema.parse(classAddBody("202601", "CSC 121", "10142", "in-progress")),
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect((await getPlan(user.id)).items).toHaveLength(2);
    // The legacy single major maps to the official name.
    expect((await getProfile(user.id)).majors).toEqual(["Major in Computer Science (B.S. Degree)"]);
  });
});

describe("re-running onboarding", () => {
  it("keeps the first onboardedAt and finds existing items instead of adding them twice", async () => {
    const user = await signIn({ graduationYear: 2029 });
    const first = await updateProfile(user.id, { interests: ["law"], onboarded: true });
    vi.stubEnv("FIXTURES_NOW", "2026-10-02T12:00:00-04:00");
    const again = await updateProfile(user.id, { onboarded: true });
    expect(again.onboardedAt).toBe(first.onboardedAt);

    await addItem(user.id, {
      termCode: "202502",
      courseCode: "WRI 101",
      status: "completed",
      source: "catalog",
      passFail: false,
    });
    const data = await loadOnboarding(user.id);
    expect(findActiveItem(data.items, "202502", "WRI 101")).toBeDefined();
    expect(resumeStep(data.progress, data.profile.onboardedAt !== null)).toBe("about");
  });
});

describe("OnboardingPage", () => {
  it("is titled and sends signed-out visitors to /login, back to the same step", async () => {
    expect(metadata).toEqual({ title: "Get started" });
    await expect(render("classes")).rejects.toMatchObject({
      digest: expect.stringMatching(
        /^NEXT_REDIRECT;replace;\/login\?callbackUrl=%2Fonboarding%3Fstep%3Dclasses;/,
      ),
    });
    await expect(render()).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT;replace;\/login\?callbackUrl=%2Fonboarding;/),
    });
  });

  it("resumes at the right step when the URL has none (or an unknown one)", async () => {
    await signIn({ graduationYear: 2029 });
    await expect(render()).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT;replace;\/onboarding\?step=about;/),
    });
    await expect(render("bogus")).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT;replace;\/onboarding\?step=about;/),
    });
  });

  it("resumes after the furthest saved step", async () => {
    await signIn({ graduationYear: 2029, firstTerm: "202501" });
    await expect(render()).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT;replace;\/onboarding\?step=classes;/),
    });
  });

  it("renders step 1 with the step list, Skip setup and the official names", async () => {
    await signIn({ graduationYear: 2029 });
    const html = await render("about");
    expect(html).toMatch(/<h1[^>]*>About you<\/h1>/);
    expect(html).toContain("Step 1 of 4");
    expect(html).toContain("Welcome, Casey");
    expect(html).toMatch(/<nav aria-label="Setup steps"/);
    expect(html).toMatch(/aria-current="step"[^>]*href="\/onboarding\?step=about"/);
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).toContain('href="/onboarding?step=classes"');
    expect(html).toContain("Your Fall 2026 classes");
    expect(html).toContain("Skip setup");
    expect(html).toContain('<option value="Undecided" selected="">Undecided</option>');
    expect(html).toContain("Major in Computer Science (B.S. Degree)");
    expect(html).toContain('<option value="202501" selected="">Fall 2025</option>');
  });

  it("renders each later step, and no Skip setup once onboarded", async () => {
    await signIn({ graduationYear: 2029, onboardedAt: new Date("2026-09-01T12:00:00Z") });
    const classes = await render("classes");
    expect(classes).toMatch(/<h1[^>]*>Your Fall 2026 classes<\/h1>/);
    expect(classes).toContain("Search Fall 2026 courses");
    expect(classes).not.toContain("Skip setup");
    const completed = await render("completed");
    expect(completed).toMatch(/<h1[^>]*>Courses you have taken<\/h1>/);
    expect(completed).toContain("Add AP, IB or transfer credit");
    expect(completed).toContain('<option value="202502" selected="">Spring 2026</option>');
    const interests = await render("interests");
    expect(interests).toMatch(/<h1[^>]*>Interests<\/h1>/);
    expect(interests).toContain("Software Engineering");
  });

  it("tells an incoming student there are no current classes yet", async () => {
    await signIn({ graduationYear: 2031 });
    const html = await render("classes");
    expect(html).toContain("You start at Davidson in Fall 2027");
    expect(html).not.toContain("Search Fall 2026 courses");
    const completed = await render("completed");
    expect(completed).toContain("This is your first semester");
  });

  it("explains a legacy plan on the plan steps", async () => {
    const user = await signIn({ graduationYear: 2029 });
    await insertLegacyPlan(user.id, {
      plannedCourses: [
        v1Entry({ courseCode: "CSC 121", semester: "Fall", year: 2026, status: "planned" }),
      ],
    });
    const html = await render("classes");
    expect(html).toContain("These include courses from your earlier MakeItSo plan");
    expect(html).toContain('data-code="CSC 121"');
    expect(html).toContain("No section chosen");
  });
});
