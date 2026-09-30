import { authExtraApi } from "@/app/(auth)/_lib/contracts";
import { consoleOutbox } from "@/server/auth/mailer";
import { readEnv } from "@/server/env";
import { ApiError, defineRoute } from "@/server/http";

/**
 * GET /api/auth/test-mailbox?email= — the e2e test mailer hook: the console mailer's recent messages to one
 * address, with their codes, so Playwright can register → verify → sign in without a real inbox.
 *
 * It exists only in the test setup: EXTERNAL_MODE=fixtures AND MAIL_PROVIDER=console AND not on Vercel at all
 * (server/env.ts already refuses fixtures and the console mailer on Vercel production; this also keeps it off
 * preview deployments). Everywhere else it is a 404 indistinguishable from a missing route.
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

export const GET = defineRoute(authExtraApi.testMailbox, async ({ query }) => {
  if (!testMailboxEnabled()) throw new ApiError(404, "not_found", "Not found.");
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
