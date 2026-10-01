import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AiCareerPlanPanel,
  draftSendOutcome,
  sendErrorText,
} from "@/app/(hub)/careers/[slug]/_components/ai-career-plan";
import { ApiClientError } from "@/lib/api/client";
import {
  AI_FAILURE_KINDS,
  AI_FAILURE_MESSAGES,
  AI_RESULT_STATUS,
  aiFailure,
  type CareerPlan,
} from "@/lib/types/ai";
import {
  course,
  draft,
  DRAFT_ID,
  LINKS,
  okResult,
  renderFresh,
  stubFetch,
  type Route,
} from "./helpers";

/** "Your AI career plan" on /careers/[slug] (W9a-ai): request, render, every result kind, Send to my plan. */

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useRouter: () => router,
}));

const PLAN: CareerPlan = {
  overview: "Software engineers design, build and test programs.",
  majors: ["Major in Computer Science (B.S. Degree)"],
  minors: ["Minor in Data Science"],
  courses: [{ courseCode: "CSC 221", termCode: "202602", reason: "Core data structures." }],
  experiences: [
    { title: "Talk with your advisor", when: "This semester", why: "Plan your courses." },
  ],
};
const DRAFT = draft([{ ...PLAN.courses[0]!, basis: "scheduled" }]);

const catalog: Route = (url) => {
  if (url.pathname === "/api/catalog/availability") {
    return [
      200,
      {
        code: "CSC 221",
        availability: [{ termCode: "202602", status: "offered", sectionCount: 3 }],
      },
    ];
  }
  if (url.pathname === "/api/catalog/courses/202602/CSC-221") {
    return [200, course("202602", "CSC 221", "Data Structures")];
  }
  return undefined;
};

function panel(props: Partial<React.ComponentProps<typeof AiCareerPlanPanel>> = {}) {
  return renderFresh(
    <AiCareerPlanPanel
      careerSlug="software-engineering"
      careerName="Software Engineering"
      gate={null}
      links={LINKS}
      careerTerms={["202601", "202602", "202701"]}
      suggestionsHref="/plan?tab=suggestions"
      {...props}
    />,
  );
}

