import "server-only";
import { z } from "zod";
import type { SyncedSourceId } from "@/lib/sources";
import { readEnv } from "@/server/env";
import { EXTERNAL_HOSTS, fetchExternal } from "@/server/http/external";

/**
 * Outgoing mail for mailbox verification and password resets (PLAN §1 "Sign-up", §6.1 W3).
 *
 *   const mailer = getMailer();          // null when MAIL_PROVIDER=none (verification unavailable)
 *   await mailer?.send(verificationEmail(to, code));
 *
 * Providers (MAIL_PROVIDER, server/env.ts):
 *   none     no mail: verification and "Forgot password" are unavailable and the UI says so. The production
 *            default until the owner picks a provider (PLAN §8).
 *   console  dev/test default: logs each message (with its code) on the server and keeps the last 50 in memory
 *            (consoleOutbox) for tests and the e2e test mailbox (app/api/auth/test-mailbox). Refused on Vercel
 *            production by server/env.ts.
 *   resend   https://api.resend.com/emails through fetchExternal (MAIL_API_KEY, MAIL_FROM). Needs "resend" in
 *            fetchExternal's host allow-list, which is a contract change (contractRequest); until the orchestrator
 *            adds it, the provider reports itself unavailable instead of calling out.
 */

export const MAIL_KINDS = [
  "verify-email",
  "already-registered",
  "signup-pending",
  "reset-password",
] as const;
export type MailKind = (typeof MAIL_KINDS)[number];

export interface MailMessage {
  kind: MailKind;
  to: string;
  subject: string;
  text: string;
  /** The one-time code in the message, if any (the console outbox exposes it to tests). */
  code?: string;
}

export interface SentMail extends MailMessage {
  sentAt: string;
  provider: MailerProvider;
}

export type MailerProvider = "console" | "resend";

export interface Mailer {
  readonly provider: MailerProvider;
  /** Deliver one message. Throws MailDeliveryError when the provider refuses it or is unreachable. */
  send(message: MailMessage): Promise<void>;
}

export class MailDeliveryError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "MailDeliveryError";
  }
}

// ---- Console -------------------------------------------------------------------------------------------------

const OUTBOX_SIZE = 50;

/** Shared across route bundles and hot reloads (each Next.js entry may carry its own copy of this module). */
const globalForMail = globalThis as typeof globalThis & { __makeitsoOutbox?: SentMail[] };

function outbox(): SentMail[] {
  globalForMail.__makeitsoOutbox ??= [];
  return globalForMail.__makeitsoOutbox;
}

/** Messages the console mailer "sent", oldest first (at most the last 50). */
export function consoleOutbox(): readonly SentMail[] {
  return outbox();
}

/** The newest console message, optionally only those to `to` (normalised address). */
export function lastConsoleMessage(to?: string): SentMail | undefined {
  const messages = outbox();
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message && (to === undefined || message.to === to)) return message;
  }
  return undefined;
}

/** Test helper: forget every console message. */
export function clearConsoleOutbox(): void {
  outbox().length = 0;
}

export class ConsoleMailer implements Mailer {
  readonly provider = "console" as const;

  constructor(private readonly clock: () => Date = () => new Date()) {}

  async send(message: MailMessage): Promise<void> {
    const box = outbox();
    box.push({ ...message, sentAt: this.clock().toISOString(), provider: this.provider });
    if (box.length > OUTBOX_SIZE) box.splice(0, box.length - OUTBOX_SIZE);
    if (readEnv("NODE_ENV") !== "test") {
      // Development only (server/env.ts refuses the console mailer on Vercel production).
      console.warn(
        `[mail:console] to=${message.to} kind=${message.kind}${message.code ? ` code=${message.code}` : ""} subject="${message.subject}"`,
      );
    }
  }
}

// ---- Resend --------------------------------------------------------------------------------------------------

