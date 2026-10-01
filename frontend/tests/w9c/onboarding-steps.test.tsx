import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AboutStep } from "@/app/onboarding/_components/about-step";
import { ClassesStep } from "@/app/onboarding/_components/classes-step";
import { CompletedStep } from "@/app/onboarding/_components/completed-step";
import { InterestsStep } from "@/app/onboarding/_components/interests-step";
import { SkipSetup } from "@/app/onboarding/_components/skip-setup";
import { StepList } from "@/app/onboarding/_components/step-list";
import type { CareerOption } from "@/app/onboarding/_lib/load";
import type { Profile } from "@/lib/api/profile";
import {
  CourseSchema,
  CourseSummarySchema,
  SectionSchema,
  type Course,
  type CourseSummary,
  type Section,
} from "@/lib/types/catalog";
import type { PlanItem } from "@/lib/types/plan";

/**
 * The onboarding steps in the browser (jsdom), against stubbed API answers: what each step sends, how it
 * avoids duplicates on a re-run, auto-select, 409 handling, validation and navigation.
 */

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

vi.setConfig({ testTimeout: 20_000 });

const NOW = "2026-09-30T16:00:00.000Z";
const MAJORS = ["Major in Computer Science (B.S. Degree)", "Major in History (A.B. Degree)"];
const MINORS = ["Minor in Music", "Minor in Data Science"];

type FetchCall = { url: string; method: string; body: unknown };
let calls: FetchCall[] = [];

