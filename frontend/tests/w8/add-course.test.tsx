import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AddToPlanTerm } from "@/components/domain/add-to-plan-control";
import {
  AddCourse,
  noticeForError,
  PLAN_UNAVAILABLE_MESSAGE,
  SIGNED_OUT_MESSAGE,
} from "@/app/(hub)/courses/_components/add-course";
import { ApiClientError } from "@/lib/api/client";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

/** "Add to <term>" (POST /api/plan/items through callApi): warnings before and after, every failure. */

const TERMS: AddToPlanTerm[] = [
  { code: "202601", label: "Fall 2026", availability: "offered", sectionCount: 2 },
  { code: "202602", label: "Spring 2027", availability: "offered", sectionCount: 2 },
  { code: "202701", label: "Fall 2027", availability: "not-yet-published", note: "Usually Fall" },
];

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];

function stubFetch(...answers: [number, unknown][]) {
  calls = [];
  const queue = [...answers];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const [status, body] = queue.shift() ?? [500, {}];
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
  router.refresh.mockClear();
});

const ITEM = {
  id: "0123456789abcdef01234567",
  termCode: "202602",
  courseCode: "CSC 221",
  canonicalCode: "CSC 221",
  title: "Data Structures",
  credits: 1,
  crn: "20135",
  status: "planned",
  passFail: false,
  source: "catalog",
  reqCodes: ["MQRQ"],
  unverified: false,
};

function renderAdd(props: Partial<React.ComponentProps<typeof AddCourse>> = {}) {
  return render(
    <AddCourse
      courseCode="CSC 221"
      terms={TERMS}
      initialTerm="202602"
      inPlanTerms={[]}
      currentTerm="202601"
      planHref="/plan?tab=next"
      loginHref="/login?callbackUrl=%2Fcourses"
      {...props}
    />,
  );
}

describe("AddCourse", () => {
  it("shows the known warnings for the chosen term before the add, and only for it", async () => {
    renderAdd({ warnings: { "202602": ["Already completed in Fall 2025 — plan a retake?"] } });
    const before = screen.getByTestId("add-warnings");
    expect(before).toHaveTextContent("Warning: Already completed in Fall 2025 — plan a retake?");
    await userEvent.click(screen.getByRole("radio", { name: "Fall 2027" }));
    expect(screen.queryByTestId("add-warnings")).toBeNull();
    expect(screen.getByRole("button", { name: "Add to Fall 2027" })).toBeVisible();
  });

  it("adds the chosen section to the term as planned, shows the service's warnings and refreshes", async () => {
    stubFetch([
      201,
      {
        item: ITEM,
        warnings: [{ code: "time-conflict", message: "CSC 221 A overlaps BIO 201 A." }],
      },
    ]);
    renderAdd({ crns: { "202602": "20135" }, sectionLabels: { "202602": "CSC 221 A" } });
    expect(screen.getByTestId("add-section")).toHaveTextContent("Adds section CSC 221 A.");
    await userEvent.click(screen.getByRole("button", { name: "Add to Spring 2027" }));
    expect(calls[0]!.url).toBe("/api/plan/items");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      termCode: "202602",
      courseCode: "CSC 221",
      crn: "20135",
      status: "planned",
      source: "catalog",
    });
    const notice = await screen.findByTestId("add-to-plan-notice");
    expect(notice).toHaveTextContent("Added CSC 221 A to Spring 2027.");
    expect(within(notice).getByTestId("added-warnings")).toHaveTextContent(
      "CSC 221 A overlaps BIO 201 A.",
    );
    expect(within(notice).getByRole("link", { name: "Open My plan" })).toHaveAttribute(
      "href",
      "/plan?tab=next",
    );
    expect(screen.getByRole("button", { name: "In your plan for Spring 2027" })).toBeVisible();
    expect(router.refresh).toHaveBeenCalledOnce();
  });

  it("records the current term as in-progress after saying so", async () => {
    stubFetch([
      201,
      { item: { ...ITEM, termCode: "202601", status: "in-progress" }, warnings: [] },
    ]);
    renderAdd({ initialTerm: "202601" });
    expect(screen.getByTestId("current-term-note")).toHaveTextContent(
      "Fall 2026 is under way: adding CSC 221 there records it as a class you’re taking this term.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Add to Fall 2026" }));
    expect(JSON.parse(String(calls[0]!.init.body))).toMatchObject({
      termCode: "202601",
      status: "in-progress",
    });
  });

  it("shows the unpublished term's usually-offered note with that term only", async () => {
    renderAdd({ unpublishedNote: "Fall 2027 isn’t published yet. Usually offered in Fall." });
    expect(screen.queryByTestId("usually-offered")).toBeNull();
    await userEvent.click(screen.getByRole("radio", { name: "Fall 2027" }));
    expect(screen.getByTestId("usually-offered")).toHaveTextContent("Usually offered in Fall.");
  });

  it("starts as already added for a term in the plan", () => {
    renderAdd({ inPlanTerms: ["202602"] });
    expect(screen.getByRole("button", { name: "In your plan for Spring 2027" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("treats a 409 as already in the plan", async () => {
    stubFetch([409, { error: { code: "conflict", message: "Already planned." } }]);
    renderAdd();
    await userEvent.click(screen.getByRole("button", { name: "Add to Spring 2027" }));
    expect(await screen.findByTestId("add-to-plan-notice")).toHaveTextContent(
      "CSC 221 is already in your plan for Spring 2027.",
    );
    expect(screen.getByRole("button", { name: "In your plan for Spring 2027" })).toBeVisible();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("asks a signed-out student to sign in again", async () => {
    stubFetch([401, { error: { code: "unauthorized", message: "Sign in." } }]);
    renderAdd();
    await userEvent.click(screen.getByRole("button", { name: "Add to Spring 2027" }));
    const notice = await screen.findByTestId("add-to-plan-notice");
    expect(notice).toHaveTextContent(SIGNED_OUT_MESSAGE);
    expect(within(notice).getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login?callbackUrl=%2Fcourses",
    );
  });

  it("explains every other failure in words", () => {
    expect(
      noticeForError(new ApiClientError(503, "unavailable", "x"), "Spring 2027", "CSC 221"),
    ).toEqual({ tone: "info", text: PLAN_UNAVAILABLE_MESSAGE });
    expect(
      noticeForError(
        new ApiClientError(400, "validation_failed", "Fall 2025 is outside your plan."),
        "Fall 2025",
        "CSC 221",
      ),
    ).toEqual({ tone: "error", text: "Fall 2025 is outside your plan." });
    expect(
      noticeForError(new ApiClientError(0, "network", "Offline."), "Spring 2027", "CSC 221"),
    ).toEqual({ tone: "error", text: "Offline." });
    expect(noticeForError(new Error("boom"), "Spring 2027", "CSC 221")).toEqual({
      tone: "error",
      text: "Could not add CSC 221 to Spring 2027. Please try again.",
    });
  });

  it("does not offer a not-offered term", () => {
    renderAdd({
      terms: [TERMS[0]!, { code: "202602", label: "Spring 2027", availability: "not-offered" }],
      initialTerm: null,
    });
    expect(screen.getByRole("radio", { name: "Spring 2027" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Choose a term" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
