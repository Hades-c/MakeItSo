import { vi } from "vitest";
import type { PlanItem } from "@/lib/types/plan";
import { REQUIREMENT_SLOTS, type RequirementSlot } from "@/lib/types/plan";

/** Shared fixtures for the W5u DOM tests. */

export type Call = { url: string; method: string; body: unknown };

/** Answer callApi's fetches in order with [status, body]; records each request. */
export function stubFetch(...answers: [number, unknown][]): Call[] {
  const calls: Call[] = [];
  const queue = [...answers];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({
        url,
        method: init.method ?? "GET",
        body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
      });
      const [status, body] = queue.shift() ?? [500, {}];
      if (status === 204) return new Response(null, { status });
      return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return calls;
}

let n = 0;
export function planItem(overrides: Partial<PlanItem> & { courseCode: string }): PlanItem {
  n += 1;
  return {
    id: (0xabc000 + n).toString(16).padStart(24, "0"),
    termCode: "202601",
    canonicalCode: overrides.courseCode,
    title: `${overrides.courseCode} title`,
    credits: 1,
    status: "planned",
    passFail: false,
    source: "catalog",
    reqCodes: null,
    unverified: false,
    ...overrides,
  };
}

export const SLOT_LABELS = Object.fromEntries(
  REQUIREMENT_SLOTS.map((slot) => [slot, `Label ${slot}`]),
) as Record<RequirementSlot, string>;