/** Answer callApi's fetches in order with [status, body] pairs. */
function stubFetch(...answers: [number, unknown][]) {
  calls = [];
  const queue = [...answers];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({
        url,
        method: init.method ?? "GET",
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      });
      const [status, body] = queue.shift() ?? [500, {}];
      return new Response(status === 204 ? null : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

const PROFILE: Profile = {
  id: "0123456789abcdef01234567",
  name: "Casey Wildcat",
  email: "casey@davidson.edu",
  emailVerifiedAt: null,
  davidson: true,
  majors: [],
  minors: [],
  graduationYear: 2029,
  firstTerm: "202501",
  standingOverride: null,
  interests: [],
  aiConsentAt: null,
  adultAttestedAt: null,
  onboardedAt: null,
  createdAt: NOW,
};

let nextId = 0;
function planItem(patch: Partial<PlanItem> = {}): PlanItem {
  const code = patch.courseCode ?? "CSC 121";
  return {
    id: (++nextId).toString(16).padStart(24, "a"),
    termCode: "202601",
    courseCode: code,
    canonicalCode: code,
    title: "Programming & Problem Solving",
    credits: 1,
    status: "in-progress",
    passFail: false,
    source: "catalog",
    reqCodes: null,
    unverified: false,
    ...patch,
  };
}

function section(patch: Partial<Section> = {}): Section {
  return SectionSchema.parse({
    crn: "10141",
    termCode: "202601",
    courseCode: "CSC 121",
    subject: "CSC",
    number: "121",
    section: "A",
    title: "Programming & Problem Solving",
    credits: 1,
    instructors: [{ first: "Katy", last: "Williams", isStaff: false }],
    meetings: [{ days: ["M", "W", "F"], start: "09:30", end: "10:20", kind: "class", tba: false }],
    enrollment: { current: 20, max: 24, remaining: 4 },
    reqCodes: ["MQRQ"],
    prerequisitesText: null,
    descriptionText: "",
    notes: [],
    restrictions: {
      eligibleYears: null,
      untilFirstDay: false,
      permissionRequired: false,
      notIfCompMet: false,
    },
    crossListings: [],
    crossPostings: [],
    regFor: null,
    ...patch,
  });
}

function course(code: string, sections: Section[]): Course {
  return CourseSchema.parse({
    termCode: sections[0]?.termCode ?? "202601",
    code,
    title: sections[0]?.title ?? code,
    sections,
    credits: [1],
    reqCodes: [],
  });
}

function summary(code: string, sectionCount: number, termCode = "202601"): CourseSummary {
  return CourseSummarySchema.parse({
    termCode,
    code,
    title: code === "CSC 121" ? "Programming & Problem Solving" : `Title of ${code}`,
    credits: [1],
    reqCodes: [],
    sectionCount,
    openSeats: 4,
    instructorNames: ["Katy Williams"],
    crossListings: [],
    hasTba: false,
  });
}

function searchAnswer(items: CourseSummary[], term = "202601"): [number, unknown] {
  return [
    200,
    { term, items, total: items.length, page: 1, pageSize: 10, asOf: "2026-09-30T15:00:00.000Z" },
  ];
}

function itemAnswer(item: PlanItem, status = 201): [number, unknown] {
  return [status, { item, warnings: [] }];
}

async function search(text: string, label = /Search Fall 2026 courses/) {
  await userEvent.type(screen.getByLabelText(label), text);
  await userEvent.click(screen.getByRole("button", { name: "Search" }));
}

beforeEach(() => {
  router.push.mockReset();
  router.refresh.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("StepList", () => {
  it("links every step, marks the current one and the saved ones", () => {
    render(
      <StepList
        step="classes"
        currentTermLabel="Fall 2026"
        progress={{ about: true, classes: false, completed: false, interests: false }}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Setup steps" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/onboarding?step=about",
      "/onboarding?step=classes",
      "/onboarding?step=completed",
      "/onboarding?step=interests",
    ]);
    expect(links[1]).toHaveAttribute("aria-current", "step");
    expect(links[0]).not.toHaveAttribute("aria-current");
    expect(links[0]).toHaveTextContent("Step 1: About you (saved)");
    expect(links[1]).toHaveTextContent("Step 2: Your Fall 2026 classes");
  });
});

describe("AboutStep (step 1)", () => {
  function renderAbout(initial: Partial<Parameters<typeof AboutStep>[0]["initial"]> = {}) {
    return render(
      <AboutStep
        initial={{ graduationYear: 2030, firstTerm: null, majors: [], minors: [], ...initial }}
        majorNames={MAJORS}
        minorNames={MINORS}
        now={NOW}
      />,
    );
  }

  it("defaults to Undecided and Fall of graduationYear − 4, which follows the year", async () => {
    renderAbout();
    expect(screen.getByLabelText("Major")).toHaveValue("Undecided");
    expect(screen.getByLabelText("First term at Davidson")).toHaveValue("202601");
    await userEvent.selectOptions(screen.getByLabelText("Graduation year"), "2029");
    expect(screen.getByLabelText("First term at Davidson")).toHaveValue("202501");
    // Undecided is the only choice: no second major until a real one is picked.
    expect(screen.queryByRole("button", { name: "Add another major" })).toBeNull();
  });

  it("keeps a first term the student picked when the year changes and it still fits", async () => {
    renderAbout();
    await userEvent.selectOptions(screen.getByLabelText("First term at Davidson"), "202602");
    await userEvent.selectOptions(screen.getByLabelText("Graduation year"), "2029");
    expect(screen.getByLabelText("First term at Davidson")).toHaveValue("202602");
  });

  it("saves Undecided as no major, then opens step 2", async () => {
    stubFetch([200, { profile: PROFILE }]);
    renderAbout();
    await userEvent.click(screen.getByRole("button", { name: "Add a minor" }));
    await userEvent.selectOptions(screen.getByLabelText("Minor"), "Minor in Music");
    await userEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/onboarding?step=classes"));
    expect(calls).toEqual([
      {
        url: "/api/profile",
        method: "PATCH",
        body: { graduationYear: 2030, firstTerm: "202601", majors: [], minors: ["Minor in Music"] },
      },
    ]);
  });

  it("saves up to three official majors without repeats", async () => {
    stubFetch([200, { profile: PROFILE }]);
    renderAbout({ majors: [MAJORS[0]!] });
    await userEvent.click(screen.getByRole("button", { name: "Add another major" }));
    const second = screen.getByLabelText("Major 2");
    // The first major is not offered twice.
    expect(within(second).getByRole("option", { name: MAJORS[0] })).toBeDisabled();
    await userEvent.selectOptions(second, MAJORS[1]!);
    await userEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toMatchObject({ majors: MAJORS });
  });

  it("shows server field errors on their fields and does not move on", async () => {
    stubFetch([
      400,
      {
        error: {
          code: "validation_failed",
          message: "Some fields are invalid.",
          issues: [{ path: "majors.0", message: "Pick a name from the list of programs." }],
        },
      },
    ]);
    renderAbout({ majors: [MAJORS[0]!] });
    await userEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(await screen.findByText("Pick a name from the list of programs.")).toBeVisible();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("skips without saving", () => {
    renderAbout();
    expect(screen.getByRole("link", { name: "Skip this step" })).toHaveAttribute(
      "href",
      "/onboarding?step=classes",
    );
    expect(screen.queryByRole("link", { name: "Back" })).toBeNull();
  });
});

describe("ClassesStep (step 2)", () => {
  const base = {
    term: "202601",
    termLabel: "Fall 2026",
    status: "in-progress" as const,
    startsLater: false,
    firstTerm: "202501",
  };

  it("auto-selects the only section and adds it with its CRN", async () => {
    const his = section({
      crn: "10274",
      courseCode: "HIS 357",
      subject: "HIS",
      number: "357",
      title: "Title of HIS 357",
    });
    const added = planItem({ courseCode: "HIS 357", crn: "10274", title: "Title of HIS 357" });
    stubFetch(
      searchAnswer([summary("HIS 357", 1)]),
      [200, { course: course("HIS 357", [his]), asOf: null }],
      itemAnswer(added),
    );
    render(<ClassesStep {...base} items={[]} />);
    await search("his 357");
    await userEvent.click(await screen.findByRole("button", { name: "Add for HIS 357" }));
    expect(await screen.findByText(/Added HIS 357 A \(CRN 10274\)/)).toBeVisible();
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "GET /api/catalog/search?term=202601&q=his+357&pageSize=10",
      "GET /api/catalog/courses/202601/HIS-357",
      "POST /api/plan/items",
    ]);
    expect(calls[2]?.body).toEqual({
      termCode: "202601",
      courseCode: "HIS 357",
      crn: "10274",
      status: "in-progress",
      source: "catalog",
    });
    const current = screen.getByTestId("current-classes");
    expect(within(current).getByText("Title of HIS 357")).toBeVisible();
    expect(within(current).getByText(/CRN 10274/)).toBeVisible();
  });

  it("lists the sections of a multi-section course as radio buttons", async () => {
    const sections = [
      section({ crn: "10141", section: "A" }),
      section({
        crn: "10142",
        section: "B",
        meetings: [{ days: ["T", "R"], start: "08:15", end: "09:30", kind: "class", tba: false }],
        instructors: [{ first: "Catherine", last: "Nemitz", isStaff: false }],
      }),
    ];
    stubFetch(
      searchAnswer([summary("CSC 121", 2)]),
      [200, { course: course("CSC 121", sections), asOf: null }],
      itemAnswer(planItem({ crn: "10142" })),
    );
    render(<ClassesStep {...base} status="registered" items={[]} />);
    await search("CSC 121");
    await userEvent.click(
      await screen.findByRole("button", { name: "Choose section for CSC 121" }),
    );
    const group = await screen.findByRole("group", { name: "Your section of CSC 121" });
    const radios = within(group).getAllByRole("radio");
    expect(radios).toHaveLength(2);
    expect(within(group).getByText("TR 8:15a–9:30a")).toBeVisible();
    expect(within(group).getByText("Catherine Nemitz")).toBeVisible();
    // Nothing is chosen yet: Save does nothing.
    await userEvent.click(within(group).getByRole("button", { name: "Save section" }));
    expect(calls).toHaveLength(2);
    await userEvent.click(within(group).getByLabelText(/CSC 121 B/));
    await userEvent.click(within(group).getByRole("button", { name: "Save section" }));
    await waitFor(() => expect(calls).toHaveLength(3));
    expect(calls[2]?.body).toMatchObject({ crn: "10142", status: "registered" });
  });

  it("only sets the CRN of a course already in the term (a re-run or a legacy plan)", async () => {
    const existing = planItem({ courseCode: "CSC 121", status: "planned" });
    stubFetch(
      searchAnswer([summary("CSC 121", 2)]),
      [
        200,
        {
          course: course("CSC 121", [
            section({ crn: "10141", section: "A" }),
            section({ crn: "10142", section: "B" }),
          ]),
          asOf: null,
        },
      ],
      itemAnswer({ ...existing, crn: "10141" }, 200),
    );
    render(<ClassesStep {...base} items={[existing]} />);
    expect(
      within(screen.getByTestId("current-classes")).getByText(/No section chosen/),
    ).toBeVisible();
    await search("CSC 121");
    expect(await screen.findByText(/In your classes, no section yet/)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Choose section for CSC 121" }));
    await userEvent.click(await screen.findByLabelText(/CSC 121 A/));
    await userEvent.click(screen.getByRole("button", { name: "Save section" }));
    await waitFor(() => expect(calls).toHaveLength(3));
    expect(calls[2]).toEqual({
      url: `/api/plan/items/${existing.id}`,
      method: "PATCH",
      body: { crn: "10141" },
    });
    expect(await screen.findByText("CSC 121 is now section A (CRN 10141).")).toBeVisible();
  });

  it("sends nothing when the chosen section is already in the plan", async () => {
    const existing = planItem({ courseCode: "HIS 357", crn: "10274" });
    stubFetch(searchAnswer([summary("HIS 357", 2)]), [
      200,
      {
        course: course("HIS 357", [
          section({ crn: "10274", courseCode: "HIS 357", subject: "HIS", number: "357" }),
          section({
            crn: "10275",
            courseCode: "HIS 357",
            subject: "HIS",
            number: "357",
            section: "B",
          }),
        ]),
        asOf: null,
      },
    ]);
    render(<ClassesStep {...base} items={[existing]} />);
    await search("HIS 357");
    await userEvent.click(
      await screen.findByRole("button", { name: "Change section for HIS 357" }),
    );
    const group = await screen.findByRole("group", { name: "Your section of HIS 357" });
    // The stored section is preselected.
    expect(within(group).getByLabelText(/HIS 357 A/)).toBeChecked();
    await userEvent.click(within(group).getByRole("button", { name: "Save section" }));
    expect(
      await screen.findByText(/HIS 357 A \(CRN 10274\) is already in your Fall 2026/),
    ).toBeVisible();
    expect(calls).toHaveLength(2);
  });

  it("offers nothing to do for a one-section course already chosen", async () => {
    stubFetch(searchAnswer([summary("HIS 357", 1)]));
    render(<ClassesStep {...base} items={[planItem({ courseCode: "HIS 357", crn: "10274" })]} />);
    await search("HIS 357");
    const result = await screen.findByTestId("search-result");
    expect(within(result).getByText(/In your classes \(CRN 10274\)/)).toBeVisible();
    expect(within(result).queryByRole("button")).toBeNull();
  });

  it("treats a 409 as already there and reloads the plan instead of adding twice", async () => {
    const his = section({ crn: "10274", courseCode: "HIS 357", subject: "HIS", number: "357" });
    const stored = planItem({ courseCode: "HIS 357", crn: "10274" });
    stubFetch(
      searchAnswer([summary("HIS 357", 1)]),
      [200, { course: course("HIS 357", [his]), asOf: null }],
      [409, { error: { code: "conflict", message: "HIS 357 is already in your Fall 2026 plan." } }],
      [
        200,
        {
          plan: {
            items: [stored],
            summer: [],
            deadlines: [],
            manual: { languageExempt: false, pe: { lifetimeActivities: 0, teamSport: false } },
            legacy: false,
            updatedAt: NOW,
          },
        },
      ],
    );
    render(<ClassesStep {...base} items={[]} />);
    await search("HIS 357");
    await userEvent.click(await screen.findByRole("button", { name: "Add for HIS 357" }));
    expect(await screen.findByText("HIS 357 is already in your Fall 2026 classes.")).toBeVisible();
    expect(calls.map((call) => `${call.method} ${call.url}`).at(-1)).toBe("GET /api/plan");
    expect(within(screen.getByTestId("current-classes")).getAllByTestId("plan-item")).toHaveLength(
      1,
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("removes a class", async () => {
    const existing = planItem({ courseCode: "CSC 121", crn: "10141" });
    stubFetch([204, null]);
    render(<ClassesStep {...base} items={[existing]} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove CSC 121 Fall 2026" }));
    expect(await screen.findByText("Removed CSC 121.")).toBeVisible();
    expect(calls[0]).toMatchObject({ method: "DELETE", url: `/api/plan/items/${existing.id}` });
    expect(screen.queryByTestId("current-classes")).toBeNull();
  });

  it("shows a search failure without listing anything", async () => {
    stubFetch([
      503,
      { error: { code: "unavailable", message: "Schedule data is temporarily unavailable." } },
    ]);
    render(<ClassesStep {...base} items={[]} />);
    await search("CSC");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Schedule data is temporarily unavailable.",
    );
    expect(screen.queryByTestId("search-result")).toBeNull();
  });

  it("explains an incoming student has no current classes", () => {
    render(<ClassesStep {...base} startsLater firstTerm="202701" items={[]} />);
    expect(screen.getByText(/You start at Davidson in Fall 2027/)).toBeVisible();
    expect(screen.queryByRole("search")).toBeNull();
    expect(screen.getByRole("link", { name: "Continue" })).toHaveAttribute(
      "href",
      "/onboarding?step=completed",
    );
  });
});

describe("CompletedStep (step 3)", () => {
  it("searches the chosen past term and marks a course completed", async () => {
    const added = planItem({
      termCode: "202501",
      courseCode: "WRI 101",
      status: "completed",
      title: "Writing",
    });
    stubFetch(searchAnswer([summary("WRI 101", 4, "202501")], "202501"), itemAnswer(added));
    render(<CompletedStep terms={["202502", "202501"]} items={[]} />);
    expect(screen.getByLabelText("Term you took it")).toHaveValue("202502");
    await userEvent.selectOptions(screen.getByLabelText("Term you took it"), "202501");
    await search("WRI 101", /Search Fall 2025 courses/);
    await userEvent.click(await screen.findByRole("button", { name: "Mark WRI 101 completed" }));
    expect(await screen.findByText("Added WRI 101 (Fall 2025) as completed.")).toBeVisible();
    expect(calls[0]?.url).toBe("/api/catalog/search?term=202501&q=WRI+101&pageSize=10");
    expect(calls[1]?.body).toEqual({
      termCode: "202501",
      courseCode: "WRI 101",
      status: "completed",
      source: "catalog",
    });
    expect(screen.getByText("Completed in Fall 2025")).toBeVisible();
    expect(within(screen.getByTestId("completed-items")).getByText("Writing")).toBeVisible();
  });

  it("shows a course already completed in that term instead of offering it again", async () => {
    stubFetch(searchAnswer([summary("WRI 101", 4, "202502")], "202502"));
    render(
      <CompletedStep
        terms={["202502"]}
        items={[planItem({ termCode: "202502", courseCode: "WRI 101", status: "completed" })]}
      />,
    );
    await search("WRI", /Search Spring 2026 courses/);
    const result = await screen.findByTestId("search-result");
    expect(within(result).getByText("Completed in Spring 2026")).toBeVisible();
    expect(within(result).queryByRole("button")).toBeNull();
  });

  it("adds AP credit without a term and validates the entry first", async () => {
    const added = planItem({
      termCode: null,
      courseCode: "MAT 113",
      status: "completed",
      source: "ap",
      title: "Calculus II",
    });
    stubFetch(itemAnswer(added));
    render(<CompletedStep terms={["202502"]} items={[]} />);
    const form = screen.getByRole("form", { name: "Add AP, IB or transfer credit" });
    await userEvent.type(within(form).getByLabelText("Davidson course code"), "calculus");
    await userEvent.click(within(form).getByRole("button", { name: "Add credit" }));
    expect(await within(form).findByText("Enter a course code such as MAT 113.")).toBeVisible();
    expect(calls).toHaveLength(0);

    await userEvent.clear(within(form).getByLabelText("Davidson course code"));
    await userEvent.type(within(form).getByLabelText("Davidson course code"), "mat113");
    await userEvent.click(within(form).getByRole("button", { name: "Add credit" }));
    expect(await screen.findByText("Added MAT 113 (AP or IB credit).")).toBeVisible();
    expect(calls[0]?.body).toEqual({
      termCode: null,
      courseCode: "MAT 113",
      status: "completed",
      source: "ap",
      manualCredits: 1,
    });
    expect(within(form).getByLabelText("Davidson course code")).toHaveValue("");

    // The same AP credit again is caught before any request.
    await userEvent.type(within(form).getByLabelText("Davidson course code"), "MAT 113");
    await userEvent.click(within(form).getByRole("button", { name: "Add credit" }));
    expect(await within(form).findByText("MAT 113 is already listed for that term.")).toBeVisible();
    expect(calls).toHaveLength(1);
  });

  it("needs a term for a Davidson course the search does not find", async () => {
    stubFetch(
      itemAnswer(
        planItem({
          termCode: "202502",
          courseCode: "CSC 999",
          status: "completed",
          source: "manual",
          unverified: true,
        }),
      ),
    );
    render(<CompletedStep terms={["202502"]} items={[]} />);
    const form = screen.getByRole("form", { name: "Add AP, IB or transfer credit" });
    await userEvent.selectOptions(within(form).getByLabelText("Kind of credit"), "manual");
    await userEvent.type(within(form).getByLabelText("Davidson course code"), "CSC 999");
    await userEvent.type(within(form).getByLabelText("Title (optional)"), "Special topics");
    await userEvent.click(within(form).getByRole("button", { name: "Add credit" }));
    expect(await within(form).findByText("Pick the term you took it in.")).toBeVisible();
    await userEvent.selectOptions(within(form).getByLabelText("Term"), "202502");
    await userEvent.click(within(form).getByRole("button", { name: "Add credit" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({
      termCode: "202502",
      courseCode: "CSC 999",
      status: "completed",
      source: "manual",
      manualCredits: 1,
      manualTitle: "Special topics",
    });
    expect(await screen.findByText(/Unverified/)).toBeVisible();
  });

  it("has only AP/transfer credit in the first semester", () => {
    render(<CompletedStep terms={[]} items={[]} />);
    expect(screen.getByText(/This is your first semester/)).toBeVisible();
    expect(screen.queryByRole("search")).toBeNull();
    const kinds = within(screen.getByLabelText("Kind of credit")).getAllByRole("option");
    expect(kinds.map((option) => option.textContent)).toEqual([
      "AP or IB credit",
      "Transfer credit",
    ]);
  });
});

describe("InterestsStep (step 4)", () => {
  const careers: CareerOption[] = [
    { slug: "software-engineering", name: "Software Engineering", cluster: "Technology" },
    { slug: "data-science", name: "Data Science & Analytics", cluster: "Technology" },
    { slug: "law", name: "Law", cluster: "Public Service & Law" as CareerOption["cluster"] },
  ];

  it("saves the chosen slugs, finishes onboarding and opens Today", async () => {
    stubFetch([200, { profile: { ...PROFILE, interests: ["law"], onboardedAt: NOW } }]);
    render(<InterestsStep initial={["data-science", "retired-slug"]} careers={careers} />);
    expect(screen.getByRole("button", { name: "Data Science & Analytics" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.click(screen.getByRole("button", { name: "Data Science & Analytics" }));
    await userEvent.click(screen.getByRole("button", { name: "Law" }));
    expect(screen.getByTestId("interests-count")).toHaveTextContent("1 chosen.");
    await userEvent.click(screen.getByRole("button", { name: "Finish" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/today"));
    expect(calls).toEqual([
      { url: "/api/profile", method: "PATCH", body: { interests: ["law"], onboarded: true } },
    ]);
    expect(screen.getByRole("group", { name: "Technology" })).toBeVisible();
  });

  it("keeps the student here when saving fails", async () => {
    stubFetch([500, { error: { code: "internal", message: "secret detail" } }]);
    render(<InterestsStep initial={[]} careers={careers} />);
    await userEvent.click(screen.getByRole("button", { name: "Finish" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong. Please try again.",
    );
    expect(screen.queryByText("secret detail")).toBeNull();
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe("SkipSetup", () => {
  it("marks onboarding done without saving anything else", async () => {
    stubFetch([200, { profile: { ...PROFILE, onboardedAt: NOW } }]);
    render(<SkipSetup />);
    await userEvent.click(screen.getByRole("button", { name: "Skip setup" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/today"));
    expect(calls).toEqual([{ url: "/api/profile", method: "PATCH", body: { onboarded: true } }]);
  });
});
