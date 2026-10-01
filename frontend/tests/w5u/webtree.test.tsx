import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebTreeList } from "@/lib/types/plan";
import {
  WebTreeEditor,
  type WebTreeEditorProps,
} from "@/app/(hub)/plan/_components/webtree-editor";
import { CopyForWebTree } from "@/app/(hub)/plan/_components/copy-for-webtree";
import type { SectionDetail } from "@/app/(hub)/plan/_components/choice-card";
import { SLOT_LABELS, stubFetch } from "./dom-helpers";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeEach(() => refresh.mockClear());
afterEach(() => vi.unstubAllGlobals());

const meeting = (start: string, end: string) => ({
  days: ["M", "W", "F"] as ("M" | "W" | "F")[],
  start,
  end,
  kind: "class" as const,
  tba: false,
});

const SECTIONS: WebTreeEditorProps["sections"] = {
  "20135": {
    crn: "20135",
    courseCode: "CSC 221",
    section: "A",
    title: "Data Structures",
    meetings: [meeting("10:30", "11:20")],
    instructors: ["Katy Williams"],
  },
  "20136": {
    crn: "20136",
    courseCode: "CSC 221",
    section: "B",
    title: "Data Structures",
    meetings: [meeting("11:30", "12:20")],
  },
  "20478": {
    crn: "20478",
    courseCode: "SPA 201",
    section: "B",
    title: "Spanish",
    meetings: [meeting("10:30", "11:20")],
  },
};

function detail(crn: string, overrides: Partial<SectionDetail> = {}): SectionDetail {
  const s = SECTIONS[crn]!;
  return {
    crn,
    found: true,
    courseCode: s.courseCode,
    section: s.section,
    title: s.title,
    credits: 1,
    seats: { current: 22, max: 24, remaining: 2, open: 2, overEnrolled: false, pressure: 0.92 },
    registerAs: null,
    slots: [],
    flags: [],
    ...overrides,
  };
}

const LIST: WebTreeList = {
  termCode: "202602",
  choices: [
    { rank: 1, crn: "20135", courseCode: "CSC 221", alternates: ["20136"] },
    { rank: 2, crn: "20478", courseCode: "SPA 201", alternates: [] },
  ],
};

function props(overrides: Partial<WebTreeEditorProps> = {}): WebTreeEditorProps {
  return {
    termCode: "202602",
    termLabel: "Spring 2027",
    list: LIST,
    details: {
      "20135": detail("20135", {
        slots: [{ slot: "MQRQ", code: "MQRQ", status: "planned" }],
      }),
      "20136": detail("20136"),
      "20478": detail("20478", {
        slots: [{ slot: "FRLG", code: "FRLG", status: "open" }],
        flags: [{ code: "permission-required", message: "SPA 201 B needs instructor permission." }],
      }),
    },
    sections: SECTIONS,
    conflicts: [
      {
        a: { crn: "20135", courseCode: "CSC 221" },
        b: { crn: "20478", courseCode: "SPA 201" },
        day: "M",
        start: "10:30",
        end: "11:20",
      },
    ],
    warnings: [
      { code: "permission-required", message: "SPA 201 B needs instructor permission." },
      {
        code: "already-completed",
        message: "SPA 201: already completed in Fall 2025 — plan a retake?",
      },
    ],
    copyText: "Spring 2027 WebTree preferences\n1. CRN 20135  CSC 221 A  Data Structures",
    planCourses: [],
    slotLabels: SLOT_LABELS,
    slotFillers: { MQRQ: { courseCode: "CSC 221", termCode: "202602" } },
    ...overrides,
  };
}

const saved = (list: WebTreeList) =>
  [200, { list, conflicts: [], warnings: [] }] as [number, unknown];

