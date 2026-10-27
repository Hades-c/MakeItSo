import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRouter } from "next/navigation";
import { SyllabiBoard } from "@/app/(hub)/syllabi/_components/syllabi-board";
import { ReviewDeadlines } from "@/app/(hub)/syllabi/_components/review-deadlines";
import { UploadForm } from "@/app/(hub)/syllabi/_components/upload-form";
import { SyllabusList } from "@/app/(hub)/syllabi/_components/syllabus-list";
import type { Syllabus } from "@/lib/types/syllabus";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));

// Radix Checkbox measures itself (jsdom has no ResizeObserver).
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

type Call = { url: string; method: string; body: unknown };

/** Answers both callApi's JSON fetches and the upload form's own multipart fetch, in order. */
function stubFetch(...answers: [number, unknown][]): Call[] {
  const calls: Call[] = [];
  const queue = [...answers];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const body =
        typeof init.body === "string"
          ? JSON.parse(init.body)
          : init.body instanceof FormData
            ? Object.fromEntries(init.body.entries())
            : undefined;
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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(useRouter).mockReset();
});

function syllabus(overrides: Partial<Syllabus> = {}): Syllabus {
  return {
    id: "0123456789abcdef01234567",
    courseCode: "CSC 221",
    termCode: "202601",
    filename: "syllabus.pdf",
    uploadedAt: "2026-09-30T12:00:00.000Z",
    extractedDeadlines: [
      { title: "Midterm exam", dueAt: "2026-10-15" },
      { title: "Final paper", dueAt: "2026-12-03" },
    ],
    ...overrides,
  };
}

const TERMS = [
  { code: "202601", label: "Fall 2026" },
  { code: "202602", label: "Spring 2027" },
];

function pdfFile(name = "syllabus.pdf") {
  return new File(["%PDF-1.4 fake content"], name, { type: "application/pdf" });
}

