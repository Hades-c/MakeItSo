import { notFound } from "next/navigation";
import { accountApi } from "@/lib/api/account";
import { consoleOutbox } from "@/server/auth/mailer";
import { readEnv } from "@/server/env";
import { defineRoute } from "@/server/http";

/**
 * GET /api/auth/test-mailbox?email= — the e2e test mailer hook: the console mailer's recent messages to one
 * address, with their codes, so Playwright can register → verify → sign in without a real inbox.
 *
 * It exists only in the test setup: EXTERNAL_MODE=fixtures AND MAIL_PROVIDER=console AND not on Vercel at all
 * (server/env.ts already refuses fixtures and the console mailer on Vercel production; this also keeps it off
 * preview deployments). Everywhere else it answers like a path that does not exist, decided before anything about
 * the request is read (no query validation, no JSON error body): frontend/proxy.ts rewrites it to the app's
 * not-found page on every Vercel deployment and outside fixtures mode, and notFound() covers what is left (a
 * fixtures server without the console mailer).
 */
function testMailboxEnabled(): boolean {
  try {
    return (
      readEnv("EXTERNAL_MODE") === "fixtures" &&
      readEnv("MAIL_PROVIDER") === "console" &&
      !readEnv("VERCEL_ENV")
    );
  } catch {
    return false;
  }
}

const readMailbox = defineRoute(accountApi.testMailbox, async ({ query }) => {
  const messages = consoleOutbox()
    .filter((message) => message.to === query.email)
    .map(({ kind, to, subject, text, code, sentAt }) => ({
      kind,
      to,
      subject,
      text,
      code: code ?? null,
      sentAt,
    }));
  return { messages };
});

export const GET = defineRoute(
  {
    method: accountApi.testMailbox.method,
    path: accountApi.testMailbox.path,
    auth: accountApi.testMailbox.auth,
  },
  async ({ request }) => {
    if (!testMailboxEnabled()) notFound();
    return readMailbox(request);
  },
);
