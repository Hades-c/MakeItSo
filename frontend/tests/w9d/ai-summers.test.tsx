import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AiSummersPanel,
  pickCheckedWords,
  pickLabel,
} from "@/app/(hub)/careers/[slug]/_components/ai-summers";
import { REGENERATION_HINT } from "@/app/(hub)/careers/[slug]/_components/ai-result";
import {
  AI_FAILURE_KINDS,
  AI_FAILURE_MESSAGES,
  AI_RESULT_STATUS,
  aiFailure,
  type CareerSummers,
  type SummerOption,
} from "@/lib/types/ai";
import { deferred, LINKS, okResult, renderFresh, stubFetch } from "./helpers";

/**
 * "Your AI summer picks" on /careers/[slug]: request, render (the AI's words with the chip; every fact from the
 * content the route attached), "nothing fits", every result kind, picking again and keyboard focus.
 */

const LOCKE: SummerOption = {
  id: "program:locke-white-jr-internship-fund",
  name: "Locke White Jr. Internship Fund",
  url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
  audience: "Students pursuing science, technology or medicine careers (preference)",
  timing: null,
  source: "matthews-center",
  runBy: "Matthews Center",
  verifiedAt: "2026-09-30",
  onThisPage: true,
};
const REU: SummerOption = {
  id: "outside:nsf-research-experiences-for-undergraduates-reu",
  name: "NSF Research Experiences for Undergraduates (REU)",
  url: "https://www.nsf.gov/funding/initiatives/reu/students",
  audience: "Undergraduates who are U.S. citizens, permanent residents or U.S. nationals",
  timing: {
    label: "Timing",
    text: "Most sites run in the summer and take applications January–March.",
  },
  source: null,
  runBy: "National Science Foundation",
  verifiedAt: "2026-10-29",
  onThisPage: false,
};
const BUTNER: SummerOption = {
  ...LOCKE,
  id: "program:butner-family-internship-fund",
  name: "Butner Family Internship Fund",
  audience: "Students in unfunded or minimally funded internships, any industry",
  onThisPage: false,
};

const SUMMERS: CareerSummers = {
  outlook: "After your sophomore year, research and a first internship both fit.",
  picks: [
    {
      option: LOCKE,
      why: "It can fund a tech internship.",
      nextStep: "Talk with the Matthews Center.",
    },
    { option: BUTNER, why: "It funds an internship in any field.", nextStep: null },
    { option: REU, why: "Research builds the skills software teams look for.", nextStep: null },
  ],
};

function panel(props: Partial<React.ComponentProps<typeof AiSummersPanel>> = {}) {
  return renderFresh(
    <AiSummersPanel
      careerSlug="software-engineering"
      careerName="Software Engineering"
      gate={null}
      links={LINKS}
      adviceHref="https://www.davidson.edu/offices-and-services/matthews-center-career-development"
      {...props}
    />,
  );
}

const ok = (summers: CareerSummers = SUMMERS, extra = {}) =>
  [200, okResult({ summers }, extra)] as [number, unknown];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pickLabel / pickCheckedWords", () => {
  it("says who runs it like the Summers card, and when the options were checked", () => {
    expect(pickLabel(LOCKE)).toBe("via Matthews Center");
    expect(pickLabel(REU)).toBe("via National Science Foundation");
    expect(pickCheckedWords([LOCKE])).toBe("checked Sep 30, 2026");
    expect(pickCheckedWords([REU, LOCKE])).toBe("checked between Sep 30, 2026 and Oct 29, 2026");
  });
});

