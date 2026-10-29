import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRouter } from "next/navigation";
import { SyllabiBoard } from "@/app/(hub)/syllabi/_components/syllabi-board";
import { ReviewDeadlines } from "@/app/(hub)/syllabi/_components/review-deadlines";
import { MoodlePanel } from "@/app/(hub)/syllabi/_components/moodle-panel";
import { PasteForm } from "@/app/(hub)/syllabi/_components/paste-form";
import { SyllabusList } from "@/app/(hub)/syllabi/_components/syllabus-list";
import { MAX_SYLLABUS_CHARS } from "@/lib/syllabus-text";
import type { MoodleStatus } from "@/lib/types/moodle";
import type { Syllabus } from "@/lib/types/syllabus";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));

// Radix Checkbox measures itself (jsdom has no ResizeObserver).
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

type Call = { url: string; method: string; body: unknown };

/** Answers callApi's fetches in order. */
function stubFetch(...answers: [number, unknown][]): Call[] {
  const calls: Call[] = [];
  const queue = [...answers];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
      calls.push({ url, method: init.method ?? "GET", body });
      const [status, answerBody] = queue.shift() ?? [500, {}];
      if (status === 204) return new Response(null, { status });
      return new Response(JSON.stringify(answerBody), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return calls;
}

const refresh = vi.fn();
beforeEach(() => {
  vi.mocked(useRouter).mockReturnValue({ refresh } as never);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(useRouter).mockReset();
  refresh.mockReset();
});

function syllabus(overrides: Partial<Syllabus> = {}): Syllabus {
  return {
    id: "0123456789abcdef01234567",
    courseCode: "CSC 221",
    termCode: "202601",
    addedAt: "2026-09-30T12:00:00.000Z",
    extractedDeadlines: [
      { title: "Midterm exam", dueAt: "2026-10-15" },
      { title: "Final paper", dueAt: "2026-12-03" },
    ],
    planDeadlineCount: 0,
    ...overrides,
  };
}

const TERMS = [
  { code: "202601", label: "Fall 2026", start: "2026-08-24", end: "2026-12-16" },
  { code: "202602", label: "Spring 2027", start: "2027-01-13", end: "2027-05-07" },
];

const TEXT = "CSC 221 schedule. Midterm exam on October 15. Final paper due December 3.";

const OK = (made: Syllabus) => ({
  kind: "ok",
  data: { syllabus: made },
  servedModel: "mock",
  fallbackUsed: false,
  cached: false,
});

/** user.type is slow for long text: paste it like a student would. */
async function pasteText(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.click(screen.getByLabelText("Syllabus text"));
  await user.paste(text);
}

describe("PasteForm", () => {
  it("rejects an invalid course code or too little text before sending anything", async () => {
    const user = userEvent.setup();
    const calls = stubFetch();
    const onAdded = vi.fn();
    render(<PasteForm terms={TERMS} defaultTerm="202601" gate="ready" onAdded={onAdded} />);
    await user.type(screen.getByLabelText("Course"), "not a code");
    await pasteText(user, TEXT);
    await user.click(screen.getByRole("button", { name: /Find deadlines/ }));
    expect(screen.getByRole("alert")).toHaveTextContent(/Enter a course code/);

    await user.clear(screen.getByLabelText("Course"));
    await user.type(screen.getByLabelText("Course"), "CSC 221");
    await user.clear(screen.getByLabelText("Syllabus text"));
    await pasteText(user, "Oct 15");
    await user.click(screen.getByRole("button", { name: /Find deadlines/ }));
    expect(screen.getByRole("alert")).toHaveTextContent(/too little here/);
    expect(calls).toHaveLength(0);
    expect(onAdded).not.toHaveBeenCalled();
  });

  it(`counts characters against the ${MAX_SYLLABUS_CHARS.toLocaleString("en-US")} limit and refuses more`, async () => {
    const user = userEvent.setup();
    const calls = stubFetch();
    render(<PasteForm terms={TERMS} defaultTerm="202601" gate="ready" onAdded={vi.fn()} />);
    await pasteText(user, TEXT);
    expect(screen.getByText(`${TEXT.length} of 20,000 characters`)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Course"), "CSC 221");
    await pasteText(user, "x".repeat(MAX_SYLLABUS_CHARS));
    expect(screen.getByText(/20,0\d\d of 20,000 characters/)).toBeInTheDocument();
    expect(screen.getByText(/too long/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Find deadlines/ }));
    expect(screen.getByRole("alert")).toHaveTextContent(/paste at most 20,000/);
    expect(calls).toHaveLength(0);
  });

  it("sends the normalised course, the term and the text; refreshes the list and reports the syllabus", async () => {
    const user = userEvent.setup();
    const made = syllabus();
    const calls = stubFetch([200, OK(made)]);
    const onAdded = vi.fn();
    render(<PasteForm terms={TERMS} defaultTerm="202601" gate="ready" onAdded={onAdded} />);
    expect(screen.getByTestId("syllabus-disclosure")).toHaveTextContent(/Anthropic/);
    expect(screen.getByLabelText("Term")).toHaveValue("202601");
    await user.type(screen.getByLabelText("Course"), "csc221");
    await pasteText(user, TEXT);
    await user.click(screen.getByRole("button", { name: /Find deadlines/ }));
    expect(await screen.findByRole("button", { name: /Find deadlines/ })).toBeEnabled();
    expect(calls[0]).toMatchObject({
      method: "POST",
      url: "/api/syllabi",
      body: { courseCode: "CSC 221", termCode: "202601", text: TEXT },
    });
    expect(onAdded).toHaveBeenCalledWith(made);
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByLabelText("Syllabus text")).toHaveValue("");
  });

  it("warns before replacing a course and term that already has a syllabus, with its plan deadlines", async () => {
    const user = userEvent.setup();
    render(
      <PasteForm
        terms={TERMS}
        defaultTerm="202601"
        gate="ready"
        syllabi={[syllabus({ planDeadlineCount: 2 })]}
        onAdded={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("syllabus-replace-warning")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Course"), "csc 221");
    expect(screen.getByTestId("syllabus-replace-warning")).toHaveTextContent(
      "You already added a syllabus for CSC 221, Fall 2026. This one replaces it and removes the 2 deadlines it added to your plan.",
    );
    expect(screen.getByRole("button", { name: /Replace and find deadlines/ })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Term"), "202602");
    expect(screen.queryByTestId("syllabus-replace-warning")).not.toBeInTheDocument();
  });

  it("shows an AiResult failure (e.g. quota) instead of calling onAdded", async () => {
    const user = userEvent.setup();
    stubFetch([429, { kind: "quota", message: "You have used today's AI requests." }]);
    const onAdded = vi.fn();
    render(<PasteForm terms={TERMS} defaultTerm="202601" gate="ready" onAdded={onAdded} />);
    await user.type(screen.getByLabelText("Course"), "CSC 221");
    await pasteText(user, TEXT);
    await user.click(screen.getByRole("button", { name: /Find deadlines/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/today's AI requests/);
    expect(onAdded).not.toHaveBeenCalled();
  });

  it("replaces the form with a gate notice while AI is unverified or needs consent", () => {
    render(
      <PasteForm terms={TERMS} defaultTerm="202601" gate="consent_required" onAdded={vi.fn()} />,
    );
    expect(screen.getByTestId("syllabi-gate")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Turn on AI features/ })).toBeInTheDocument();
    expect(screen.queryByLabelText("Course")).not.toBeInTheDocument();
  });
});

describe("ReviewDeadlines", () => {
  it("says when nothing was found, with no form", () => {
    render(<ReviewDeadlines syllabusId="x" courseCode="CSC 221" deadlines={[]} onDone={vi.fn()} />);
    expect(screen.getByTestId("review-empty")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add/ })).not.toBeInTheDocument();
  });

  it("marks the list as AI output, sends the rows still listed with any edits, and calls onDone", async () => {
    const user = userEvent.setup();
    const calls = stubFetch([
      201,
      {
        deadlines: [
          {
            id: "fedcba9876543210fedcba98",
            title: "Midterm exam, edited",
            dueAt: "2026-10-16T03:59:00.000Z",
            origin: "syllabus",
          },
        ],
        added: 1,
      },
    ]);
    const onDone = vi.fn();
    render(
      <ReviewDeadlines
        syllabusId="0123456789abcdef01234567"
        courseCode="CSC 221"
        deadlines={[
          { title: "Midterm exam", dueAt: "2026-10-15" },
          { title: "Final paper", dueAt: "2026-12-03" },
        ]}
        onDone={onDone}
      />,
    );
    expect(screen.getByText(/AI-generated content/)).toBeInTheDocument();
    const rows = screen.getAllByTestId("syllabus-deadline-row");
    expect(rows).toHaveLength(2);
    // No checkboxes: Remove is the one way to leave a row out.
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await user.click(within(rows[1]!).getByRole("button", { name: /Remove/ }));
    await user.clear(within(rows[0]!).getByLabelText("Title"));
    await user.type(within(rows[0]!).getByLabelText("Title"), "Midterm exam, edited");
    await user.click(screen.getByRole("button", { name: /Add 1 deadline to plan/ }));
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(calls[0]!.body).toEqual({
      deadlines: [{ title: "Midterm exam, edited", dueAt: "2026-10-15" }],
    });
  });

  it("flags a date outside the syllabus's term", () => {
    render(
      <ReviewDeadlines
        syllabusId="x"
        courseCode="CSC 221"
        deadlines={[
          { title: "Midterm exam", dueAt: "2026-10-15" },
          { title: "Final paper", dueAt: "2027-12-03" },
        ]}
        term={TERMS[0]}
        onDone={vi.fn()}
      />,
    );
    const [inside, outside] = screen.getAllByTestId("syllabus-deadline-row");
    expect(inside).not.toHaveAttribute("data-outside-term");
    expect(outside).toHaveAttribute("data-outside-term", "true");
    expect(outside).toHaveTextContent("Outside Fall 2026 (Aug 24 – Dec 16): check this date.");
  });

  it("removing every row disables Add", async () => {
    const user = userEvent.setup();
    render(
      <ReviewDeadlines
        syllabusId="x"
        courseCode="CSC 221"
        deadlines={[{ title: "Midterm exam", dueAt: "2026-10-15" }]}
        onDone={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Remove/ }));
    expect(screen.getByRole("button", { name: /Add 0 deadlines to plan/ })).toBeDisabled();
  });
});

describe("SyllabusList", () => {
  it("says when there are no syllabi yet", () => {
    render(<SyllabusList syllabi={[]} reviewingId={null} onReview={vi.fn()} onReplace={vi.fn()} />);
    expect(screen.getByText("No syllabi yet")).toBeInTheDocument();
  });

  it("lists each syllabus with its course, term, deadlines found and in the plan", () => {
    render(
      <SyllabusList
        syllabi={[syllabus({ planDeadlineCount: 1 })]}
        reviewingId={null}
        onReview={vi.fn()}
        onReplace={vi.fn()}
      />,
    );
    const row = screen.getByTestId("syllabus-row");
    expect(row).toHaveTextContent("CSC 221");
    expect(row).toHaveTextContent("Fall 2026");
    expect(row).toHaveTextContent("Added Sep 30 · 2 deadlines found · 1 in your plan");
  });

  it("deletes after confirming, saying how many plan deadlines go with it", async () => {
    const user = userEvent.setup();
    const calls = stubFetch([204, null]);
    render(
      <SyllabusList
        syllabi={[syllabus({ planDeadlineCount: 2 })]}
        reviewingId={null}
        onReview={vi.fn()}
        onReplace={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /^Delete/ }));
    expect(calls).toHaveLength(0); // not yet: the confirm step is up first
    expect(screen.getByTestId("confirm")).toHaveTextContent(
      "This also removes the 2 deadlines it added to your plan.",
    );
    await user.click(screen.getByRole("button", { name: "Yes, delete" }));
    expect(await screen.findByRole("button", { name: /^Delete/ })).toBeInTheDocument();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: "DELETE",
      url: "/api/syllabi/0123456789abcdef01234567",
    });
  });
});