beforeEach(() => {
  router.push.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("draftSendOutcome / sendErrorText", () => {
  it("reads the draft's status from GET /api/plan/drafts", () => {
    expect(draftSendOutcome([DRAFT], DRAFT_ID)).toBe("pending");
    expect(draftSendOutcome([{ ...DRAFT, status: "accepted" }], DRAFT_ID)).toBe("accepted");
    expect(draftSendOutcome([{ ...DRAFT, status: "dismissed" }], DRAFT_ID)).toBe("dismissed");
    expect(draftSendOutcome([], DRAFT_ID)).toBe("missing");
  });
  it("words for a failed check", () => {
    expect(sendErrorText(new ApiClientError(401, "unauthorized", "x"))).toMatch(/Sign in again/);
    expect(sendErrorText(new Error("x"))).toMatch(/couldn’t be reached/);
  });
});

describe("AiCareerPlanPanel", () => {
  it("drafts the plan on request and renders it as text with the AI chip and official course titles", async () => {
    const calls = stubFetch((url, init) => {
      if (url.pathname === "/api/ai/career-plan" && init.method === "POST") {
        return [200, okResult({ plan: PLAN, draft: DRAFT })];
      }
      return catalog(url, init);
    });
    panel();
    expect(screen.getByText(/Your name and email are never sent/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Draft my career plan" }));

    const result = await screen.findByTestId("ai-career-plan-result");
    expect(
      within(result).getByText("AI-generated content: verify with your advisor"),
    ).toBeInTheDocument();
    expect(within(result).getByTestId("ai-plan-overview")).toHaveTextContent(PLAN.overview);
    expect(
      within(result).getByText("Major · Major in Computer Science (B.S. Degree)"),
    ).toBeVisible();
    expect(within(result).getByText("Minor · Minor in Data Science")).toBeVisible();
    expect(await within(result).findByRole("link", { name: "Data Structures" })).toBeVisible();
    expect(within(result).getByText("Core data structures.")).toBeVisible();
    expect(within(result).getByTestId("ai-experiences")).toHaveTextContent(
      "Talk with your advisor",
    );
    expect(within(result).getByText(/1 course wait as a draft/)).toBeVisible();

    const post = calls.find((c) => c.method === "POST")!;
    expect(post).toEqual({
      method: "POST",
      path: "/api/ai/career-plan",
      body: { careerSlug: "software-engineering", regenerate: false },
    });
    // The client sends ids only.
    expect(Object.keys(post.body as object).sort()).toEqual(["careerSlug", "regenerate"]);
  });

  it("Send to my plan: checks the pending draft, then opens My plan → Suggestions", async () => {
    const calls = stubFetch((url, init) => {
      if (url.pathname === "/api/ai/career-plan")
        return [200, okResult({ plan: PLAN, draft: DRAFT })];
      if (url.pathname === "/api/plan/drafts") return [200, { drafts: [DRAFT] }];
      return catalog(url, init);
    });
    panel();
    await userEvent.click(screen.getByRole("button", { name: "Draft my career plan" }));
    await userEvent.click(await screen.findByRole("button", { name: "Send to my plan" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/plan?tab=suggestions"));
    expect(screen.getByTestId("ai-send-status")).toHaveTextContent("Sent. Opening My plan");
    expect(calls.some((c) => c.method === "GET" && c.path === "/api/plan/drafts")).toBe(true);
    // Nothing is accepted from here.
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
  });

  it.each([
    ["accepted", "You already added this plan’s courses in My plan."],
    ["dismissed", "You dismissed this draft in My plan."],
  ] as const)("Send to my plan on a draft already %s says so and stays", async (status, text) => {
    stubFetch((url, init) => {
      if (url.pathname === "/api/ai/career-plan") {
        return [200, okResult({ plan: PLAN, draft: DRAFT }, { cached: true })];
      }
      if (url.pathname === "/api/plan/drafts") return [200, { drafts: [{ ...DRAFT, status }] }];
      return catalog(url, init);
    });
    panel();
    await userEvent.click(screen.getByRole("button", { name: "Draft my career plan" }));
    expect(await screen.findByText("Saved from your last request")).toBeVisible();
    await userEvent.click(await screen.findByRole("button", { name: "Send to my plan" }));
    await waitFor(() => expect(screen.getByTestId("ai-send-status")).toHaveTextContent(text));
    expect(router.push).not.toHaveBeenCalled();
  });

  it("no draft (nothing to add): no Send button", async () => {
    stubFetch((url) =>
      url.pathname === "/api/ai/career-plan"
        ? [200, okResult({ plan: { ...PLAN, courses: [] }, draft: null })]
        : undefined,
    );
    panel();
    await userEvent.click(screen.getByRole("button", { name: "Draft my career plan" }));
    expect(
      await screen.findByText("No catalog courses to suggest for you right now."),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Send to my plan" })).toBeNull();
  });

  it("Draft a new plan sends regenerate: true and keeps the old plan on screen meanwhile", async () => {
    let answer = 0;
    const calls = stubFetch((url, init) => {
      if (url.pathname === "/api/ai/career-plan") {
        answer++;
        return answer === 1
          ? [200, okResult({ plan: PLAN, draft: DRAFT })]
          : [AI_RESULT_STATUS.quota, aiFailure("quota")];
      }
      return catalog(url, init);
    });
    panel();
    await userEvent.click(screen.getByRole("button", { name: "Draft my career plan" }));
    await userEvent.click(await screen.findByRole("button", { name: "Draft a new plan" }));
    expect(await screen.findByText(AI_FAILURE_MESSAGES.quota)).toBeVisible();
    // The earlier plan is still shown under the notice.
    expect(screen.getByTestId("ai-plan-overview")).toHaveTextContent(PLAN.overview);
    expect(calls.filter((c) => c.method === "POST").map((c) => c.body)).toEqual([
      { careerSlug: "software-engineering", regenerate: false },
      { careerSlug: "software-engineering", regenerate: true },
    ]);
  });

  it.each(AI_FAILURE_KINDS)(
    "renders the %s result kind with its message and next step",
    async (kind) => {
      stubFetch((url) =>
        url.pathname === "/api/ai/career-plan"
          ? [AI_RESULT_STATUS[kind], aiFailure(kind)]
          : undefined,
      );
      panel();
      await userEvent.click(screen.getByRole("button", { name: "Draft my career plan" }));
      const notice = await screen.findByTestId("ai-plan-failure");
      expect(notice).toHaveTextContent(AI_FAILURE_MESSAGES[kind]);
      const retry = within(notice).queryByRole("button", { name: "Try again" });
      expect(!!retry).toBe(["truncated", "invalid", "timeout", "unavailable"].includes(kind));
      if (kind === "consent_required") {
        expect(within(notice).getByRole("link", { name: "Open AI settings" })).toHaveAttribute(
          "href",
          "/profile#ai-features",
        );
      }
      if (kind === "unverified") {
        expect(within(notice).getByRole("link", { name: "Verify your email" })).toHaveAttribute(
          "href",
          LINKS.verify,
        );
      }
    },
  );

  it("Try again repeats the request and can succeed", async () => {
    let answer = 0;
    stubFetch((url, init) => {
      if (url.pathname === "/api/ai/career-plan") {
        answer++;
        return answer === 1
          ? [AI_RESULT_STATUS.timeout, aiFailure("timeout")]
          : [200, okResult({ plan: PLAN, draft: DRAFT })];
      }
      return catalog(url, init);
    });
    panel();
    await userEvent.click(screen.getByRole("button", { name: "Draft my career plan" }));
    await userEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("ai-plan-overview")).toHaveTextContent(PLAN.overview);
    expect(screen.queryByTestId("ai-plan-failure")).toBeNull();
  });

  it("a signed-out 401 (generic error body) offers Sign in; a network failure offers retry", async () => {
    let answer = 0;
    stubFetch((url) => {
      if (url.pathname !== "/api/ai/career-plan") return undefined;
      answer++;
      return answer === 1
        ? [401, { error: { code: "unauthorized", message: "Sign in" } }]
        : "network";
    });
    panel();
    await userEvent.click(screen.getByRole("button", { name: "Draft my career plan" }));
    const notice = await screen.findByTestId("ai-plan-failure");
    expect(within(notice).getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      LINKS.signIn,
    );
    // Still possible to ask again from the idle button.
    await userEvent.click(screen.getByRole("button", { name: "Draft my career plan" }));
    expect(await screen.findByText("Could not reach MakeItSo")).toBeVisible();
  });

  it("a gate known at render replaces the button (no request)", () => {
    const calls = stubFetch(() => undefined);
    panel({ gate: aiFailure("consent_required") });
    expect(screen.queryByRole("button", { name: "Draft my career plan" })).toBeNull();
    const gate = screen.getByTestId("ai-plan-gate");
    expect(gate).not.toHaveAttribute("role");
    expect(within(gate).getByRole("link", { name: "Open AI settings" })).toBeVisible();
    expect(calls).toHaveLength(0);
  });

  it("names a backup model when the server-side fallback answered", async () => {
    stubFetch((url, init) =>
      url.pathname === "/api/ai/career-plan"
        ? [
            200,
            okResult(
              { plan: PLAN, draft: DRAFT },
              { fallbackUsed: true, servedModel: "claude-sonnet-5" },
            ),
          ]
        : catalog(url, init),
    );
    panel();
    await userEvent.click(screen.getByRole("button", { name: "Draft my career plan" }));
    expect(await screen.findByText("Answered by a backup model (claude-sonnet-5)")).toBeVisible();
  });
});
