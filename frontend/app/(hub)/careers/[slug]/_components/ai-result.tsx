import Link from "next/link";
import { Info, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiClientError } from "@/lib/api/client";
import { AI_FAILURE_MESSAGES, type AiFailure, type AiFailureKind } from "@/lib/types/ai";
import { cn } from "@/lib/utils";

/**
 * What the career page's AI panels say for every AiResult failure kind, and the one next step that helps (PLAN
 * §4.1.8, §9 "AI wire format"). Pure, so each kind is unit-tested; the panels render it with <AiNotice>.
 *
 *   retry          the same request may well work now (truncated, invalid, timeout, unavailable, network, 500)
 *   verify         an @davidson.edu account whose mailbox is not verified yet (only while /verify can send a code)
 *   consent        AI is off for this student: the profile's "AI features" section turns it on
 *   sign-in        the session ended (a 401 from the route)
 *   none           nothing the student can do now (refused, quota, budget, not_configured, disabled, …)
 *
 * The message is the server's when it sent one (W6 may be more specific than the default), else the default for
 * the kind. A refusal is not retried: asking again would only spend a request.
 */

export type AiNextStep =
  | { kind: "retry"; label: string }
  | { kind: "link"; href: string; label: string }
  | { kind: "none" };

export interface AiNoticeCopy {
  tone: "info" | "error";
  title: string;
  message: string;
  next: AiNextStep;
}

/** Hrefs the server resolves for the next steps (the client cannot build /verify?next=… itself). */
export interface AiStepLinks {
  /** /verify?reason=davidson&next=<this page>, or null when verifying would not help or cannot send a code. */
  verify: string | null;
  /** The profile's AI features section. */
  consent: string;
  /** /login?callbackUrl=<this page>. */
  signIn: string;
}

const TITLES: Readonly<Record<AiFailureKind, string>> = {
  refused: "The AI declined this request",
  truncated: "The answer was cut off",
  invalid: "The answer didn’t pass MakeItSo’s checks",
  quota: "You’ve used today’s AI requests",
  budget: "AI is paused for today",
  timeout: "The AI took too long",
  unavailable: "AI is busy right now",
  not_configured: "AI isn’t set up yet",
  disabled: "AI features are turned off",
  consent_required: "Turn on AI features first",
  unverified: "AI is for verified Davidson accounts",
};

const RETRY_KINDS: ReadonlySet<AiFailureKind> = new Set([
  "truncated",
  "invalid",
  "timeout",
  "unavailable",
]);

/** Kinds that are a state of the account or the server rather than a failed attempt (shown as info). */
const INFO_KINDS: ReadonlySet<AiFailureKind> = new Set([
  "quota",
  "budget",
  "not_configured",
  "disabled",
  "consent_required",
  "unverified",
]);

export function aiFailureCopy(failure: AiFailure, links: AiStepLinks): AiNoticeCopy {
  const message = failure.message.trim() || AI_FAILURE_MESSAGES[failure.kind];
  const base = {
    tone: INFO_KINDS.has(failure.kind) ? ("info" as const) : ("error" as const),
    title: TITLES[failure.kind],
    message,
  };
  if (RETRY_KINDS.has(failure.kind))
    return { ...base, next: { kind: "retry", label: "Try again" } };
  if (failure.kind === "consent_required") {
    return { ...base, next: { kind: "link", href: links.consent, label: "Open AI settings" } };
  }
  if (failure.kind === "unverified" && links.verify) {
    return { ...base, next: { kind: "link", href: links.verify, label: "Verify your email" } };
  }
  return { ...base, next: { kind: "none" } };
}

/** What a thrown error (outside the AiResult wire format) means: signed out, a route limit, or a fault. */
export function aiErrorCopy(error: unknown, links: AiStepLinks): AiNoticeCopy {
  if (error instanceof ApiClientError) {
    if (error.status === 401) {
      return {
        tone: "info",
        title: "Your session has ended",
        message: "Sign in again to use the AI features.",
        next: { kind: "link", href: links.signIn, label: "Sign in" },
      };
    }
    if (error.status === 429) {
      return {
        tone: "info",
        title: "Too many requests",
        message: "Please wait a minute before asking again.",
        next: { kind: "retry", label: "Try again" },
      };
    }
    if (error.status === 404) {
      return {
        tone: "error",
        title: "Not available",
        message: error.message || "This is no longer available.",
        next: { kind: "none" },
      };
    }
    if (error.code === "network") {
      return {
        tone: "error",
        title: "Could not reach MakeItSo",
        message: error.message,
        next: { kind: "retry", label: "Try again" },
      };
    }
  }
  return {
    tone: "error",
    title: "Something went wrong",
    message: "The request failed. Please try again.",
    next: { kind: "retry", label: "Try again" },
  };
}

/**
 * The notice: an icon, the title, the message and the next step. `live` announces it (a result of the student's
 * click); a state known when the page rendered (gate) is plain content.
 */
export function AiNotice({
  copy,
  onRetry,
  live = true,
  busy = false,
  className,
  testId,
}: {
  copy: AiNoticeCopy;
  onRetry?: () => void;
  live?: boolean;
  busy?: boolean;
  className?: string;
  testId?: string;
}) {
  const Icon = copy.tone === "error" ? TriangleAlert : Info;
  return (
    <div
      role={live ? (copy.tone === "error" ? "alert" : "status") : undefined}
      data-testid={testId}
      className={cn(
        "flex gap-3 rounded-lg border p-3.5 text-sm",
        copy.tone === "error" ? "border-danger bg-danger-wash" : "border-line bg-surface-2",
        className,
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          "mt-0.5 size-4 shrink-0",
          copy.tone === "error" ? "text-danger" : "text-fg-2",
        )}
      />
      <div className="flex min-w-0 flex-col gap-2">
        <p className="font-semibold text-fg">{copy.title}</p>
        <p className="text-fg-2">{copy.message}</p>
        {copy.next.kind === "retry" && onRetry ? (
          <div>
            <Button variant="secondary" size="sm" onClick={onRetry} disabled={busy}>
              {copy.next.label}
            </Button>
          </div>
        ) : null}
        {copy.next.kind === "link" ? (
          <div>
            <Button asChild variant="secondary" size="sm">
              <Link href={copy.next.href}>{copy.next.label}</Link>
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
