import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REQUIREMENT_SLOTS, type PlanDraft, type PlanProgress } from "@/lib/types/plan";
import { FourYearTab } from "@/app/(hub)/plan/_components/four-year";
import { NextSemesterTab } from "@/app/(hub)/plan/_components/next-semester";
import { PlanTabs } from "@/app/(hub)/plan/_components/plan-tabs";
import { WebTreePrintView } from "@/app/(hub)/plan/_components/print-view";
import { SuggestionsTab } from "@/app/(hub)/plan/_components/suggestions";
import { SummerEditor } from "@/app/(hub)/plan/_components/summer-editor";
import type { FourYearData, NextSemesterData } from "@/app/(hub)/plan/_lib/load";
import { planItem, SLOT_LABELS, stubFetch } from "./dom-helpers";

const refresh = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn() } }));

// Radix Switch and Checkbox measure themselves (jsdom has no ResizeObserver).
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

beforeEach(() => refresh.mockClear());
afterEach(() => vi.unstubAllGlobals());

const NOW = new Date("2026-09-30T16:00:00Z");
const TZ = "America/New_York";

describe("PlanTabs", () => {
  it("links every view, marking the current one", () => {
    render(<PlanTabs active="four-year" />);
    const nav = screen.getByRole("navigation", { name: "Plan views" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => [l.textContent, l.getAttribute("href")])).toEqual([
      ["Next semester", "/plan?tab=next"],
      ["4-year plan", "/plan?tab=four-year"],
      ["Suggestions", "/plan?tab=suggestions"],
      ["Summer", "/plan?tab=summer"],
    ]);
    expect(within(nav).getByRole("link", { name: "4-year plan" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("link", { name: "Summer" })).not.toHaveAttribute("aria-current");
  });

  it("opens another tab in a client transition (the busy state lasts until the view arrives)", async () => {
    const user = userEvent.setup();
    render(
      <PlanTabs active="next">
        <p>Next semester view</p>
      </PlanTabs>,
    );
    expect(screen.getByTestId("plan-tab-body")).not.toHaveAttribute("aria-busy");
    await user.click(screen.getByRole("link", { name: "Summer" }));
    expect(push).toHaveBeenCalledWith("/plan?tab=summer");
    // The current tab is not reopened.
    await user.click(screen.getByRole("link", { name: "Next semester" }));
    expect(push).toHaveBeenCalledTimes(1);
    push.mockClear();
  });
});

function nextData(): NextSemesterData {
  return {
    termCode: "202602",
    termLabel: "Spring 2027",
    registrationTerm: "202602",
    report: {
      disclaimer: "Unofficial — verify in Degree Works",
      list: {
        termCode: "202602",
        choices: [{ rank: 1, crn: "20135", courseCode: "CSC 221", alternates: ["20136"] }],
      },
      conflicts: [],
      warnings: [],
      copyText: "x",
      details: [
        {
          rank: 1,
          choice: {
            crn: "20135",
            found: true,
            courseCode: "CSC 221",
            section: "A",
            title: "Data Structures",
            credits: 1,
            seats: null,
            registerAs: null,
            slots: [],
            flags: [],
          },
          alternates: [
            {
              crn: "20136",
              found: true,
              courseCode: "CSC 221",
              section: "B",
              title: "Data Structures",
              credits: 1,
              seats: null,
              registerAs: { crn: "20999", courseCode: "ENV 221", section: "B" },
              slots: [],
              flags: [],
            },
          ],
        },
      ],
    },
    sections: {
      "20135": {
        crn: "20135",
        courseCode: "CSC 221",
        section: "A",
        title: "Data Structures",
        meetings: [{ days: ["M", "W"], start: "10:30", end: "11:20", kind: "class", tba: false }],
        instructors: [],
      },
      "20136": {
        crn: "20136",
        courseCode: "CSC 221",
        section: "B",
        title: "Data Structures",
        meetings: [],
        instructors: [],
      },
    },
    deadlines: [
      {
        id: "calendar:open",
        title: "WebTree Open: Submit Spring 2027 Course Preferences",
        date: "2026-10-12",
        endDate: "2026-11-03",
        time: "07:00",
        source: "registrar",
        url: "https://www.davidson.edu/a",
      },
      {
        id: "calendar:schedules",
        title: "Schedules available",
        date: "2026-11-06",
        endDate: null,
        time: "17:00",
        source: "registrar",
        url: "https://www.davidson.edu/b",
      },
    ],
    planCourses: [],
    slotLabels: SLOT_LABELS,
    slotFillers: {},
  };
}

describe("Next semester tab", () => {
  it("shows the list, the disclaimer, a print link and the REGISTRAR-tagged dates", () => {
    render(<NextSemesterTab loaded={{ ok: true, data: nextData() }} now={NOW} timeZone={TZ} />);
    expect(screen.getByRole("heading", { name: "Spring 2027 WebTree list" })).toBeInTheDocument();
    expect(screen.getByText("Unofficial — verify in Degree Works.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Print view" })).toHaveAttribute(
      "href",
      "/plan?tab=next&view=print",
    );
    const dates = screen.getByTestId("registration-deadlines");
    const rows = within(dates).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute("data-source", "registrar");
    expect(rows[0]).toHaveTextContent("Source: Registrar");
    expect(rows[0]).toHaveTextContent("Mon, Oct 12, 7:00a – Tue, Nov 3");
    expect(rows[0]).toHaveTextContent("In 12 days");
    expect(within(rows[0]!).getByRole("link")).toHaveAttribute("rel", "noopener noreferrer");
    expect(rows[1]).toHaveTextContent("Fri, Nov 6, 5:00p");
  });

  it("an unavailable list is an error state", () => {
    render(
      <NextSemesterTab loaded={{ ok: false, message: "Schedule down." }} now={NOW} timeZone={TZ} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Schedule down.");
  });

  it("the print view is a table of ranks, CRNs (register-as CRNs), meetings and alternates", () => {
    render(<WebTreePrintView loaded={{ ok: true, data: nextData() }} now={NOW} timeZone={TZ} />);
    const table = screen.getByRole("table");
    const [, row] = within(table).getAllByRole("row");
    expect(row).toHaveTextContent("1");
    expect(row).toHaveTextContent("20135");
    expect(row).toHaveTextContent("CSC 221 AData Structures");
    expect(row).toHaveTextContent("MW 10:30a–11:20a");
    // A cross-listed alternate with no seats of its own prints its "Register as" CRN, like the copy text.
    const alternates = within(row!).getAllByRole("cell")[4]!;
    expect(alternates).toHaveTextContent("20999 CSC 221 B");
    expect(alternates).toHaveTextContent("Register as ENV 221 B");
    expect(alternates).not.toHaveTextContent("20136");
    expect(screen.getByText(/YOUR PLAN/)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Registration dates (REGISTRAR)" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Print" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the list" })).toHaveAttribute(
      "href",
      "/plan?tab=next",
    );
  });
});

function fourYear(overrides: Partial<FourYearData> = {}): FourYearData {
  const wri = planItem({ courseCode: "WRI 101", termCode: "202501", status: "completed" });
  const fake = planItem({
    courseCode: "FAKE 999",
    termCode: "202602",
    unverified: true,
    title: "Invented",
  });
  const pf = planItem({ courseCode: "ART 101", termCode: "202602", passFail: true });
  const ap = planItem({ courseCode: "MAT 113", termCode: null, source: "ap", status: "completed" });
  const reqs = Object.fromEntries(
    REQUIREMENT_SLOTS.map((s) => [s, "open"]),
  ) as PlanProgress["reqs"];
  reqs.COMP = "done";
  return {
    plan: {
      items: [wri, fake, pf, ap],
      summer: [],
      deadlines: [],
      manual: { languageExempt: false, pe: { lifetimeActivities: 1, teamSport: false } },
      legacy: true,
      updatedAt: null,
    },
    progress: {
      creditsDone: 2,
      creditsPlanned: 4,
      required: 32,
      reqs,
      filledBy: { COMP: [wri.id] },
      warnings: [
        { code: "pass-fail-term", message: "Only one P/F per term.", itemId: pf.id },
        { code: "residence-note", message: "At least 16 courses in residence." },
      ],
      disclaimer: "Unofficial — verify in Degree Works",
      catalogYear: "2025-2026",
      rulesExact: true,
      alsoTagged: {},
    },
    context: { graduationYear: 2029, firstTerm: "202501", standingOverride: null },
    planTerms: ["202501", "202502", "202503", "202601", "202602", "202603", "202701"],
    current: "202601",
    registration: "202602",
    slotLabels: SLOT_LABELS,
    disclaimer: "Unofficial — verify in Degree Works",
    ...overrides,
  };
}

describe("4-year plan tab", () => {
  it("renders the map, tracker, legacy notice, flags, warnings and every term", () => {
    render(<FourYearTab loaded={{ ok: true, data: fourYear() }} />);
    expect(screen.getByTestId("legacy-plan")).toHaveTextContent(
      "1 course could not be found in the catalog: edit or remove it.",
    );
    expect(screen.getByTestId("plan-map")).toBeInTheDocument();
    expect(screen.getByTestId("credit-summary")).toHaveTextContent(
      "2 of 32 credits done, 4 with courses in progress and planned. These totals include the AP/transfer credit that counts, which is not shown on the map.",
    );
    // The page never computes its own AP/transfer figure (the plan service caps and de-duplicates it).
    expect(screen.getByTestId("credit-summary")).not.toHaveTextContent(/\d+ credits? of AP/);
    expect(screen.getByText("Unofficial — verify in Degree Works.")).toBeInTheDocument();
    const tracker = screen.getByRole("list", { name: "Requirements tracker" });
    expect(within(tracker).getAllByRole("listitem")[0]).toHaveAttribute("data-status", "done");
    const fake = screen
      .getAllByTestId("plan-item")
      .find((el) => el.textContent?.includes("FAKE 999"))!;
    expect(fake).toHaveAttribute("data-unverified", "true");
    expect(fake).toHaveTextContent("Not found in the Davidson catalog — edit or remove");
    const art = screen
      .getAllByTestId("plan-item")
      .find((el) => el.textContent?.includes("ART 101"))!;
    expect(art).toHaveTextContent("Pass/Fail");
    expect(art).toHaveTextContent("Only one P/F per term.");
    expect(screen.getByTestId("plan-warnings")).toHaveTextContent(
      "At least 16 courses in residence.",
    );
    expect(screen.getByTestId("plan-warnings")).not.toHaveTextContent("P/F");
    const terms = screen.getAllByTestId("plan-term").map((el) => el.getAttribute("data-term"));
    // Summers only with something in them; AP before Davidson first.
    expect(terms).toEqual(["none", "202501", "202502", "202601", "202602", "202701"]);
    expect(
      screen.getByRole("checkbox", { name: "First Lifetime Activity course done" }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Second Lifetime Activity course done" }),
    ).not.toBeChecked();
  });

  it("edits a course: only the changed fields are patched", async () => {
    const user = userEvent.setup();
    const data = fourYear({ plan: { ...fourYear().plan, legacy: false } });
    const art = data.plan.items.find((i) => i.courseCode === "ART 101")!;
    const calls = stubFetch([
      200,
      { item: { ...art, passFail: false, termCode: "202701" }, warnings: [] },
    ]);
    render(<FourYearTab loaded={{ ok: true, data }} />);
    const row = screen
      .getAllByTestId("plan-item")
      .find((el) => el.textContent?.includes("ART 101"))!;
    await user.click(within(row).getByRole("button", { name: "Edit ART 101, Spring 2027" }));
    await user.click(within(row).getByRole("switch", { name: "Pass/Fail" }));
    await user.selectOptions(within(row).getByLabelText("Term", { exact: true }), "202701");
    await user.click(
      within(row).getByRole("button", { name: "Save changes to ART 101, Spring 2027" }),
    );
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({
      url: `/api/plan/items/${art.id}`,
      method: "PATCH",
      body: { passFail: false, termCode: "202701" },
    });
    expect(await within(row).findByText("Saved ART 101.")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("plans a retake of a completed course and removes a course", async () => {
    const user = userEvent.setup();
    const data = fourYear();
    const wri = data.plan.items.find((i) => i.courseCode === "WRI 101")!;
    const calls = stubFetch(
      [
        201,
        {
          item: { ...wri, id: "f".repeat(24), termCode: "202602", status: "planned" },
          warnings: [],
        },
      ],
      [204, null],
    );
    render(<FourYearTab loaded={{ ok: true, data }} />);
    const row = screen
      .getAllByTestId("plan-item")
      .find((el) => el.textContent?.includes("WRI 101"))!;
    await user.click(within(row).getByRole("button", { name: "Edit WRI 101, Fall 2025" }));
    expect(within(row).getByLabelText("Plan a retake in")).toHaveValue("202602");
    await user.click(within(row).getByRole("button", { name: "Plan retake of WRI 101" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({
      method: "POST",
      body: { termCode: "202602", courseCode: "WRI 101", status: "planned", source: "catalog" },
    });
    await user.click(within(row).getByRole("button", { name: "Remove WRI 101, Fall 2025" }));
    // Asks first, in the page.
    const ask = within(row).getByRole("group", {
      name: "Remove WRI 101, Fall 2025 from your plan?",
    });
    expect(within(ask).getByRole("button", { name: "Keep" })).toHaveFocus();
    expect(calls).toHaveLength(1);
    await user.click(within(ask).getByRole("button", { name: "Yes, remove" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toMatchObject({ method: "DELETE", url: `/api/plan/items/${wri.id}` });
    // The row leaves with the refresh: focus is on its term's heading.
    await waitFor(() => expect(document.activeElement).toHaveAttribute("id", "term-202501"));
  });

  it("removing the only AP course focuses 'Term by term' (its group goes away)", async () => {
    const user = userEvent.setup();
    const calls = stubFetch([204, null]);
    render(<FourYearTab loaded={{ ok: true, data: fourYear() }} />);
    const row = screen
      .getAllByTestId("plan-item")
      .find((el) => el.textContent?.includes("MAT 113"))!;
    await user.click(within(row).getByRole("button", { name: "Edit MAT 113" }));
    await user.click(within(row).getByRole("button", { name: "Remove MAT 113" }));
    await user.click(within(row).getByRole("button", { name: "Yes, remove" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Term by term" })).toHaveFocus(),
    );
  });

  it("a retake of AP credit is a planned Davidson catalog course", async () => {
    const user = userEvent.setup();
    const data = fourYear();
    const ap = data.plan.items.find((i) => i.courseCode === "MAT 113")!;
    const calls = stubFetch([
      201,
      { item: { ...ap, id: "e".repeat(24), termCode: "202602", source: "catalog" }, warnings: [] },
    ]);
    render(<FourYearTab loaded={{ ok: true, data }} />);
    const row = screen
      .getAllByTestId("plan-item")
      .find((el) => el.textContent?.includes("MAT 113"))!;
    await user.click(within(row).getByRole("button", { name: "Edit MAT 113" }));
    await user.click(within(row).getByRole("button", { name: "Plan retake of MAT 113" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.body).toEqual({
      termCode: "202602",
      courseCode: "MAT 113",
      status: "planned",
      source: "catalog",
    });
  });

  it("a rejected edit puts the form back to what is stored", async () => {
    const user = userEvent.setup();
    const data = fourYear({ plan: { ...fourYear().plan, legacy: false } });
    const calls = stubFetch([
      400,
      { error: { code: "validation", message: "That term is not allowed." } },
    ]);
    render(<FourYearTab loaded={{ ok: true, data }} />);
    const row = screen
      .getAllByTestId("plan-item")
      .find((el) => el.textContent?.includes("ART 101"))!;
    await user.click(within(row).getByRole("button", { name: "Edit ART 101, Spring 2027" }));
    await user.selectOptions(within(row).getByLabelText("Status"), "completed");
    await user.click(within(row).getByRole("switch", { name: "Pass/Fail" }));
    await user.selectOptions(within(row).getByLabelText("Term", { exact: true }), "202701");
    await user.click(
      within(row).getByRole("button", { name: "Save changes to ART 101, Spring 2027" }),
    );
    await waitFor(() => expect(calls).toHaveLength(1));
    await waitFor(() => expect(within(row).getByLabelText("Status")).toHaveValue("planned"));
    expect(within(row).getByRole("switch", { name: "Pass/Fail" })).toBeChecked();
    expect(within(row).getByLabelText("Term", { exact: true })).toHaveValue("202602");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("an unverified course asks to be edited or removed even after the plan is saved as v2", () => {
    const data = fourYear({ plan: { ...fourYear().plan, legacy: false } });
    render(<FourYearTab loaded={{ ok: true, data }} />);
    const fake = screen
      .getAllByTestId("plan-item")
      .find((el) => el.textContent?.includes("FAKE 999"))!;
    expect(fake).toHaveTextContent("Not found in the Davidson catalog — edit or remove");
    expect(fake).not.toHaveTextContent("entered by you");
    const manual = planItem({ courseCode: "XYZ 100", source: "manual", unverified: true });
    render(
      <FourYearTab
        loaded={{
          ok: true,
          data: fourYear({ plan: { ...data.plan, items: [...data.plan.items, manual] } }),
        }}
      />,
    );
    const row = screen
      .getAllByTestId("plan-item")
      .find((el) => el.textContent?.includes("XYZ 100"))!;
    expect(row).toHaveTextContent("Not found in the Davidson catalog — edit or remove");
  });

  it("saves the language toggle and the PE checklist", async () => {
    const user = userEvent.setup();
    const calls = stubFetch(
      [200, { manual: { languageExempt: true, pe: { lifetimeActivities: 1, teamSport: false } } }],
      [200, { manual: { languageExempt: true, pe: { lifetimeActivities: 2, teamSport: false } } }],
    );
    render(<FourYearTab loaded={{ ok: true, data: fourYear() }} />);
    await user.click(
      screen.getByRole("switch", { name: "I have language proficiency or an exemption" }),
    );
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({
      url: "/api/plan/manual",
      method: "PATCH",
      body: { languageExempt: true },
    });
    await user.click(
      screen.getByRole("checkbox", { name: "Second Lifetime Activity course done" }),
    );
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]!.body).toEqual({ pe: { lifetimeActivities: 2, teamSport: false } });
  });

  it("adds a manual transfer entry and explains a bad code", async () => {
    const user = userEvent.setup();
    const calls = stubFetch([
      201,
      {
        item: planItem({ courseCode: "CHE 115", termCode: null, source: "transfer" }),
        warnings: [],
      },
    ]);
    render(<FourYearTab loaded={{ ok: true, data: fourYear() }} />);
    const form = screen
      .getByRole("heading", { name: "Add transfer, AP or another course" })
      .closest("section")!;
    await user.type(within(form).getByLabelText("Course code"), "chemistry");
    await user.type(within(form).getByLabelText("Title"), "General Chemistry");
    await user.click(within(form).getByRole("button", { name: "Add to my plan" }));
    expect(within(form).getByText("Enter a course code such as CHE 115.")).toBeInTheDocument();
    expect(within(form).getByLabelText("Course code")).toHaveFocus();
    await user.clear(within(form).getByLabelText("Course code"));
    await user.type(within(form).getByLabelText("Course code"), "che115");
    await user.click(within(form).getByRole("button", { name: "Add to my plan" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.body).toEqual({
      termCode: null,
      courseCode: "CHE 115",
      source: "transfer",
      status: "completed",
      manualTitle: "General Chemistry",
      manualCredits: 1,
    });
  });
});

const DRAFT: PlanDraft = {
  id: "d".repeat(24),
  kind: "plan-suggestions",
  promptVersion: "v1",
  status: "pending",
  createdAt: "2026-09-30T16:00:00.000Z",
  items: [
    {
      termCode: "202602",
      courseCode: "HIS 101",
      reason: "Fills Historical Thought.",
      basis: "scheduled",
    },
    { termCode: "202602", courseCode: "CSC 221", reason: "Next in the CS sequence." },
    { termCode: "202701", courseCode: "ECO 101", reason: "An open SSRQ.", basis: "past-offerings" },
  ],
};

function suggestions(
  gate: { kind: "unverified" | "disabled" | "consent_required"; message: string } | null,
) {
  return {
    ok: true as const,
    data: {
      gate,
      drafts: gate ? [] : [DRAFT],
      items: [planItem({ courseCode: "CSC 221", termCode: "202602" })],
      registration: "202602",
      registrationLabel: "Spring 2027",
      targetTerms: ["202602", "202701"],
    },
  };
}

describe("Suggestions tab", () => {
  it("explains a closed AI gate with the step that helps", () => {
    const { unmount } = render(
      <SuggestionsTab
        loaded={suggestions({
          kind: "consent_required",
          message: "Turn on AI features in your profile to use this.",
        })}
        timeZone={TZ}
      />,
    );
    expect(screen.getByTestId("ai-gate")).toHaveTextContent("Turn on AI features in your profile");
    expect(screen.getByRole("link", { name: "Open your profile" })).toHaveAttribute(
      "href",
      "/profile",
    );
    expect(screen.queryByTestId("suggestion")).toBeNull();
    unmount();
    render(
      <SuggestionsTab
        loaded={suggestions({ kind: "disabled", message: "AI features are turned off." })}
        timeZone={TZ}
      />,
    );
    expect(screen.getByTestId("ai-gate")).toHaveTextContent("AI features are turned off.");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("lists every term with each course's state, the AI chip and the basis note", () => {
    render(<SuggestionsTab loaded={suggestions(null)} timeZone={TZ} />);
    const draft = screen.getByTestId("suggestion-draft");
    expect(draft).toHaveTextContent("AI · verify with your advisor");
    expect(within(draft).getByRole("heading", { name: "Spring 2027" })).toBeInTheDocument();
    expect(within(draft).getByRole("heading", { name: "Fall 2027" })).toBeInTheDocument();
    const rows = within(draft).getAllByTestId("suggestion");
    expect(rows.map((r) => r.getAttribute("data-state"))).toEqual([
      "pending",
      "in-plan",
      "pending",
    ]);
    expect(rows[1]).toHaveTextContent("In your plan");
    expect(rows[2]).toHaveTextContent("Not yet scheduled — based on past offerings");
    expect(within(rows[0]!).getByRole("link")).toHaveAttribute("href", "/courses/202602/HIS-101");
    expect(screen.getByRole("button", { name: "Suggest again" })).toBeInTheDocument();
  });

  it("accepts one course (ai-draft), sets one aside, then closes the draft as dismissed", async () => {
    const user = userEvent.setup();
    const calls = stubFetch(
      [
        201,
        {
          item: planItem({ courseCode: "HIS 101", termCode: "202602", source: "ai-draft" }),
          warnings: [],
        },
      ],
      [409, { error: { code: "conflict", message: "Already in your plan." } }],
      [200, { draft: { ...DRAFT, status: "dismissed" }, added: [] }],
    );
    render(<SuggestionsTab loaded={suggestions(null)} timeZone={TZ} />);
    const rows = () => screen.getAllByTestId("suggestion");
    await user.click(within(rows()[0]!).getByRole("button", { name: /^Add to plan/ }));
    await waitFor(() => expect(rows()[0]).toHaveAttribute("data-state", "in-plan"));
    // The pressed button left the page: focus is on the row's new "In your plan" status.
    expect(within(rows()[0]!).getByText("In your plan").closest("[data-row-focus]")).toHaveFocus();
    expect(calls[0]).toEqual({
      url: "/api/plan/items",
      method: "POST",
      body: { termCode: "202602", courseCode: "HIS 101", source: "ai-draft" },
    });
    await user.click(within(rows()[2]!).getByRole("button", { name: /^Not for me/ }));
    expect(rows()[2]).toHaveAttribute("data-state", "rejected");
    expect(within(rows()[2]!).getByRole("button", { name: /^Undo/ })).toHaveFocus();
    await user.click(within(rows()[2]!).getByRole("button", { name: /^Undo/ }));
    expect(rows()[2]).toHaveAttribute("data-state", "pending");
    expect(within(rows()[2]!).getByRole("button", { name: /^Add to plan/ })).toHaveFocus();
    // A 409 means it is already there: accepted, no error.
    await user.click(within(rows()[2]!).getByRole("button", { name: /^Add to plan/ }));
    await waitFor(() => expect(rows()[2]).toHaveAttribute("data-state", "in-plan"));
    expect(screen.queryByRole("alert")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Done with these suggestions" }));
    await waitFor(() => expect(calls).toHaveLength(3));
    expect(calls[2]).toEqual({
      url: `/api/plan/drafts/${DRAFT.id}`,
      method: "PATCH",
      body: { status: "accepted" },
    });
    await waitFor(() => expect(screen.getByLabelText("Suggest courses for")).toHaveFocus());
  });

  it("'Dismiss all' asks first", async () => {
    const user = userEvent.setup();
    const calls = stubFetch([200, { draft: { ...DRAFT, status: "dismissed" }, added: [] }]);
    render(<SuggestionsTab loaded={suggestions(null)} timeZone={TZ} />);
    await user.click(screen.getByRole("button", { name: "Dismiss all" }));
    const ask = screen.getByRole("group", {
      name: "Dismiss all of these suggestions? They cannot be brought back.",
    });
    expect(within(ask).getByRole("button", { name: "Keep" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Dismiss all" })).toHaveFocus();
    expect(calls).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Dismiss all" }));
    await user.click(screen.getByRole("button", { name: "Yes, dismiss all" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ method: "PATCH", body: { status: "dismissed" } });
  });

  it("asks for new suggestions and shows an AI failure in words", async () => {
    const user = userEvent.setup();
    const calls = stubFetch(
      [429, { kind: "quota", message: "You have used today's AI requests. They reset tomorrow." }],
      [
        200,
        {
          kind: "ok",
          data: { draft: DRAFT },
          servedModel: "claude-sonnet-5-5",
          fallbackUsed: false,
          cached: false,
        },
      ],
    );
    render(<SuggestionsTab loaded={suggestions(null)} timeZone={TZ} />);
    await user.selectOptions(screen.getByLabelText("Suggest courses for"), "202701");
    await user.click(screen.getByRole("button", { name: "Suggest again" }));
    expect(
      await screen.findByText("You have used today's AI requests. They reset tomorrow."),
    ).toBeInTheDocument();
    expect(calls[0]).toEqual({
      url: "/api/ai/plan-suggestions",
      method: "POST",
      body: { termCode: "202701", regenerate: true },
    });
    await user.click(screen.getByRole("button", { name: "Suggest again" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});

describe("Summer", () => {
  const ACTIVITY = {
    id: "a".repeat(24),
    termCode: "202603",
    title: "Lab job",
    kind: "job" as const,
  };

  it("adds, edits and removes summer plans", async () => {
    const user = userEvent.setup();
    const calls = stubFetch(
      [201, { activity: { ...ACTIVITY, id: "b".repeat(24), title: "Internship at X" } }],
      [200, { activity: { ...ACTIVITY, organization: "Biology" } }],
      [204, null],
    );
    render(
      <SummerEditor
        activities={[ACTIVITY]}
        summerTerms={["202503", "202603", "202703"]}
        defaultTerm="202603"
      />,
    );
    const row = screen.getByTestId("summer-activity");
    expect(row).toHaveTextContent("Summer 2027");
    expect(row).toHaveAttribute("data-source", "my-plan");
    expect(row).toHaveTextContent("Source: Your plan");

    const form = screen.getByRole("heading", { name: "Add a summer plan" }).closest("section")!;
    expect(within(form).getByLabelText("Summer")).toHaveValue("202603");
    await user.click(within(form).getByRole("button", { name: "Add summer plan" }));
    expect(within(form).getByText("Give it a title.")).toBeInTheDocument();
    await user.type(within(form).getByLabelText("Title"), "Internship at X");
    await user.click(within(form).getByRole("button", { name: "Add summer plan" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({
      url: "/api/plan/summer",
      method: "POST",
      body: { termCode: "202603", title: "Internship at X", kind: "internship" },
    });

    await user.click(within(row).getByRole("button", { name: "Edit Lab job" }));
    const editing = screen.getAllByTestId("summer-activity")[0]!;
    // Opening the editor focuses its first field; Cancel goes back to the row's Edit button.
    expect(within(editing).getByLabelText("Summer")).toHaveFocus();
    await user.click(within(editing).getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Edit Lab job" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Edit Lab job" }));
    await user.type(within(editing).getByLabelText("Organization (optional)"), "Biology");
    await user.click(within(editing).getByRole("button", { name: "Save Lab job" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toEqual({
      url: `/api/plan/summer/${ACTIVITY.id}`,
      method: "PATCH",
      body: { termCode: "202603", title: "Lab job", kind: "job", organization: "Biology" },
    });
    // Saved: back on the Edit button.
    await waitFor(() => expect(screen.getByRole("button", { name: "Edit Lab job" })).toHaveFocus());

    // Remove asks first: Escape keeps it, "Yes, remove" removes it.
    await user.click(await screen.findByRole("button", { name: "Remove Lab job" }));
    const confirm = screen.getByRole("group", { name: "Remove Lab job?" });
    expect(within(confirm).getByRole("button", { name: "Keep" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Remove Lab job" })).toHaveFocus();
    expect(calls).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Remove Lab job" }));
    await user.click(screen.getByRole("button", { name: "Yes, remove" }));
    await waitFor(() => expect(calls).toHaveLength(3));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Add a summer plan" })).toHaveFocus(),
    );
    expect(calls[2]).toMatchObject({ method: "DELETE", url: `/api/plan/summer/${ACTIVITY.id}` });
  });

  it("an empty list says so", () => {
    render(<SummerEditor activities={[]} summerTerms={[]} defaultTerm={null} />);
    expect(screen.getByRole("heading", { name: "No summer plans yet" })).toBeInTheDocument();
    expect(screen.getByText("Your plan has no summers left.")).toBeInTheDocument();
  });
});