describe("AiSummersPanel", () => {
  it("asks on request (ids only) and shows the AI's words with the chip and the content's facts", async () => {
    const calls = stubFetch((url, init) =>
      url.pathname === "/api/ai/career-summers" && init.method === "POST" ? ok() : undefined,
    );
    panel();
    expect(screen.getByText(/Your name and email are never sent/)).toBeVisible();
    const button = screen.getByRole("button", { name: "Suggest summers for me" });
    // The page's one primary action is the career plan's: this button is secondary.
    expect(button.className).not.toMatch(/bg-primary-fill/);
    await userEvent.click(button);

    const result = await screen.findByTestId("ai-summers-result");
    expect(result).toHaveAccessibleName("Your AI summer picks");
    expect(
      within(result).getByText("AI-generated content: verify with your advisor"),
    ).toBeInTheDocument();
    expect(within(result).getByTestId("ai-summers-outlook")).toHaveTextContent(SUMMERS.outlook);
    const picks = within(result).getAllByTestId("ai-summer-pick");
    expect(picks).toHaveLength(3);

    const first = picks[0]!;
    const link = within(first).getByRole("link", { name: /Locke White Jr\. Internship Fund/ });
    expect(link).toHaveAttribute("href", LOCKE.url);
    expect(link).toHaveAttribute("target", "_blank");
    expect(first).toHaveAttribute("data-source", "matthews-center");
    expect(within(first).getByText("via Matthews Center")).toBeVisible();
    expect(within(first).getByText("· in Summers above")).toBeVisible();
    expect(within(first).getByTestId("ai-summer-why")).toHaveTextContent(SUMMERS.picks[0]!.why);
    expect(within(first).getByTestId("ai-summer-next")).toHaveTextContent(
      "Talk with the Matthews Center.",
    );
    expect(within(first).getByText(LOCKE.audience!)).toBeVisible();

    // The second row has the same source words: said once per run (screen readers still hear it).
    const second = picks[1]!;
    expect(within(second).queryByText("via Matthews Center")).toBeNull();
    expect(within(second).getByText("Source: via Matthews Center")).toHaveClass("sr-only");
    expect(within(second).queryByTestId("ai-summer-next")).toBeNull();

    const third = picks[2]!;
    expect(third).not.toHaveAttribute("data-source");
    expect(within(third).getByText("via National Science Foundation")).toBeVisible();
    expect(within(third).getByText("Timing")).toBeVisible();
    expect(within(third).getByText(REU.timing!.text)).toBeVisible();

    expect(within(result).getByTestId("ai-summers-facts-line")).toHaveTextContent(
      /are the AI’s; names, who each is for and timing are as each program publishes them · checked between Sep 30, 2026 and Oct 29, 2026\. Confirm on the program’s page/,
    );

    const post = calls.find((c) => c.method === "POST")!;
    expect(post).toEqual({
      method: "POST",
      path: "/api/ai/career-summers",
      body: { careerSlug: "software-engineering", regenerate: false },
    });
  });

  it("says when nothing fits, with the outlook and the Matthews Center, instead of a list", async () => {
    stubFetch((url) =>
      url.pathname === "/api/ai/career-summers"
        ? ok({ outlook: "Most options here suit students further along.", picks: [] })
        : undefined,
    );
    panel();
    await userEvent.click(screen.getByRole("button", { name: "Suggest summers for me" }));
    const none = await screen.findByTestId("ai-summers-none");
    expect(none).toHaveTextContent(/found nothing in MakeItSo’s summer list that fits you well/);
    expect(within(none).getByRole("link", { name: /The Matthews Center/ })).toHaveAttribute(
      "href",
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development",
    );
    expect(screen.getByTestId("ai-summers-outlook")).toHaveTextContent(/further along/);
    expect(screen.queryByTestId("ai-summer-picks")).toBeNull();
    expect(screen.queryByTestId("ai-summers-facts-line")).toBeNull();
  });

  it("Pick again sends regenerate: true, keeps the old picks meanwhile, and shows the shared allowance", async () => {
    let answer = 0;
    const calls = stubFetch((url) => {
      if (url.pathname !== "/api/ai/career-summers") return undefined;
      answer++;
      return answer === 1 ? ok() : [AI_RESULT_STATUS.quota, aiFailure("quota")];
    });
    panel();
    await userEvent.click(screen.getByRole("button", { name: "Suggest summers for me" }));
    expect(await screen.findByText(REGENERATION_HINT)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Pick again" }));
    expect(await screen.findByText(AI_FAILURE_MESSAGES.quota)).toBeVisible();
    expect(screen.getAllByTestId("ai-summer-pick")).toHaveLength(3);
    expect(calls.map((c) => c.body)).toEqual([
      { careerSlug: "software-engineering", regenerate: false },
      { careerSlug: "software-engineering", regenerate: true },
    ]);
  });

  it.each(AI_FAILURE_KINDS)(
    "renders the %s result kind with its message and next step",
    async (kind) => {
      stubFetch((url) =>
        url.pathname === "/api/ai/career-summers"
          ? [AI_RESULT_STATUS[kind], aiFailure(kind)]
          : undefined,
      );
      panel();
      await userEvent.click(screen.getByRole("button", { name: "Suggest summers for me" }));
      const notice = await screen.findByTestId("ai-summers-failure");
      expect(notice).toHaveTextContent(AI_FAILURE_MESSAGES[kind]);
      const retry = within(notice).queryByRole("button", { name: "Try again" });
      expect(!!retry).toBe(["truncated", "invalid", "timeout", "unavailable"].includes(kind));
      if (kind === "consent_required") {
        expect(within(notice).getByRole("link", { name: "Open AI settings" })).toHaveAttribute(
          "href",
          "/profile#ai-features",
        );
      }
    },
  );

  it("Try again repeats the request and can succeed; the server's own message is shown", async () => {
    let answer = 0;
    stubFetch((url) => {
      if (url.pathname !== "/api/ai/career-summers") return undefined;
      answer++;
      return answer === 1
        ? [502, aiFailure("invalid", "The AI suggested summer options MakeItSo could not match.")]
        : ok();
    });
    panel();
    await userEvent.click(screen.getByRole("button", { name: "Suggest summers for me" }));
    expect(await screen.findByText(/could not match/)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("ai-summers-outlook")).toHaveTextContent(SUMMERS.outlook);
    expect(screen.queryByTestId("ai-summers-failure")).toBeNull();
  });

  it("a gate known at render replaces the button (no request)", () => {
    const calls = stubFetch(() => undefined);
    panel({ gate: aiFailure("unverified") });
    expect(screen.queryByRole("button", { name: "Suggest summers for me" })).toBeNull();
    const gate = screen.getByTestId("ai-summers-gate");
    expect(gate).not.toHaveAttribute("role");
    expect(within(gate).getByRole("link", { name: "Verify your email" })).toHaveAttribute(
      "href",
      LINKS.verify,
    );
    expect(calls).toHaveLength(0);
  });

  it("keyboard: the button keeps focus while loading, then focus moves to the picks", async () => {
    const pending = deferred();
    stubFetch((url) => (url.pathname === "/api/ai/career-summers" ? pending.promise : undefined));
    panel();
    screen.getByRole("button", { name: "Suggest summers for me" }).focus();
    await userEvent.keyboard("{Enter}");
    const busy = await screen.findByRole("button", { name: "Picking summers for you…" });
    expect(busy).toHaveAttribute("aria-disabled", "true");
    expect(document.activeElement).toBe(busy);
    pending.release(ok(SUMMERS, { cached: true }));
    const result = await screen.findByTestId("ai-summers-result");
    await waitFor(() => expect(document.activeElement).toBe(result));
    expect(within(result).getByText("Saved from your last request")).toBeVisible();
  });
});
