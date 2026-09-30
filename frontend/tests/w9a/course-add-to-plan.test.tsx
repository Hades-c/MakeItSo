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
import { ApiClientError } from "@/lib/api/client";

const TERMS: AddToPlanTerm[] = [
  { code: "202601", label: "Fall 2026", availability: "offered", sectionCount: 2 },
  { code: "202602", label: "Spring 2027", availability: "offered", sectionCount: 1 },
  {
    code: "202701",
    label: "Fall 2027",
    availability: "not-yet-published",
    note: "Usually offered in Fall",
  },
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

  it("adds a current-term course as in progress, and shows the service's warnings", async () => {
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
    await user.click(screen.getByRole("radio", { name: "Fall 2026" }));
    await user.click(screen.getByRole("button", { name: "Add to Fall 2026" }));
    expect(
      await screen.findByText("Already completed in Fall 2025 — plan a retake?"),
    ).toBeVisible();
    expect(JSON.parse(String(calls[0]!.init.body)).status).toBe("in-progress");
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
      new Map([["CSC 221", new Set(["202601"])]]),
    );
    expect(view.inPlanTerms).toEqual(["202601"]);
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
    expect(within(article).getByRole("radio", { name: "Fall 2027" })).toHaveAccessibleDescription(
      "Usually offered in Fall",
    );
    expect(within(article).getByTestId("usually-offered")).toHaveTextContent(
      "Usually offered in Fall (based on Fall 2024, Fall 2025 and Fall 2026)",
    );
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
    );
    expect(view.initialTerm).toBe("202601");
    stubFetch();
    render(
      <CareerCourseItem view={view} currentTerm="202601" planHref="/plan" loginHref="/login" />,
    );
    expect(screen.getByRole("radio", { name: "Spring 2027" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Fall 2027" })).toHaveAccessibleDescription(
      "Not yet published",
    );
    expect(screen.queryByTestId("usually-offered")).toBeNull();
  });

  it("lists the course without availability when the catalog cannot answer (no guess)", () => {
    for (const view of [
      courseView(course, null, terms, null),
      courseView(course, [], terms, null),
      courseView(course, [{ termCode: "202602", status: "offered", sectionCount: 1 }], null, null),
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
