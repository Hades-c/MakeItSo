import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UNVERIFIED_MESSAGE } from "@/lib/api/account";
import type { SessionUser } from "@/server/auth/session";
import { VERIFICATION_UNAVAILABLE_MESSAGE } from "@/server/auth/verification";
import { ALUMNI, alumniForCareer } from "@/server/content/alumni";
import { CAREERS, getCareer } from "@/server/content/careers";
import { FIXTURE_TERMS } from "../helpers/terms";

/**
 * The streamed server sections of the careers and alumni pages, rendered for real with their data loaders
 * replaced: the alumni gate for verified / unverified / legacy accounts, the course list and the programs.
 */

const state = vi.hoisted(() => ({
  user: null as SessionUser | null,
  mail: true,
  terms: { current: "202601", registration: "202602", next: "202701" } as unknown,
  histories: new Map<string, unknown>(),
  presence: null as unknown,
  programs: [] as unknown[],
  planCalls: [] as string[],
}));

vi.mock("@/server/auth/session", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getSessionUser: async () => state.user,
}));
vi.mock("@/server/auth/mailer", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isMailAvailable: () => state.mail,
}));
vi.mock("@/app/(hub)/careers/_lib/catalog", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadCareerTerms: async () => state.terms,
  loadCourseHistories: async (codes: string[]) =>
    new Map(codes.map((code) => [code, state.histories.get(code) ?? null])),
}));
vi.mock("@/app/(hub)/careers/_lib/plan", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadPlanPresence: async (userId: string) => {
    state.planCalls.push(userId);
    return state.presence;
  },
}));
vi.mock("@/app/(hub)/careers/_lib/programs", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadRelatedPrograms: async () => state.programs,
}));

const { AlumniDirectory } = await import("@/app/(hub)/alumni/_components/alumni-directory");
const { CareerAlumni } = await import("@/app/(hub)/careers/_components/career-alumni");
const { CareerCourses } = await import("@/app/(hub)/careers/_components/career-courses");
const { CareerPrograms } = await import("@/app/(hub)/careers/_components/career-programs");

const ID = "0123456789abcdef01234567";
const VERIFIED: SessionUser = {
  id: ID,
  email: "sam@davidson.edu",
  name: "Sam",
  emailVerifiedAt: "2026-09-01T00:00:00.000Z",
};
const UNVERIFIED: SessionUser = { ...VERIFIED, emailVerifiedAt: null };
const LEGACY: SessionUser = { ...VERIFIED, email: "sam.old@gmail.com" };

beforeEach(() => {
  state.user = VERIFIED;
  state.mail = true;
  state.terms = { current: "202601", registration: "202602", next: "202701" };
  state.histories.clear();
  state.presence = null;
  state.programs = [];
  state.planCalls = [];
});

async function renderAsync(element: Promise<React.ReactNode>) {
  const tree = await element;
  return render(<>{tree}</>);
}

/** No alumni data at all in the page: no names, no LinkedIn links. */
function expectNoAlumniData() {
  const text = document.body.textContent ?? "";
  for (const alumnus of ALUMNI) expect(text).not.toContain(alumnus.name);
  expect(document.querySelector('a[href*="linkedin.com"]')).toBeNull();
  expect(document.querySelector("[data-alumnus]")).toBeNull();
}

