import { describe, expect, it } from "vitest";
import {
  aiErrorCopy,
  aiFailureCopy,
  type AiStepLinks,
} from "@/app/(hub)/careers/[slug]/_components/ai-result";
import { ApiClientError } from "@/lib/api/client";
import {
  AI_FAILURE_KINDS,
  AI_FAILURE_MESSAGES,
  aiFailure,
  type AiFailureKind,
} from "@/lib/types/ai";

/** Every AiResult failure kind's words and next step on the career page (W9a-ai). */

const LINKS: AiStepLinks = {
  verify: "/verify?reason=davidson&next=%2Fcareers%2Fsoftware-engineering",
  consent: "/profile#ai-features",
  signIn: "/login?callbackUrl=%2Fcareers%2Fsoftware-engineering",
};

const EXPECTED: Record<AiFailureKind, { tone: "info" | "error"; next: string }> = {
  refused: { tone: "error", next: "none" },
  truncated: { tone: "error", next: "retry" },
  invalid: { tone: "error", next: "retry" },
  quota: { tone: "info", next: "none" },
  budget: { tone: "info", next: "none" },
  timeout: { tone: "error", next: "retry" },
  unavailable: { tone: "error", next: "retry" },
  not_configured: { tone: "info", next: "none" },
  disabled: { tone: "info", next: "none" },
  consent_required: { tone: "info", next: "link:/profile#ai-features" },
  unverified: { tone: "info", next: `link:${LINKS.verify}` },
};

function nextOf(copy: ReturnType<typeof aiFailureCopy>): string {
  return copy.next.kind === "link" ? `link:${copy.next.href}` : copy.next.kind;
}

describe("aiFailureCopy", () => {
  it.each(AI_FAILURE_KINDS)("%s: a title, the default message and the right next step", (kind) => {
    const copy = aiFailureCopy(aiFailure(kind), LINKS);
    expect(copy.title.length).toBeGreaterThan(5);
    expect(copy.message).toBe(AI_FAILURE_MESSAGES[kind]);
    expect(copy.tone).toBe(EXPECTED[kind].tone);
    expect(nextOf(copy)).toBe(EXPECTED[kind].next);
  });

  it("keeps the server's own message when it sends one", () => {
    const copy = aiFailureCopy(
      { kind: "invalid", message: "MakeItSo found no upcoming catalog courses for this path." },
      LINKS,
    );
    expect(copy.message).toBe("MakeItSo found no upcoming catalog courses for this path.");
    expect(aiFailureCopy({ kind: "quota", message: "  " }, LINKS).message).toBe(
      AI_FAILURE_MESSAGES.quota,
    );
  });

  it("offers no verify link when verifying would not help (legacy address, or no mail provider)", () => {
    const copy = aiFailureCopy(aiFailure("unverified"), { ...LINKS, verify: null });
    expect(copy.next).toEqual({ kind: "none" });
  });

  it("never offers a retry for a refusal", () => {
    expect(aiFailureCopy(aiFailure("refused"), LINKS).next.kind).toBe("none");
  });
});

describe("aiErrorCopy (errors outside the AiResult wire format)", () => {
  it("401: sign in again, back to this page", () => {
    const copy = aiErrorCopy(new ApiClientError(401, "unauthorized", "Sign in"), LINKS);
    expect(copy.next).toEqual({ kind: "link", href: LINKS.signIn, label: "Sign in" });
  });

  it("429 route limit and network failures: retry", () => {
    expect(aiErrorCopy(new ApiClientError(429, "rate_limited", "Slow"), LINKS).next.kind).toBe(
      "retry",
    );
    const network = aiErrorCopy(new ApiClientError(0, "network", "Could not reach"), LINKS);
    expect(network).toMatchObject({ title: "Could not reach MakeItSo", next: { kind: "retry" } });
  });

  it("404 (an alumnus no longer contactable): the server's words, no retry", () => {
    const copy = aiErrorCopy(
      new ApiClientError(404, "not_found", "That alumnus is not available for a cold e-mail."),
      LINKS,
    );
    expect(copy).toMatchObject({
      message: "That alumnus is not available for a cold e-mail.",
      next: { kind: "none" },
    });
  });

  it("anything else: a generic failure with retry", () => {
    expect(aiErrorCopy(new Error("boom"), LINKS)).toMatchObject({
      tone: "error",
      title: "Something went wrong",
      next: { kind: "retry" },
    });
    expect(aiErrorCopy(new ApiClientError(500, "internal", "x"), LINKS).next.kind).toBe("retry");
  });
});