export const RESEND_API_URL = "https://api.resend.com/emails";
const RESEND_SOURCE = "resend";
const RESEND_TIMEOUT_MS = 8_000;

export interface MailTransportRequest {
  url: string;
  headers: Readonly<Record<string, string>>;
  body: Readonly<Record<string, unknown>>;
}

/** One HTTP POST. Resolves with the parsed JSON body; throws on a non-2xx answer or a network failure. */
export type MailTransport = (request: MailTransportRequest) => Promise<unknown>;

const ResendResponseSchema = z.object({ id: z.string().min(1) });

/** True once fetchExternal's allow-list has a "resend" source with api.resend.com (a contract change). */
export function resendTransportAvailable(): boolean {
  const hosts = (EXTERNAL_HOSTS as Readonly<Record<string, readonly string[] | undefined>>)[
    RESEND_SOURCE
  ];
  return !!hosts?.includes(new URL(RESEND_API_URL).hostname);
}

/**
 * The production transport: fetchExternal("resend", ...). The cast is needed only until "resend" is a
 * fetchExternal source id (contractRequest); resendTransportAvailable() guards every call.
 */
export const fetchExternalTransport: MailTransport = async ({ url, headers, body }) => {
  const res = await fetchExternal(RESEND_SOURCE as unknown as SyncedSourceId, url, {
    method: "POST",
    parse: "json",
    headers,
    body,
    timeoutMs: RESEND_TIMEOUT_MS,
    maxBytes: 64 * 1024,
  });
  return res.data;
};

export interface ResendMailerOptions {
  apiKey: string;
  from: string;
  transport: MailTransport;
}

export class ResendMailer implements Mailer {
  readonly provider = "resend" as const;

  constructor(private readonly options: ResendMailerOptions) {}

  async send(message: MailMessage): Promise<void> {
    let data: unknown;
    try {
      data = await this.options.transport({
        url: RESEND_API_URL,
        headers: { authorization: `Bearer ${this.options.apiKey}` },
        body: {
          from: this.options.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
        },
      });
    } catch (error) {
      throw new MailDeliveryError(`Resend refused or did not answer (${message.kind})`, {
        cause: error,
      });
    }
    if (!ResendResponseSchema.safeParse(data).success) {
      throw new MailDeliveryError(`Unexpected Resend response (${message.kind})`);
    }
  }
}

// ---- Selection -----------------------------------------------------------------------------------------------

let transportOverride: MailTransport | undefined;

/** Test helper: route the Resend mailer through a fake transport (undefined restores fetchExternal). */
export function setMailTransportForTests(transport: MailTransport | undefined): void {
  transportOverride = transport;
}

/**
 * The configured mailer, or null when mail is unavailable: MAIL_PROVIDER=none, or "resend" before fetchExternal
 * allows api.resend.com. A misconfigured provider (e.g. "resend" without MAIL_API_KEY) throws EnvError, which
 * fails the request with a 500 (PLAN §2 "Env").
 */
export function getMailer(clock?: () => Date): Mailer | null {
  const provider = readEnv("MAIL_PROVIDER");
  switch (provider) {
    case "none":
      return null;
    case "console":
      return new ConsoleMailer(clock);
    case "resend": {
      const transport =
        transportOverride ?? (resendTransportAvailable() ? fetchExternalTransport : undefined);
      if (!transport) return null;
      return new ResendMailer({
        apiKey: readEnv("MAIL_API_KEY") ?? "",
        from: readEnv("MAIL_FROM") ?? "",
        transport,
      });
    }
    default: {
      const unknownProvider: never = provider;
      throw new Error(`Unknown mail provider: ${String(unknownProvider)}`);
    }
  }
}

/** Whether codes can be e-mailed (for pages and banners: a misconfiguration counts as unavailable here). */
export function isMailAvailable(): boolean {
  try {
    return getMailer() !== null;
  } catch (error) {
    console.error("[mail] mail provider is misconfigured:", error);
    return false;
  }
}