describe("WebTreeEditor", () => {
  it("shows each choice with meetings, seats, pressure, slots, flags and its alternates", () => {
    render(<WebTreeEditor {...props()} />);
    const [first, second] = screen.getAllByTestId("webtree-choice");
    expect(first).toHaveTextContent("CRN 20135");
    expect(first).toHaveTextContent("MWF 10:30a–11:20a");
    expect(first).toHaveTextContent("Katy Williams");
    expect(first).toHaveTextContent("Nearly full: list an alternate");
    expect(first).toHaveTextContent("Fills Label MQRQ in your plan");
    expect(first).toHaveTextContent("Time conflict");
    expect(within(first!).getByRole("list", { name: "Alternates for choice 1" })).toHaveTextContent(
      "CSC 221 B",
    );
    expect(second).toHaveTextContent("Would fill Label FRLG");
    expect(second).toHaveTextContent("SPA 201 B needs instructor permission.");
    // The conflict sentence and the warnings not tied to a section.
    expect(screen.getByTestId("webtree-conflicts")).toHaveTextContent(
      "Choice 1, CSC 221 A (CRN 20135) and choice 2, SPA 201 B (CRN 20478) meet at the same time on Mon (10:30a–11:20a).",
    );
    const others = screen.getByRole("list", { name: "Other checks" });
    expect(others).toHaveTextContent("already completed in Fall 2025");
    expect(others).not.toHaveTextContent("instructor permission");
    // First choices are on the week grid.
    expect(
      screen.getAllByLabelText(/Your Spring 2027 week with every first choice/).length,
    ).toBeGreaterThan(0);
  });

  it("reorders with the keyboard, saves the whole list, keeps focus and refreshes", async () => {
    const user = userEvent.setup();
    const reordered: WebTreeList = {
      termCode: "202602",
      choices: [
        { rank: 1, crn: "20478", courseCode: "SPA 201", alternates: [] },
        { rank: 2, crn: "20135", courseCode: "CSC 221", alternates: ["20136"] },
      ],
    };
    const calls = stubFetch(saved(reordered));
    render(<WebTreeEditor {...props()} />);
    expect(screen.getByRole("button", { name: "Move up CSC 221 A" })).toBeDisabled();
    screen.getByRole("button", { name: "Move up SPA 201 B" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getAllByTestId("webtree-choice")[0]).toHaveTextContent("SPA 201");
    // At the top, "Move up" is disabled: focus moves to its "Move down".
    expect(screen.getByRole("button", { name: "Move down SPA 201 B" })).toHaveFocus();
    await waitFor(() => expect(screen.getByTestId("webtree-status")).toHaveTextContent("Saved."));
    expect(calls).toEqual([{ url: "/api/plan/webtree", method: "PUT", body: reordered }]);
    expect(refresh).toHaveBeenCalled();
  });

  it("reverts and explains when a save fails", async () => {
    const user = userEvent.setup();
    stubFetch([
      400,
      {
        error: {
          code: "validation_failed",
          message: "Some WebTree choices are invalid.",
          issues: [{ path: "choices.0.crn", message: "CRN 20478 is not a Spring 2027 section." }],
        },
      },
    ]);
    render(<WebTreeEditor {...props()} />);
    await user.click(screen.getByRole("button", { name: "Move up SPA 201 B" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Some WebTree choices are invalid. CRN 20478 is not a Spring 2027 section.",
    );
    expect(screen.getAllByTestId("webtree-choice")[0]).toHaveTextContent("CSC 221");
  });

  it("promotes and removes alternates, removes choices", async () => {
    const user = userEvent.setup();
    const calls = stubFetch(saved(LIST), saved(LIST), saved(LIST));
    render(<WebTreeEditor {...props()} />);
    await user.click(screen.getByRole("button", { name: "Make choice 1 (CSC 221 B)" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.body).toEqual({
      termCode: "202602",
      choices: [
        { rank: 1, crn: "20136", courseCode: "CSC 221", alternates: ["20135"] },
        { rank: 2, crn: "20478", courseCode: "SPA 201", alternates: [] },
      ],
    });
    await user.click(screen.getByRole("button", { name: "Remove alternate CSC 221 A" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect((calls[1]!.body as WebTreeList).choices[0]!.alternates).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Remove SPA 201 B" }));
    await waitFor(() => expect(calls).toHaveLength(3));
    expect((calls[2]!.body as WebTreeList).choices.map((c) => c.crn)).toEqual(["20136"]);
  });

  it("adds a section from a catalog search, as a choice or as an alternate", async () => {
    const user = userEvent.setup();
    const empty: WebTreeList = { termCode: "202602", choices: [] };
    const course = {
      course: {
        termCode: "202602",
        code: "HIS 101",
        title: "World History",
        topics: false,
        credits: [1],
        reqCodes: ["HTRQ"],
        sections: [
          {
            crn: "21001",
            termCode: "202602",
            courseCode: "HIS 101",
            subject: "HIS",
            number: "101",
            section: "A",
            title: "World History",
            credits: 1,
            instructors: [{ first: "Ann", last: "Lee", isStaff: false }],
            meetings: [meeting("09:30", "10:20")],
            enrollment: { current: 5, max: 20, remaining: 15 },
            reqCodes: ["HTRQ"],
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
            registrationSections: [],
          },
        ],
      },
      asOf: null,
    };
    const calls = stubFetch(
      [
        200,
        {
          term: "202602",
          items: [
            {
              termCode: "202602",
              code: "HIS 101",
              title: "World History",
              topics: false,
              credits: [1],
              reqCodes: ["HTRQ"],
              sectionCount: 1,
              openSeats: 15,
              instructorNames: ["Ann Lee"],
              crossListings: [],
              hasTba: false,
            },
          ],
          total: 1,
          page: 1,
          pageSize: 8,
          asOf: null,
        },
      ],
      [200, course],
      saved({
        termCode: "202602",
        choices: [{ rank: 1, crn: "21001", courseCode: "HIS 101", alternates: [] }],
      }),
    );
    render(<WebTreeEditor {...props({ list: empty, details: {}, conflicts: [], warnings: [] })} />);
    expect(screen.getByRole("heading", { name: "No Spring 2027 choices yet" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Search the Spring 2027 schedule"), "world");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(await screen.findByRole("button", { name: "Choose a section of HIS 101" }));
    const radio = await screen.findByRole("radio", { name: /CRN 21001/ });
    expect(radio).toBeChecked();
    expect(screen.getByTestId("section-picker")).toHaveTextContent("15 of 20 seats open");
    await user.click(screen.getByRole("button", { name: "Add as choice 1" }));
    await waitFor(() => expect(calls).toHaveLength(3));
    expect(calls[0]!.url).toBe("/api/catalog/search?term=202602&q=world&pageSize=8");
    expect(calls[1]!.url).toBe("/api/catalog/courses/202602/HIS-101");
    expect(calls[2]).toMatchObject({
      method: "PUT",
      body: {
        termCode: "202602",
        choices: [{ rank: 1, crn: "21001", courseCode: "HIS 101", alternates: [] }],
      },
    });
    // While the report is not refreshed, the new choice shows what the picker knew.
    expect(screen.getByTestId("webtree-choice")).toHaveTextContent("MWF 9:30a–10:20a");
  });

  it("'Add alternate' targets that choice and focuses the search", async () => {
    const user = userEvent.setup();
    render(<WebTreeEditor {...props()} />);
    await user.click(screen.getByRole("button", { name: "Add alternate for SPA 201 B" }));
    expect(screen.getByLabelText("Search the Spring 2027 schedule")).toHaveFocus();
    expect(screen.getByLabelText("Add as")).toHaveValue("2");
  });

  it("offers the term's plan courses, preselecting the plan's section", async () => {
    const user = userEvent.setup();
    stubFetch([
      200,
      {
        course: {
          termCode: "202602",
          code: "CSC 221",
          title: "Data Structures",
          topics: false,
          credits: [1],
          reqCodes: [],
          sections: ["20135", "20136"].map((crn, i) => ({
            crn,
            termCode: "202602",
            courseCode: "CSC 221",
            subject: "CSC",
            number: "221",
            section: i ? "B" : "A",
            title: "Data Structures",
            credits: 1,
            instructors: [],
            meetings: [],
            enrollment: { current: 0, max: 0, remaining: 0 },
            reqCodes: null,
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
            registrationSections: [],
          })),
        },
        asOf: null,
      },
    ]);
    render(
      <WebTreeEditor
        {...props({
          list: { termCode: "202602", choices: [] },
          details: {},
          conflicts: [],
          warnings: [],
          planCourses: [{ courseCode: "CSC 221", title: "Data Structures", crn: "20136" }],
        })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Choose a section of CSC 221" }));
    expect(await screen.findByRole("radio", { name: /CRN 20136/ })).toBeChecked();
    expect(screen.getByTestId("section-picker")).toHaveTextContent(
      "Time TBA · no seats of its own",
    );
  });

  it("a section gone from the schedule says so", () => {
    render(
      <WebTreeEditor
        {...props({
          details: {
            ...props().details,
            "20478": { ...detail("20478"), found: false, seats: null },
          },
        })}
      />,
    );
    expect(screen.getAllByTestId("webtree-choice")[1]).toHaveTextContent(
      "CRN 20478 is no longer in the schedule. Remove it or pick another section.",
    );
  });
});

describe("CopyForWebTree", () => {
  const TEXT = "Spring 2027 WebTree preferences\n1. CRN 20135  CSC 221 A  Data Structures";

  it("copies the plain text to the clipboard", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<CopyForWebTree text={TEXT} />);
    await user.click(screen.getByRole("button", { name: "Copy for WebTree" }));
    expect(writeText).toHaveBeenCalledWith(TEXT);
    expect(await screen.findByText(/Copied\. Paste it next to WebTree/)).toBeInTheDocument();
  });

  it("falls back to selected text when the clipboard is refused", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<CopyForWebTree text={TEXT} />);
    const box = screen.getByLabelText("WebTree preferences as text", { selector: "textarea" });
    expect(box).not.toBeVisible();
    await user.click(screen.getByRole("button", { name: "Copy for WebTree" }));
    expect(await screen.findByText(/didn’t allow copying/)).toBeInTheDocument();
    expect(box).toBeVisible();
    expect(box).toHaveFocus();
    expect(box).toHaveValue(TEXT);
    expect(screen.getByRole("button", { name: "Hide the text" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("waits while the list is saving", () => {
    render(<CopyForWebTree text={TEXT} disabled disabledReason="Saving your changes…" />);
    expect(screen.getByRole("button", { name: "Copy for WebTree" })).toBeDisabled();
    expect(screen.getByText("Saving your changes…")).toBeInTheDocument();
  });
});
