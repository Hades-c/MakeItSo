import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AddToPlanTerm } from "@/components/domain/add-to-plan-control";
import {
  CourseAddToPlan,
  noticeForError,
  PLAN_UNAVAILABLE_MESSAGE,
  SIGNED_OUT_MESSAGE,
} from "@/app/(hub)/careers/_components/course-add-to-plan";
import { CareerCourseItem, courseView } from "@/app/(hub)/careers/_components/career-courses";
import { planPresence } from "@/app/(hub)/careers/_lib/plan";
import { ApiClientError } from "@/lib/api/client";
import { getCareer } from "@/server/content/careers";
import { convertLegacyPlan, type LegacyCatalogLookup } from "@/server/plan/legacy-core";
import { fixtureClock } from "../helpers/terms";

const TERMS: AddToPlanTerm[] = [
  { code: "202601", label: "Fall 2026", availability: "offered", sectionCount: 2 },
  { code: "202602", label: "Spring 2027", availability: "offered", sectionCount: 1 },
  { code: "202701", label: "Fall 2027", availability: "not-yet-published" },
];

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];

/** Answer callApi's fetches in order with [status, body] pairs ("html" = a Next.js 404 page, not JSON). */
function stubFetch(...answers: [number, unknown][]) {
  calls = [];
  const queue = [...answers];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const [status, body] = queue.shift() ?? [500, {}];
      if (body === "html") {
        return new Response("<!doctype html><title>404</title>", {
          status,
          headers: { "content-type": "text/html" },
        });
      }
      if (body === "network") throw new TypeError("Failed to fetch");
      return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderControl(props: Partial<React.ComponentProps<typeof CourseAddToPlan>> = {}) {
  return render(
    <CourseAddToPlan
      courseCode="CSC 221"
      terms={TERMS}
      initialTerm="202602"
      inPlanTerms={[]}
      currentTerm="202601"
      planHref="/plan?tab=next"
      loginHref="/login?callbackUrl=%2Fcareers%2Fsoftware-engineering"
      {...props}
    />,
  );
}

const ITEM = {
  id: "0123456789abcdef01234567",
  termCode: "202602",
  courseCode: "CSC 221",
  canonicalCode: "CSC 221",
  title: "Data Structures",
  credits: 1,
  status: "planned",
  passFail: false,
  source: "catalog",
  reqCodes: null,
  unverified: false,
};

describe("CourseAddToPlan", () => {
  it("starts on the registration term and adds the course through the plan API", async () => {
    stubFetch([201, { item: ITEM, warnings: [] }]);
    const user = userEvent.setup();
    renderControl();
    expect(screen.getByRole("radio", { name: "Spring 2027" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Add to Spring 2027" }));

    expect(
      await screen.findByRole("button", { name: "In your plan for Spring 2027" }),
    ).toBeVisible();
    const notice = screen.getByTestId("add-to-plan-notice");
    expect(notice).toHaveTextContent("Added CSC 221 to Spring 2027.");
    // Status green is an icon and words (Notice).
    expect(notice.querySelector(".bg-success-wash svg[aria-hidden]")).not.toBeNull();
    expect(within(notice).getByRole("link", { name: "Open My plan" })).toHaveAttribute(
      "href",
      "/plan?tab=next",
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("/api/plan/items");
    expect(calls[0]!.init.method).toBe("POST");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      termCode: "202602",
      courseCode: "CSC 221",
      status: "planned",
      source: "catalog",
    });
  });

  it("adds a current-term course as in progress only after saying so, and shows the service's warnings", async () => {
    stubFetch([
      201,
      {
        item: { ...ITEM, termCode: "202601", status: "in-progress" },
        warnings: [
          { code: "already-completed", message: "Already completed in Fall 2025 — plan a retake?" },
        ],
      },
    ]);
    const user = userEvent.setup();
    renderControl();
    // Not on the registration term: no word about the current term.
    expect(screen.queryByTestId("current-term-note")).toBeNull();
    await user.click(screen.getByRole("radio", { name: "Fall 2026" }));
    // Before the add, above the button: the term is under way and what the add records.
    const note = screen.getByTestId("current-term-note");
    expect(note).toHaveTextContent(
      "Fall 2026 is already under way: adding CSC 221 there records it as a class you’re taking this term.",
    );
    const button = screen.getByRole("button", { name: "Add to Fall 2026" });
    expect(note.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.click(button);
    expect(
      await screen.findByText("Already completed in Fall 2025 — plan a retake?"),
    ).toBeVisible();
    expect(JSON.parse(String(calls[0]!.init.body)).status).toBe("in-progress");
    // Added: nothing left to warn about.
    expect(screen.queryByTestId("current-term-note")).toBeNull();
  });

  it("shows the unpublished term's usual season with the term choice, above the button", () => {
    stubFetch();
    renderControl({
      unpublishedNote:
        "Fall 2027 isn’t published yet. Usually offered in Fall (based on Fall 2024 and Fall 2025)",
    });
    const note = screen.getByTestId("usually-offered");
    const button = screen.getByRole("button", { name: "Add to Spring 2027" });
    expect(note.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The tile itself keeps "Not yet published" (PLAN §5).
    expect(screen.getByRole("radio", { name: "Fall 2027" })).toHaveAccessibleDescription(
      "Not yet published",
    );
  });

  it("starts on no term when neither the registration nor the next term can be chosen", () => {
    stubFetch();
    renderControl({
      initialTerm: null,
      terms: [
        { code: "202601", label: "Fall 2026", availability: "offered", sectionCount: 1 },
        { code: "202602", label: "Spring 2027", availability: "not-offered" },
      ],
    });
    expect(screen.getByRole("radio", { name: "Fall 2026" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Choose a term" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("says the plan is not available yet while the plan route is missing (404) or a stub (501)", async () => {
    stubFetch(
      [404, "html"],
      [501, { error: { code: "unavailable", message: "addItem is not implemented yet." } }],
    );
    const user = userEvent.setup();
    renderControl();
    await user.click(screen.getByRole("button", { name: "Add to Spring 2027" }));
    expect(await screen.findByText(PLAN_UNAVAILABLE_MESSAGE)).toBeVisible();
    // Nothing pretends it worked; the student can try again.
    expect(screen.getByRole("button", { name: "Add to Spring 2027" })).not.toHaveAttribute(
      "aria-disabled",
    );
    await user.click(screen.getByRole("button", { name: "Add to Spring 2027" }));
    expect(await screen.findByText(PLAN_UNAVAILABLE_MESSAGE)).toBeVisible();
    expect(screen.queryByRole("button", { name: /In your plan/ })).toBeNull();
    expect(calls).toHaveLength(2);
  });

  it("treats a 409 as already in the plan", async () => {
    stubFetch([409, { error: { code: "conflict", message: "Already in your plan." } }]);
    const user = userEvent.setup();
    renderControl();
    await user.click(screen.getByRole("button", { name: "Add to Spring 2027" }));
    expect(
      await screen.findByText("CSC 221 is already in your plan for Spring 2027."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "In your plan for Spring 2027" })).toBeVisible();
  });

  it("offers to sign in again when the session has ended", async () => {
    stubFetch([401, { error: { code: "unauthorized", message: "Sign in to continue." } }]);
    const user = userEvent.setup();
    renderControl();
    await user.click(screen.getByRole("button", { name: "Add to Spring 2027" }));
    expect(await screen.findByText(SIGNED_OUT_MESSAGE)).toBeVisible();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login?callbackUrl=%2Fcareers%2Fsoftware-engineering",
    );
  });

  it("says when MakeItSo cannot be reached", async () => {
    stubFetch([0, "network"]);
    const user = userEvent.setup();
    renderControl();
    await user.click(screen.getByRole("button", { name: "Add to Spring 2027" }));
    expect(await screen.findByText(/Could not reach MakeItSo/)).toBeVisible();
  });

  it("starts as added for terms already in the plan", () => {
    stubFetch();
    renderControl({ inPlanTerms: ["202602"] });
    expect(screen.getByRole("button", { name: "In your plan for Spring 2027" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("clears an old notice when another term is chosen", async () => {
    stubFetch([404, "html"]);
    const user = userEvent.setup();
    renderControl();
    await user.click(screen.getByRole("button", { name: "Add to Spring 2027" }));
    expect(await screen.findByText(PLAN_UNAVAILABLE_MESSAGE)).toBeVisible();
    await user.click(screen.getByRole("radio", { name: "Fall 2027" }));
    expect(screen.queryByText(PLAN_UNAVAILABLE_MESSAGE)).toBeNull();
  });
});

describe("noticeForError", () => {
  it("maps every failure to words", () => {
    const n = (error: unknown) => noticeForError(error, "Spring 2027", "CSC 221");
    expect(n(new ApiClientError(503, "unavailable", "down"))).toEqual({
      tone: "info",
      text: PLAN_UNAVAILABLE_MESSAGE,
    });
    expect(n(new ApiClientError(400, "validation_failed", "Pick a term."))).toEqual({
      tone: "error",
      text: "Pick a term.",
    });
    expect(n(new ApiClientError(500, "internal", "Something went wrong."))).toEqual({
      tone: "error",
      text: "Could not add CSC 221 to Spring 2027. Please try again.",
    });
    expect(n(new Error("boom")).tone).toBe("error");
  });
});

describe("CareerCourseItem", () => {
  const course = { code: "CSC 221", title: "Data Structures", why: "A core course." };
  const terms = { current: "202601", registration: "202602", next: "202701" };
  // The fixtures' day: Fall 2026 in session.
  const clock = fixtureClock();

  it("shows the course, its catalog link and the live availability control", () => {
    const view = courseView(
      course,
      [
        { termCode: "202601", status: "offered", sectionCount: 2 },
        { termCode: "202602", status: "offered", sectionCount: 2 },
        {
          termCode: "202701",
          status: "not-yet-published",
          usually: { season: "Fall", basedOn: ["202401", "202501", "202601"] },
        },
      ],
      terms,
      new Map([["CSC 221", new Map([["202601", "planned" as const]])]]),
      clock,
    );
    expect(view.inPlanTerms).toEqual(["202601"]);
    expect(view.status).toBeNull();
    stubFetch();
    render(
      <CareerCourseItem view={view} currentTerm="202601" planHref="/plan" loginHref="/login" />,
    );
    const article = screen.getByRole("article", { name: /Data Structures/ });
    expect(
      within(article).getByRole("link", { name: "Data Structures (CSC 221)" }),
    ).toHaveAttribute("href", "/courses/202602/CSC-221");
    expect(within(article).getByText("Course schedule")).toHaveAttribute(
      "data-source",
      "course-schedule",
    );
    expect(within(article).getByRole("radio", { name: "Spring 2027" })).toBeChecked();
    // PLAN §5: the unpublished term says "Not yet published", plus the usual season and its basis.
    expect(within(article).getByRole("radio", { name: "Fall 2027" })).toHaveAccessibleDescription(
      "Not yet published",
    );
    expect(within(article).getByTestId("usually-offered")).toHaveTextContent(
      "Fall 2027 isn’t published yet. Usually offered in Fall (based on Fall 2024, Fall 2025 and Fall 2026)",
    );
  });

  it("says a course is completed or under way instead of offering Add, and flags a repeat", () => {
    const history = [
      { termCode: "202601", status: "offered" as const, sectionCount: 2 },
      { termCode: "202602", status: "offered" as const, sectionCount: 2 },
    ];
    const cases = [
      // CSC 121 for Avery: completed in Fall 2025.
      [new Map([["202501", "completed" as const]]), "Completed Fall 2025", false],
      // CSC 321: in progress this term.
      [new Map([["202601", "in-progress" as const]]), "Taking now (Fall 2026)", false],
      // CSC 221: completed in Spring 2026 and planned again for Spring 2027.
      [
        new Map([
          ["202502", "completed" as const],
          ["202602", "planned" as const],
        ]),
        "Completed Spring 2026 · in your Spring 2027 plan",
        true,
      ],
    ] as const;
    for (const [entries, text, warning] of cases) {
      const view = courseView(course, history, terms, new Map([["CSC 221", entries]]), clock);
      expect(view.status).toEqual({ text, warning });
      stubFetch();
      const { unmount } = render(
        <CareerCourseItem view={view} currentTerm="202601" planHref="/plan" loginHref="/login" />,
      );
      const status = screen.getByTestId("course-plan-status");
      expect(status).toHaveTextContent(`Source: your plan. ${text}`);
      expect(status).toHaveAttribute("data-source", "my-plan");
      expect(status.querySelector("svg") !== null).toBe(warning);
      // Spec §5.6 .st-warn: a repeat's icon and words are in the warning colour; plain statuses are not.
      expect(status.classList.contains("text-warning")).toBe(warning);
      expect(status.classList.contains("text-fg")).toBe(!warning);
      // No Add control, no term choice: the course is taken.
      expect(screen.queryByRole("button", { name: /^Add to/ })).toBeNull();
      expect(screen.queryByRole("radio")).toBeNull();
      expect(screen.queryByTestId("add-to-plan")).toBeNull();
      unmount();
    }
  });

  it("says a result marked for a term that is not over needs a check, links the 4-year plan, and offers no Add", () => {
    const history = [
      { termCode: "202601", status: "offered" as const, sectionCount: 2 },
      { termCode: "202602", status: "offered" as const, sectionCount: 2 },
    ];
    // The fixtures clock: Fall 2026 (202601) is the current term, and a 202601 Completed entry is impossible.
    // A completed item is in the plan (its term is listed); a failed one never puts the course there.
    for (const [entries, words, inPlan] of [
      [new Map([["202601", "completed" as const]]), "marked Completed", ["202601"]],
      [new Map([["202601", "failed" as const]]), "marked Failed", []],
    ] as const) {
      const view = courseView(course, history, terms, new Map([["CSC 221", entries]]), clock);
      expect(view.status?.text).toBe(`In your Fall 2026 plan · ${words}, check your plan`);
      expect(view.inPlanTerms).toEqual(inPlan);
      stubFetch();
      const { unmount } = render(
        <CareerCourseItem view={view} currentTerm="202601" planHref="/plan" loginHref="/login" />,
      );
      const status = screen.getByTestId("course-plan-status");
      expect(status).toHaveTextContent(
        `Source: your plan. In your Fall 2026 plan · ${words}, check your plan`,
      );
      expect(status).not.toHaveTextContent(/Completed Fall 2026/);
      expect(status).toHaveAttribute("data-warning", "true");
      expect(status).toHaveClass("text-warning");
      expect(status.querySelector("svg")).not.toBeNull();
      const link = within(status).getByRole("link", {
        name: "check your plan for CSC 221 in your 4-year plan",
      });
      expect(link).toHaveAttribute("href", "/plan?tab=four-year");
      expect(screen.queryByRole("button", { name: /^(Add to|Choose a term)/ })).toBeNull();
      expect(screen.queryByRole("radio")).toBeNull();
      expect(screen.queryByTestId("add-to-plan")).toBeNull();
      unmount();
    }
    // The page's date-based current term applies when the terms list cannot be read.
    const unknown = courseView(
      course,
      null,
      null,
      new Map([["CSC 221", new Map([["202601", "completed" as const]])]]),
      { terms: [], at: clock.at },
    );
    expect(unknown.status?.text).toBe("In your Fall 2026 plan · marked Completed, check your plan");
  });

  it("disables a term the course is not offered in, and never says offered for an unpublished one", () => {
    const view = courseView(
      course,
      [
        { termCode: "202601", status: "offered", sectionCount: 1 },
        { termCode: "202602", status: "not-offered" },
        { termCode: "202701", status: "not-yet-published" },
      ],
      terms,
      null,
      clock,
    );
    // Offered this term, not in Spring 2027 (CSC 351 on Software Engineering): the next term, never Fall 2026.
    expect(view.initialTerm).toBe("202701");
    stubFetch();
    render(
      <CareerCourseItem view={view} currentTerm="202601" planHref="/plan" loginHref="/login" />,
    );
    expect(screen.getByRole("radio", { name: "Spring 2027" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Fall 2026" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Fall 2027" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Fall 2027" })).toHaveAccessibleDescription(
      "Not yet published",
    );
    expect(screen.getByRole("button", { name: "Add to Fall 2027" })).toBeVisible();
    expect(screen.queryByTestId("current-term-note")).toBeNull();
    expect(screen.queryByTestId("usually-offered")).toBeNull();
  });

  it("chooses no term when only the current one is open", () => {
    const view = courseView(
      course,
      [
        { termCode: "202601", status: "offered", sectionCount: 1 },
        { termCode: "202602", status: "not-offered" },
      ],
      terms,
      null,
      clock,
    );
    expect(view.initialTerm).toBeNull();
    stubFetch();
    render(
      <CareerCourseItem view={view} currentTerm="202601" planHref="/plan" loginHref="/login" />,
    );
    expect(screen.getByRole("button", { name: "Choose a term" })).toBeVisible();
  });

  it("lists the course without availability when the catalog cannot answer (no guess)", () => {
    for (const view of [
      courseView(course, null, terms, null, clock),
      courseView(course, [], terms, null, clock),
      courseView(
        course,
        [{ termCode: "202602", status: "offered", sectionCount: 1 }],
        null,
        null,
        clock,
      ),
    ]) {
      const { unmount } = render(
        <CareerCourseItem view={view} currentTerm="202601" planHref="/plan" loginHref="/login" />,
      );
      expect(screen.getByTestId("availability-unknown")).toHaveTextContent(
        "Schedule data for this course is unavailable right now.",
      );
      expect(screen.queryByRole("radio")).toBeNull();
      unmount();
    }
  });
});

describe("a v1 (hackathon) plan, converted, on the Investment Banking page", () => {
  // The audit's "legacy" account (audit2/scripts/legacy-seed.cjs): the old add dialog's defaults (Fall of the
  // current calendar year) with the status dropdown set to Completed and a grade, and one Spring 2027 plan.
  const v1 = (
    courseCode: string,
    courseName: string,
    semester: string,
    year: number,
    status: string,
    grade?: string,
  ) => ({
    courseCode,
    courseName,
    credits: 4,
    semester,
    year,
    status,
    ...(grade ? { grade } : {}),
  });
  const doc = {
    plannedCourses: [
      v1("ECO 101", "Introductory Economics", "Fall", 2026, "completed", "A"),
      v1("CSC 108", "Exploring Computer Science", "Fall", 2026, "completed", "A-"),
      v1("CSC 250", "Computer Organization", "Fall", 2026, "completed", "B+"),
      v1("BIO 393", "Advances in Genome Editing", "Fall", 2026, "completed", "A"),
      v1("ECO 202", "Intermed Microeconomic Theory", "Spring", 2027, "planned"),
    ],
    summerActivities: [],
  };
  const lookup: LegacyCatalogLookup = async (_term, code) => ({
    courseCode: code,
    canonicalCode: code,
    title: code,
    credits: 1,
    reqCodes: null,
  });
  const terms = { current: "202601", registration: "202602", next: "202701" };
  const history = [
    { termCode: "202601", status: "offered" as const, sectionCount: 2 },
    { termCode: "202602", status: "offered" as const, sectionCount: 2 },
  ];

  it("never shows Completed Fall 2026: ECO 101 says to check the plan, with no Add", async () => {
    const { conversion } = await convertLegacyPlan(doc, {
      userId: "650000000000000000000001",
      lookup,
    });
    // The conversion keeps v1's status: Fall 2026 Completed (the grade only maps F and W).
    expect(conversion.items.find((i) => i.courseCode === "ECO 101")).toMatchObject({
      termCode: "202601",
      status: "completed",
    });
    const presence = planPresence(conversion.items);
    const ib = getCareer("investment-banking")!;
    expect(ib.courses.map((c) => c.code)).toContain("ECO 101");
    const views = ib.courses.map((c) => courseView(c, history, terms, presence, fixtureClock()));
    for (const view of views) expect(view.status?.text ?? "").not.toMatch(/Completed Fall 2026/);
    const eco101 = views.find((v) => v.code === "ECO 101")!;
    expect(eco101.status).toMatchObject({
      text: "In your Fall 2026 plan · marked Completed, check your plan",
      warning: true,
    });
    stubFetch();
    render(
      <CareerCourseItem view={eco101} currentTerm="202601" planHref="/plan" loginHref="/login" />,
    );
    const status = screen.getByTestId("course-plan-status");
    expect(status).toHaveTextContent("In your Fall 2026 plan · marked Completed, check your plan");
    expect(within(status).getByRole("link", { name: /^check your plan/ })).toHaveAttribute(
      "href",
      "/plan?tab=four-year",
    );
    expect(screen.queryByTestId("add-to-plan")).toBeNull();
    expect(document.body).not.toHaveTextContent(/Completed Fall 2026/);
  });

  it("never says Taking now for a v1 In progress row once its term is over: it says to check the plan", async () => {
    const { conversion } = await convertLegacyPlan(
      {
        plannedCourses: [
          v1("ECO 101", "Introductory Economics", "Fall", 2025, "in-progress"),
          v1("ECO 202", "Intermed Microeconomic Theory", "Fall", 2026, "in-progress"),
        ],
        summerActivities: [],
      },
      { userId: "650000000000000000000001", lookup },
    );
    // The conversion keeps v1's In progress as it is, and nothing moves it on later.
    expect(conversion.items.map((i) => [i.courseCode, i.termCode, i.status])).toEqual([
      ["ECO 101", "202501", "in-progress"],
      ["ECO 202", "202601", "in-progress"],
    ]);
    const presence = planPresence(conversion.items);
    const status = (code: string, at: string) =>
      courseView(
        { code, title: code, why: "A core course." },
        history,
        terms,
        presence,
        fixtureClock(at),
      ).status;
    const marked = (term: string) => ({
      text: `In your ${term} plan · marked In progress, check your plan`,
      warning: true,
      check: { words: "check your plan", href: "/plan?tab=four-year" },
    });
    // On the fixtures' day: Fall 2025 is long over; Fall 2026 is the term in session.
    expect(status("ECO 101", "2026-09-30T12:00:00-04:00")).toEqual(marked("Fall 2025"));
    expect(status("ECO 202", "2026-09-30T12:00:00-04:00")).toEqual({
      text: "Taking now (Fall 2026)",
      warning: false,
    });
    // After Fall 2026's last day (still the current term until Spring starts) and during Spring 2027.
    for (const at of ["2026-12-20T12:00:00-05:00", "2027-02-01T12:00:00-05:00"]) {
      expect(status("ECO 202", at)).toEqual(marked("Fall 2026"));
    }
  });
});