describe("AlumniDirectory (verified @davidson.edu only)", () => {
  it("shows every verified alumnus to a verified account, notable alumni apart", async () => {
    await renderAsync(AlumniDirectory({ params: {} }));
    expect(screen.getByTestId("alumni-provenance")).toHaveTextContent(
      /Compiled from public sources · checked .* · Request removal\/correction/,
    );
    expect(screen.getByRole("link", { name: "Request removal/correction" })).toHaveAttribute(
      "href",
      "/privacy#alumni",
    );
    expect(screen.getByTestId("alumni-count")).toHaveTextContent(
      `${ALUMNI.length} verified alumni`,
    );
    expect(document.querySelectorAll("[data-alumnus]")).toHaveLength(ALUMNI.length);

    const notable = screen.getByTestId("notable-alumni");
    const notableCards = within(notable).getAllByRole("article");
    expect(notableCards).toHaveLength(ALUMNI.filter((a) => !a.contactable).length);
    expect(notableCards.length).toBeGreaterThan(0);
    for (const card of notableCards) {
      expect(card).toHaveAttribute("data-contactable", "false");
      expect(card.querySelector("[data-contact]")).toBeNull();
    }
    for (const card of document.querySelectorAll('[data-contactable="true"]')) {
      expect(notable.contains(card)).toBe(false);
      expect(card.querySelector("[data-contact]")).not.toBeNull();
    }
  });

  it("applies the URL filters", async () => {
    await renderAsync(AlumniDirectory({ params: { career: "medicine" } }));
    const shown = [...document.querySelectorAll("[data-alumnus]")].map((el) => el.id);
    expect(shown.sort()).toEqual(
      alumniForCareer("medicine")
        .map((a) => a.id)
        .sort(),
    );
    expect(screen.getByTestId("alumni-count")).toHaveTextContent(
      `Showing ${shown.length} of ${ALUMNI.length} verified alumni`,
    );
    expect(screen.getByLabelText("Career path")).toHaveValue("medicine");
  });

  it("has an empty state for filters nobody matches", async () => {
    await renderAsync(AlumniDirectory({ params: { q: "zzzz nobody" } }));
    expect(screen.getByRole("heading", { name: "No alumni match these filters" })).toBeVisible();
    expect(screen.getAllByRole("link", { name: "Clear filters" })[0]).toHaveAttribute(
      "href",
      "/alumni",
    );
  });

  it("asks an unverified @davidson.edu account to verify, and shows no alumni data", async () => {
    state.user = UNVERIFIED;
    await renderAsync(AlumniDirectory({ params: { career: "law" } }));
    expect(screen.getByTestId("alumni-gate")).toBeVisible();
    expect(screen.getByRole("link", { name: "Verify your email" })).toHaveAttribute(
      "href",
      "/verify?reason=davidson&next=%2Falumni%3Fcareer%3Dlaw",
    );
    expectNoAlumniData();
    expect(screen.queryByTestId("alumni-provenance")).toBeNull();
  });

  it("says verification is not available yet when there is no mail provider", async () => {
    state.user = UNVERIFIED;
    state.mail = false;
    await renderAsync(AlumniDirectory({ params: {} }));
    expect(screen.getByText(VERIFICATION_UNAVAILABLE_MESSAGE)).toBeVisible();
    expect(screen.queryByRole("link", { name: "Verify your email" })).toBeNull();
    expectNoAlumniData();
  });

  it("gives a legacy non-Davidson account the owner's message, even with a verified mailbox", async () => {
    state.user = LEGACY;
    await renderAsync(AlumniDirectory({ params: {} }));
    expect(screen.getByText(UNVERIFIED_MESSAGE)).toBeVisible();
    expect(screen.queryByRole("link", { name: "Verify your email" })).toBeNull();
    expectNoAlumniData();
  });

  it("shows nothing when the session is gone or the section is switched off", async () => {
    state.user = null;
    await renderAsync(AlumniDirectory({ params: {} }));
    expectNoAlumniData();
    document.body.innerHTML = "";
    state.user = VERIFIED;
    vi.stubEnv("FEATURE_ALUMNI", "false");
    await expect(AlumniDirectory({ params: {} })).resolves.toBeNull();
  });
});

describe("CareerAlumni (on a career page)", () => {
  const career = getCareer("medicine")!;

  it("lists this path's verified alumni with the provenance line and a link to the directory", async () => {
    await renderAsync(CareerAlumni({ career }));
    const section = screen.getByRole("region", { name: /Alumni on this path/ });
    const ids = [...section.querySelectorAll("[data-alumnus]")].map((el) => el.id);
    expect(ids).toEqual(alumniForCareer("medicine").map((a) => a.id));
    expect(within(section).getByTestId("alumni-provenance")).toBeVisible();
    expect(within(section).getByRole("link", { name: "All alumni" })).toHaveAttribute(
      "href",
      "/alumni?career=medicine",
    );
    // Other paths are named, this one is not repeated.
    expect(section).not.toHaveTextContent(/Also on: Medicine/);
  });

  it("says so for a path without alumni", async () => {
    const empty = CAREERS.find((c) => alumniForCareer(c.slug).length === 0);
    expect(empty).toBeDefined();
    await renderAsync(CareerAlumni({ career: empty! }));
    expect(screen.getByTestId("career-alumni-empty")).toBeVisible();
  });

  it("explains instead of showing alumni to unverified and legacy accounts", async () => {
    state.user = UNVERIFIED;
    const { unmount } = await renderAsync(CareerAlumni({ career }));
    expect(screen.getByTestId("alumni-gate")).toBeVisible();
    expect(screen.getByRole("link", { name: "Verify your email" })).toHaveAttribute(
      "href",
      "/verify?reason=davidson&next=%2Fcareers%2Fmedicine",
    );
    expectNoAlumniData();
    unmount();

    state.user = LEGACY;
    await renderAsync(CareerAlumni({ career }));
    expect(screen.getByText(UNVERIFIED_MESSAGE)).toBeVisible();
    expectNoAlumniData();
  });

  it("renders nothing about alumni (not even a link) while the Alumni section is off", async () => {
    vi.stubEnv("FEATURE_ALUMNI", "false");
    await expect(CareerAlumni({ career })).resolves.toBeNull();
    state.user = LEGACY;
    await expect(CareerAlumni({ career })).resolves.toBeNull();
  });
});