describe("UploadForm", () => {
  it("rejects an invalid course code before sending anything", async () => {
    const user = userEvent.setup();
    const calls = stubFetch();
    const onUploaded = vi.fn();
    render(<UploadForm terms={TERMS} defaultTerm="202601" gate="ready" onUploaded={onUploaded} />);
    await user.type(screen.getByLabelText("Course"), "not a code");
    await user.upload(screen.getByLabelText(/PDF or Word file/), pdfFile());
    await user.click(screen.getByRole("button", { name: /Upload syllabus/ }));
    expect(screen.getByRole("alert")).toHaveTextContent(/Enter a course code/);
    expect(calls).toHaveLength(0);
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it("rejects a disallowed file type before sending anything", async () => {
    // applyAccept: false — a real file picker filters by `accept`, but a drag-and-drop does not; this exercises
    // the component's own fileProblem() check rather than user-event's input-level simulation of the former.
    const user = userEvent.setup({ applyAccept: false });
    const calls = stubFetch();
    const onUploaded = vi.fn();
    render(<UploadForm terms={TERMS} defaultTerm="202601" gate="ready" onUploaded={onUploaded} />);
    await user.type(screen.getByLabelText("Course"), "CSC 221");
    const badFile = new File(["hi"], "notes.txt", { type: "text/plain" });
    await user.upload(screen.getByLabelText(/PDF or Word file/), badFile);
    await user.click(screen.getByRole("button", { name: /Upload syllabus/ }));
    expect(screen.getByRole("alert")).toHaveTextContent(/PDF or a Word/);
    expect(calls).toHaveLength(0);
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it("uploads the normalized course code, term and file, and reports the new syllabus", async () => {
    const user = userEvent.setup();
    const made = syllabus();
    stubFetch([
      200,
      {
        kind: "ok",
        data: { syllabus: made },
        servedModel: "mock",
        fallbackUsed: false,
        cached: false,
      },
    ]);
    const onUploaded = vi.fn();
    render(<UploadForm terms={TERMS} defaultTerm="202601" gate="ready" onUploaded={onUploaded} />);
    await user.type(screen.getByLabelText("Course"), "csc221");
    await user.upload(screen.getByLabelText(/PDF or Word file/), pdfFile());
    await user.click(screen.getByRole("button", { name: /Upload syllabus/ }));
    expect(await screen.findByRole("button", { name: /Upload syllabus/ })).toBeEnabled();
    expect(onUploaded).toHaveBeenCalledWith(made);
  });

  it("shows an AiResult failure (e.g. quota) instead of calling onUploaded", async () => {
    const user = userEvent.setup();
    stubFetch([429, { kind: "quota", message: "You have used today's AI requests." }]);
    const onUploaded = vi.fn();
    render(<UploadForm terms={TERMS} defaultTerm="202601" gate="ready" onUploaded={onUploaded} />);
    await user.type(screen.getByLabelText("Course"), "CSC 221");
    await user.upload(screen.getByLabelText(/PDF or Word file/), pdfFile());
    await user.click(screen.getByRole("button", { name: /Upload syllabus/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/today's AI requests/);
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it("replaces the form with a gate notice while AI is unverified or needs consent", () => {
    render(
      <UploadForm
        terms={TERMS}
        defaultTerm="202601"
        gate="consent_required"
        onUploaded={vi.fn()}
      />,
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

  it("sends only the kept rows, with any edits, and calls onDone", async () => {
    const user = userEvent.setup();
    vi.mocked(useRouter).mockReturnValue({ refresh: vi.fn() } as never);
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
    const rows = screen.getAllByTestId("syllabus-deadline-row");
    expect(rows).toHaveLength(2);
    // Uncheck the second row (Final paper): only the first is sent.
    await user.click(within(rows[1]!).getByRole("checkbox"));
    await user.clear(within(rows[0]!).getByLabelText("Title"));
    await user.type(within(rows[0]!).getByLabelText("Title"), "Midterm exam, edited");
    await user.click(screen.getByRole("button", { name: /Add 1 deadline to plan/ }));
    expect(await screen.findByRole("button", { name: /Add 1 deadline to plan/ })).toBeEnabled();
    expect(calls[0]!.body).toEqual({
      deadlines: [{ title: "Midterm exam, edited", dueAt: "2026-10-15" }],
    });
    expect(onDone).toHaveBeenCalled();
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
    await user.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: /Add 0 deadlines to plan/ })).toBeDisabled();
  });
});

describe("SyllabusList", () => {
  it("says when there are no uploads yet", () => {
    render(<SyllabusList syllabi={[]} reviewingId={null} onReview={vi.fn()} onReplace={vi.fn()} />);
    expect(screen.getByText("No syllabi uploaded yet")).toBeInTheDocument();
  });

  it("lists each upload with its course, term, filename and deadline count", () => {
    render(
      <SyllabusList
        syllabi={[syllabus()]}
        reviewingId={null}
        onReview={vi.fn()}
        onReplace={vi.fn()}
      />,
    );
    const row = screen.getByTestId("syllabus-row");
    expect(row).toHaveTextContent("CSC 221");
    expect(row).toHaveTextContent("Fall 2026");
    expect(row).toHaveTextContent("syllabus.pdf");
    expect(row).toHaveTextContent("2 deadlines found");
  });

  it("deletes after confirming, and asks before removing anything", async () => {
    const user = userEvent.setup();
    vi.mocked(useRouter).mockReturnValue({ refresh: vi.fn() } as never);
    const calls = stubFetch([204, null]);
    render(
      <SyllabusList
        syllabi={[syllabus()]}
        reviewingId={null}
        onReview={vi.fn()}
        onReplace={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /^Delete/ }));
    expect(calls).toHaveLength(0); // not yet: the confirm step is up first
    await user.click(screen.getByRole("button", { name: "Yes, delete" }));
    expect(await screen.findByRole("button", { name: /^Delete/ })).toBeInTheDocument();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: "DELETE",
      url: "/api/syllabi/0123456789abcdef01234567",
    });
  });
});

describe("SyllabiBoard", () => {
  it("opens the review step with the new syllabus's deadlines right after an upload", async () => {
    const user = userEvent.setup();
    const made = syllabus();
    stubFetch([
      200,
      {
        kind: "ok",
        data: { syllabus: made },
        servedModel: "mock",
        fallbackUsed: false,
        cached: false,
      },
    ]);
    render(<SyllabiBoard syllabi={[]} terms={TERMS} defaultTerm="202601" gate="ready" />);
    await user.type(screen.getByLabelText("Course"), "CSC 221");
    await user.upload(screen.getByLabelText(/PDF or Word file/), pdfFile());
    await user.click(screen.getByRole("button", { name: /Upload syllabus/ }));
    expect(await screen.findByText("Review deadlines for CSC 221")).toBeInTheDocument();
    expect(screen.getAllByTestId("syllabus-deadline-row")).toHaveLength(2);
  });

  it("Replace on an existing row pre-fills the upload form and locks its course and term", async () => {
    const user = userEvent.setup();
    render(<SyllabiBoard syllabi={[syllabus()]} terms={TERMS} defaultTerm="202602" gate="ready" />);
    await user.click(screen.getByRole("button", { name: /^Replace/ }));
    expect(screen.getByText(/Replacing the syllabus for/)).toBeInTheDocument();
    expect(screen.getByLabelText("Course")).toHaveValue("CSC 221");
    expect(screen.getByLabelText("Course")).toBeDisabled();
  });
});
