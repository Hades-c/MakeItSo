import type * as React from "react";
import { render } from "@testing-library/react";
import { SWRConfig } from "swr";
import { vi } from "vitest";
import type { AiStepLinks } from "@/app/(hub)/careers/[slug]/_components/ai-result";
import type { PlanDraft } from "@/lib/types/plan";

/** Shared helpers for the W9a-ai (career AI panels) component tests. Not a test file itself. */

export const LINKS: AiStepLinks = {
  verify: "/verify?reason=davidson&next=%2Fcareers%2Fmedicine",
  consent: "/profile#ai-features",
  signIn: "/login?callbackUrl=%2Fcareers%2Fmedicine",
};

export type Answer = [status: number, body: unknown] | "network";
export type Route = (url: URL, init: RequestInit) => Answer | Promise<Answer> | undefined;

/** A fetch answer the test releases by hand (to look at the panel while a request is in flight). */
export function deferred() {
  let release!: (answer: Answer) => void;
  const promise = new Promise<Answer>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

export interface FetchCall {
  method: string;
  path: string;
  body: unknown;
}

/**
 * Answer callApi's fetches with `route(url, init)` ([status, JSON body], or "network" for a thrown TypeError). An
 * unrouted request fails the test. Returns the recorded calls.
 */
export function stubFetch(route: Route): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = new URL(String(input), "http://localhost");
      calls.push({
        method: init.method ?? "GET",
        path: `${url.pathname}${url.search}`,
        body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
      });
      const answer = await route(url, init);
      if (!answer)
        throw new Error(`unrouted fetch ${init.method ?? "GET"} ${url.pathname}${url.search}`);
      if (answer === "network") throw new TypeError("Failed to fetch");
      const [status, body] = answer;
      return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return calls;
}

/** Render with a fresh SWR cache (no state shared between tests). */
export function renderFresh(ui: React.ReactElement) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{ui}</SWRConfig>,
  );
}

export function okResult<T>(
  data: T,
  extra: Partial<{ cached: boolean; fallbackUsed: boolean; servedModel: string }> = {},
) {
  return {
    kind: "ok" as const,
    data,
    servedModel: extra.servedModel ?? "claude-sonnet-5-5",
    fallbackUsed: extra.fallbackUsed ?? false,
    cached: extra.cached ?? false,
  };
}

export function course(termCode: string, code: string, title: string) {
  return {
    course: { termCode, code, title, topics: false, sections: [], credits: [1], reqCodes: [] },
    asOf: "2026-09-30T15:00:00.000Z",
  };
}

export const DRAFT_ID = "65f0c0ffee0000000000abcd";

export function draft(
  items: PlanDraft["items"],
  status: PlanDraft["status"] = "pending",
): PlanDraft {
  return {
    id: DRAFT_ID,
    kind: "career-plan",
    promptVersion: "career-plan/1",
    items,
    status,
    createdAt: "2026-09-30T16:00:00.000Z",
  };
}
