import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CourseAboutPanel, RETRYABLE } from "@/app/(hub)/courses/_components/course-about-panel";
import { AI_FAILURE_KINDS, AI_FAILURE_MESSAGES, AI_RESULT_STATUS } from "@/lib/types/ai";

/** The AI "About this course" panel: every AiResult kind rendered, the gate, Retry and Report this. */

type Call = { url: string; body: unknown };
let calls: Call[] = [];

function stubFetch(...answers: [number, unknown][]) {
  calls = [];
  const queue = [...answers];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: init.body ? JSON.parse(String(init.body)) : null });
      const [status, body] = queue.shift() ?? [500, {}];
      return status === 204
        ? new Response(null, { status })
        : new Response(JSON.stringify(body), {
            status,
            headers: { "content-type": "application/json" },
          });
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

const OK = {
  kind: "ok",
  data: {
    about: {
      summary: "A tour of the data structures behind efficient programs.",
      goodFor: ["like to build things"],
      topics: ["Hash tables", "Trees"],
    },
    provenance: {
      model: "claude-sonnet-5-5",
      promptVersion: "course-about-v1",
      inputHash: "abc123",
      generatedAt: "2026-09-29T14:00:00.000Z",
    },
  },
  servedModel: "claude-sonnet-5-5",
  fallbackUsed: false,
  cached: true,
};

const renderPanel = (gate: "ready" | "unverified" | "consent_required" = "ready") =>
  render(<CourseAboutPanel termCode="202602" courseCode="CSC 221" gate={gate} />);

describe("CourseAboutPanel", () => {
  it("requests the summary by ids only and renders it as text with the AI chip and tag", async () => {
    stubFetch([200, OK]);
    renderPanel();
    expect(screen.getByRole("status")).toHaveTextContent("Loading the AI summary…");
    expect(await screen.findByText(OK.data.about.summary)).toBeVisible();
    expect(calls[0]).toEqual({
      url: "/api/ai/course-about",
      body: { termCode: "202602", courseCode: "CSC 221" },
    });
    expect(screen.getByText("like to build things")).toBeVisible();
    expect(screen.getByText("Hash tables")).toBeVisible();
    expect(screen.getByText("AI-generated content: verify with your advisor")).toBeInTheDocument();
    expect(screen.getByText("Source:", { exact: false }).closest("[data-source]")).toHaveAttribute(
      "data-source",
      "ai",
    );
    expect(
      screen.getByText(/Summarized from the official course description on Sep 29, 2026/),
    ).toBeVisible();
  });

  it("reports the shown entry by its input hash", async () => {
    stubFetch([200, OK], [204, null]);
    renderPanel();
    await userEvent.click(await screen.findByRole("button", { name: "Report this summary" }));
    expect(await screen.findByText(/Thanks\. Reported summaries are reviewed/)).toBeVisible();
    expect(calls[1]).toEqual({
      url: "/api/ai/report",
      body: { feature: "course-about", key: "abc123" },
    });
  });

  it("says when a report could not be sent", async () => {
    stubFetch([200, OK], [403, { error: { code: "forbidden", message: "No." } }]);
    renderPanel();
    await userEvent.click(await screen.findByRole("button", { name: "Report this summary" }));
    expect(await screen.findByText("Could not send the report. Try again.")).toBeVisible();
  });

  it.each(AI_FAILURE_KINDS)("renders the %s result kind", async (kind) => {
    const message = AI_FAILURE_MESSAGES[kind];
    stubFetch([AI_RESULT_STATUS[kind], { kind, message }]);
    renderPanel();
    expect(await screen.findByText(message)).toBeVisible();
    const retry = screen.queryByRole("button", { name: "Retry" });
    if (RETRYABLE.has(kind)) expect(retry).toBeVisible();
    else expect(retry).toBeNull();
    if (kind === "unverified") {
      expect(screen.getByRole("link", { name: "Verify your Davidson email" })).toHaveAttribute(
        "href",
        "/verify",
      );
    }
    if (kind === "consent_required") {
      expect(
        screen.getByRole("link", { name: "Turn on AI features in your profile" }),
      ).toHaveAttribute("href", "/profile");
    }
  });

  it("retries a retryable failure", async () => {
    stubFetch([504, { kind: "timeout", message: AI_FAILURE_MESSAGES.timeout }], [200, OK]);
    renderPanel();
    await userEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByText(OK.data.about.summary)).toBeVisible();
    expect(calls).toHaveLength(2);
  });

  it("explains a route-level failure (rate limit, signed out) and offers Retry", async () => {
    stubFetch([429, { error: { code: "rate_limited", message: "Slow down." } }]);
    renderPanel();
    expect(
      await screen.findByText("Too many AI requests right now. Try again in a minute."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
  });

  it("asks to verify or consent first and requests nothing", () => {
    stubFetch();
    const { unmount } = renderPanel("unverified");
    expect(screen.getByTestId("about-gate")).toHaveTextContent(AI_FAILURE_MESSAGES.unverified);
    unmount();
    renderPanel("consent_required");
    expect(screen.getByTestId("about-gate")).toHaveTextContent(
      AI_FAILURE_MESSAGES.consent_required,
    );
    expect(calls).toHaveLength(0);
  });
});