const NOT_CONNECTED: MoodleStatus = {
  connected: false,
  connectedAt: null,
  lastSyncedAt: null,
  lastAttemptAt: null,
  problem: null,
  capped: 0,
  deadlines: [],
};

const CONNECTED: MoodleStatus = {
  connected: true,
  connectedAt: "2026-09-30T16:00:00.000Z",
  lastSyncedAt: "2026-09-30T16:00:00.000Z",
  lastAttemptAt: "2026-09-30T16:00:00.000Z",
  problem: null,
  capped: 0,
  deadlines: [
    {
      id: "aaaaaaaaaaaaaaaaaaaaaaaa",
      title: "Problem set 2",
      dueAt: "2026-09-26T03:59:00.000Z",
      courseCode: "CSC 221",
      origin: "moodle",
    },
    {
      id: "bbbbbbbbbbbbbbbbbbbbbbbb",
      title: "Problem set 3",
      dueAt: "2026-10-02T03:59:00.000Z",
      courseCode: "CSC 221",
      origin: "moodle",
    },
  ],
};

const MOODLE_URL =
  "https://moodle.davidson.edu/calendar/export_execute.php?userid=4242&authtoken=0123456789abcdef0123456789abcdef01234567&preset_what=all&preset_time=recentupcoming";
const NOW = "2026-09-30T16:00:00.000Z";