describe("CareerCourses", () => {
  const career = getCareer("software-engineering")!;

  it("lists every course with its live availability, and starts added where the plan has it", async () => {
    for (const course of career.courses) {
      state.histories.set(course.code, [
        { termCode: "202601", status: "offered", sectionCount: 1 },
        { termCode: "202602", status: "offered", sectionCount: 2 },
        { termCode: "202701", status: "not-yet-published" },
      ]);
    }
    state.presence = new Map([
      ["CSC 221", new Map([["202602", "planned"]])],
      ["CSC 121", new Map([["202501", "completed"]])],
    ]);
    await renderAsync(CareerCourses({ career }));
    const items = screen.getByTestId("career-courses").querySelectorAll(":scope > li");
    expect(items).toHaveLength(career.courses.length);
    const csc221 = [...items].find((item) => item.getAttribute("data-course") === "CSC 221")!;
    expect(
      within(csc221 as HTMLElement).getByRole("button", { name: "In your plan for Spring 2027" }),
    ).toBeVisible();
    // A completed course says so and offers no Add.
    const csc121 = [...items].find((item) => item.getAttribute("data-course") === "CSC 121")!;
    expect(within(csc121 as HTMLElement).getByTestId("course-plan-status")).toHaveTextContent(
      "Completed Fall 2025",
    );
    expect(within(csc121 as HTMLElement).queryByRole("button")).toBeNull();
    expect(state.planCalls).toEqual([ID]);
  });

  it("judges the plan's statuses by the terms' own dates and the server's now", async () => {
    // Dec 20: Fall 2026 ended on Dec 15, though it stays the current term until Spring 2027 starts.
    vi.stubEnv("FIXTURES_NOW", "2026-12-20T12:00:00-05:00");
    state.terms = {
      current: "202601",
      registration: "202602",
      next: "202701",
      schedule: FIXTURE_TERMS,
    };
    state.presence = new Map([
      ["CSC 121", new Map([["202601", "completed"]])],
      ["CSC 221", new Map([["202601", "in-progress"]])],
    ]);
    await renderAsync(CareerCourses({ career }));
    const items = [...screen.getByTestId("career-courses").querySelectorAll(":scope > li")];
    const status = (code: string) =>
      within(
        items.find((item) => item.getAttribute("data-course") === code) as HTMLElement,
      ).getByTestId("course-plan-status");
    expect(status("CSC 121")).toHaveTextContent("Completed Fall 2026");
    expect(status("CSC 121")).not.toHaveAttribute("data-warning");
    expect(status("CSC 221")).toHaveTextContent(
      "In your Fall 2026 plan · marked In progress, check your plan",
    );
  });

  it("never reads a plan without a session, and lists courses without availability when it is unknown", async () => {
    state.user = null;
    state.terms = null;
    await renderAsync(CareerCourses({ career }));
    expect(state.planCalls).toEqual([]);
    expect(screen.getAllByTestId("availability-unknown")).toHaveLength(career.courses.length);
    expect(screen.queryByRole("radio")).toBeNull();
  });
});

describe("CareerPrograms", () => {
  it("renders the loaded programs next to the departments", async () => {
    state.programs = [
      {
        acalogId: 172,
        name: "Major in Computer Science (B.S. Degree)",
        kind: "major",
        url: "https://catalog.davidson.edu/preview_program.php?catoid=28&poid=1799",
        official: true,
      },
    ];
    await renderAsync(CareerPrograms({ career: getCareer("software-engineering")! }));
    expect(
      screen.getByRole("link", { name: "Major in Computer Science (B.S. Degree)" }),
    ).toBeVisible();
    expect(screen.getByText(/2026–2027 Davidson catalog/)).toBeVisible();
  });
});
