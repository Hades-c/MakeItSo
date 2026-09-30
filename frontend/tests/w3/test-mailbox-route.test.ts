import { afterEach, describe, expect, it, vi } from "vitest";
import { getRequest } from "./helpers";
import { GET } from "@/app/api/auth/test-mailbox/route";
import { verificationEmail, alreadyRegisteredEmail } from "@/server/auth/emails";
import { clearConsoleOutbox, ConsoleMailer } from "@/server/auth/mailer";

afterEach(() => clearConsoleOutbox());

const read = (email: string) =>
  GET(getRequest(`/api/auth/test-mailbox?email=${encodeURIComponent(email)}`));

describe("GET /api/auth/test-mailbox (the e2e test mailer hook)", () => {
  it("lists the console mailer's messages to one address, with their codes", async () => {
    const mailer = new ConsoleMailer(() => new Date("2026-09-30T16:00:00Z"));
    await mailer.send(verificationEmail("casey@davidson.edu", "123456"));
    await mailer.send(alreadyRegisteredEmail("other@davidson.edu"));
    const res = await read("Casey@Davidson.edu");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const { messages } = (await res.json()) as { messages: Record<string, unknown>[] };
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      kind: "verify-email",
      to: "casey@davidson.edu",
      code: "123456",
      sentAt: "2026-09-30T16:00:00.000Z",
    });
  });

  it("does not exist outside the fixtures + console-mailer test setup, or anywhere on Vercel", async () => {
    vi.stubEnv("MAIL_PROVIDER", "none");
    expect((await read("casey@davidson.edu")).status).toBe(404);
    vi.stubEnv("MAIL_PROVIDER", "console");
    vi.stubEnv("EXTERNAL_MODE", "live");
    expect((await read("casey@davidson.edu")).status).toBe(404);
    vi.stubEnv("EXTERNAL_MODE", "fixtures");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect((await read("casey@davidson.edu")).status).toBe(404);
    vi.stubEnv("VERCEL_ENV", "");
    expect((await read("casey@davidson.edu")).status).toBe(200);
  });

  it("validates the address", async () => {
    expect((await read("not an email")).status).toBe(400);
    expect((await GET(getRequest("/api/auth/test-mailbox"))).status).toBe(400);
  });
});