describe("MoodlePanel", () => {
  it("explains the steps and checks the link before sending it", async () => {
    const user = userEvent.setup();
    const calls = stubFetch([200, CONNECTED]);
    render(<MoodlePanel enabled status={NOT_CONNECTED} now={NOW} primary />);
    expect(screen.getByText(/Get calendar URL/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Moodle calendar URL"), "https://example.com/cal.ics");
    await user.click(screen.getByRole("button", { name: "Connect Moodle" }));
    expect(screen.getByText(/not a Davidson Moodle calendar link/)).toBeInTheDocument();
    expect(calls).toHaveLength(0);

    await user.clear(screen.getByLabelText("Moodle calendar URL"));
    await user.click(screen.getByLabelText("Moodle calendar URL"));
    await user.paste(MOODLE_URL);
    await user.click(screen.getByRole("button", { name: "Connect Moodle" }));
    expect(await screen.findByTestId("moodle-status")).toHaveTextContent(
      "Connected · last synced Sep 30, 12:00 PM",
    );
    expect(calls[0]).toMatchObject({
      method: "PUT",
      url: "/api/moodle",
      body: { url: MOODLE_URL },
    });
    // The link is gone from the page once connected.
    expect(screen.queryByLabelText("Moodle calendar URL")).not.toBeInTheDocument();
  });

  it("lists the upcoming imported deadlines, never the link", () => {
    render(<MoodlePanel enabled status={CONNECTED} now={NOW} />);
    const list = screen.getByTestId("moodle-imported");
    expect(list).toHaveTextContent("1 upcoming deadline is in your plan");
    expect(list).toHaveTextContent("1 earlier one is kept too.");
    expect(screen.getAllByTestId("moodle-deadline")).toHaveLength(1);
    expect(screen.getByTestId("moodle-deadline")).toHaveTextContent(
      "CSC 221Problem set 3Thu Oct 1, 11:59p",
    );
    expect(document.body.textContent).not.toMatch(/authtoken/);
  });

  it("shows a Moodle date without a time as the day alone", () => {
    const journal = {
      id: "cccccccccccccccccccccccc",
      title: "Reading journal",
      dueAt: "2026-10-09T03:59:00.000Z",
      origin: "moodle" as const,
      allDay: true as const,
    };
    render(<MoodlePanel enabled status={{ ...CONNECTED, deadlines: [journal] }} now={NOW} />);
    expect(screen.getByTestId("moodle-deadline")).toHaveTextContent(/^Reading journalThu Oct 8$/);
  });

  it("says what went wrong and offers a new link when Moodle refused the old one", () => {
    render(<MoodlePanel enabled status={{ ...CONNECTED, problem: "auth" }} now={NOW} />);
    expect(screen.getByTestId("moodle-problem")).toHaveTextContent(
      /no longer accepts this calendar link/,
    );
    expect(screen.getByLabelText("New Moodle calendar URL")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reconnect" })).toBeInTheDocument();
  });

  it("syncs now", async () => {
    const user = userEvent.setup();
    const calls = stubFetch([200, CONNECTED]);
    render(<MoodlePanel enabled status={CONNECTED} now={NOW} />);
    await user.click(screen.getByRole("button", { name: "Sync now" }));
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ method: "POST", url: "/api/moodle/sync" });
  });

  it("disconnects after confirming, removing the imported deadlines unless unticked", async () => {
    const user = userEvent.setup();
    const calls = stubFetch([200, { removed: 2 }]);
    render(<MoodlePanel enabled status={CONNECTED} now={NOW} />);
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    const remove = screen.getByRole("checkbox", { name: /Also remove the 2 deadlines/ });
    expect(remove).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Yes, disconnect" }));
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ method: "DELETE", url: "/api/moodle?removeDeadlines=true" });
    expect(await screen.findByLabelText("Moodle calendar URL")).toBeInTheDocument();
  });

  it("with the import turned off, shows only what is stored and Disconnect", () => {
    render(<MoodlePanel enabled={false} status={CONNECTED} now={NOW} />);
    expect(screen.getByText(/turned off on MakeItSo/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sync now" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeInTheDocument();
  });
});

describe("SyllabiBoard", () => {
  it("opens the review step with the new syllabus's deadlines right after a paste", async () => {
    const user = userEvent.setup();
    stubFetch([200, OK(syllabus())]);
    render(<SyllabiBoard syllabi={[]} terms={TERMS} defaultTerm="202601" gate="ready" />);
    await user.type(screen.getByLabelText("Course"), "CSC 221");
    await pasteText(user, TEXT);
    await user.click(screen.getByRole("button", { name: /Find deadlines/ }));
    expect(await screen.findByText("Review deadlines for CSC 221")).toBeInTheDocument();
    expect(screen.getAllByTestId("syllabus-deadline-row")).toHaveLength(2);
  });

  it("Replace on an existing row pre-fills the paste form and locks its course and term", async () => {
    const user = userEvent.setup();
    render(<SyllabiBoard syllabi={[syllabus()]} terms={TERMS} defaultTerm="202602" gate="ready" />);
    await user.click(screen.getByRole("button", { name: /^Replace/ }));
    expect(
      screen.getByRole("heading", { name: "Replace the syllabus for CSC 221" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Course")).toHaveValue("CSC 221");
    expect(screen.getByLabelText("Course")).toBeDisabled();
    expect(screen.getByLabelText("Syllabus text")).toHaveFocus();
  });

  it("keeps one primary action: Connect Moodle until it is connected, then Find deadlines", () => {
    const primaryNames = () =>
      screen
        .getAllByRole("button")
        .filter((button) => button.className.includes("bg-primary-fill"))
        .map((button) => button.textContent);
    const { rerender } = render(
      <SyllabiBoard
        syllabi={[]}
        terms={TERMS}
        defaultTerm="202601"
        gate="ready"
        moodle={{ enabled: true, status: NOT_CONNECTED, now: NOW }}
      />,
    );
    expect(primaryNames()).toEqual(["Connect Moodle"]);
    rerender(
      <SyllabiBoard
        syllabi={[]}
        terms={TERMS}
        defaultTerm="202601"
        gate="ready"
        moodle={{ enabled: true, status: CONNECTED, now: NOW }}
      />,
    );
    expect(primaryNames()).toEqual(["Find deadlines"]);
  });
});
