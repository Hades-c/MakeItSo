import Link from "next/link";
import { Info, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
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

/**
 * The regeneration allowance is one daily count shared by every personal AI item (server/ai/usage.ts
 * ai-regenerations-<day>: 3 a day across the career plan and cold emails), so both panels say it the same way.
 */
export const REGENERATION_HINT = "Up to 3 new drafts a day, shared by your plan and your emails.";

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
    if (error.status === 400 || error.status === 403) {
      // A request the route rejects as malformed (400) or from the wrong origin (403) fails the same way again,
      // and each retry would spend the AI route's rate limit: the way out is a fresh page.
      return {
        tone: "error",
        title: "This page is out of date",
        message: "MakeItSo couldn’t accept this request. Reload the page and try again.",
        next: { kind: "none" },
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

/** Compact layout for the shared ErrorState inside a panel (it is a full-card block by default). */
const INLINE_ERROR =
  "items-start rounded-lg border-danger bg-danger-wash px-3.5 py-3.5 text-left shadow-none md:px-3.5 md:py-3.5 [&>span]:mb-2 [&>span]:size-8 [&>h2]:text-base [&>div]:mt-3 [&>div]:justify-start";

function NextStep({
  copy,
  onRetry,
  busy,
}: {
  copy: AiNoticeCopy;
  onRetry?: () => void;
  busy: boolean;
}) {
  if (copy.next.kind === "retry" && onRetry) {
    return (
      <Button
        variant="secondary"
        size="sm"
        aria-disabled={busy || undefined}
        onClick={() => {
          if (!busy) onRetry();
        }}
      >
        {copy.next.label}
      </Button>
    );
  }
  if (copy.next.kind === "link") {
    return (
      <Button asChild variant="secondary" size="sm">
        <Link href={copy.next.href}>{copy.next.label}</Link>
      </Button>
    );
  }
  return null;
}

/**
 * The notice: the title, the message and the next step. A failed attempt the student just made (`live`, error
 * tone) renders in the shared ErrorState (role alert, PLAN §6.1 "typed errors render in ErrorState with Retry"),
 * laid out compactly for a panel; a state of the account or the server (info tone: quota, consent, a gate known
 * when the page rendered) is a quieter status line with an info icon.
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
  const hasStep = (copy.next.kind === "retry" && Boolean(onRetry)) || copy.next.kind === "link";
  const step = hasStep ? <NextStep copy={copy} onRetry={onRetry} busy={busy} /> : undefined;
  if (live && copy.tone === "error") {
    return (
      <div data-testid={testId} className={className}>
        <ErrorState
          title={copy.title}
          description={copy.message}
          action={step}
          className={INLINE_ERROR}
        />
      </div>
    );
  }
  const Icon = copy.tone === "error" ? TriangleAlert : Info;
  return (
    <div
      role={live ? "status" : undefined}
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
        {step ? <div>{step}</div> : null}
      </div>
    </div>
  );
}
