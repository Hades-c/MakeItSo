import { afterEach, describe, expect, it, vi } from "vitest";
import {
  alreadyRegisteredEmail,
  passwordResetEmail,
  signupPendingEmail,
  verificationEmail,
} from "@/server/auth/emails";
import {
  clearConsoleOutbox,
  ConsoleMailer,
  consoleOutbox,
  getMailer,
  isMailAvailable,
  lastConsoleMessage,
  MailDeliveryError,
  RESEND_API_URL,
  ResendMailer,
  resendTransportAvailable,
  setMailTransportForTests,
  type MailTransportRequest,
} from "@/server/auth/mailer";
import { EnvError } from "@/server/env";
import { EXTERNAL_HOSTS } from "@/server/http/external";

afterEach(() => {
  setMailTransportForTests(undefined);
  clearConsoleOutbox();
});

describe("getMailer (MAIL_PROVIDER)", () => {
  it("is the console mailer by default outside production", () => {
    expect(getMailer()?.provider).toBe("console");
    expect(isMailAvailable()).toBe(true);
  });

  it("is null for none, and none is the production default", () => {
    vi.stubEnv("MAIL_PROVIDER", "none");
    expect(getMailer()).toBeNull();
    expect(isMailAvailable()).toBe(false);

    vi.stubEnv("MAIL_PROVIDER", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(getMailer()).toBeNull();
  });

  it("builds the Resend mailer only once fetchExternal can reach api.resend.com", () => {
    vi.stubEnv("MAIL_PROVIDER", "resend");
    vi.stubEnv("MAIL_API_KEY", "re_test_key");
    vi.stubEnv("MAIL_FROM", "MakeItSo <noreply@example.org>");
    // The contract gap (contractRequest): "resend" is not a fetchExternal source yet.
    expect(resendTransportAvailable()).toBe(
      !!(EXTERNAL_HOSTS as Record<string, readonly string[] | undefined>).resend,
    );
    if (!resendTransportAvailable()) expect(getMailer()).toBeNull();

    setMailTransportForTests(async () => ({ id: "email_1" }));
    expect(getMailer()?.provider).toBe("resend");
  });

  it("throws EnvError for a misconfigured provider, which isMailAvailable reports as unavailable", () => {
    vi.stubEnv("MAIL_PROVIDER", "resend");
    vi.stubEnv("MAIL_API_KEY", "");
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => getMailer()).toThrow(EnvError);
    expect(isMailAvailable()).toBe(false);
    expect(logged).toHaveBeenCalled();
  });
});

describe("ConsoleMailer", () => {
  it("keeps the last 50 messages with their codes for tests and the e2e mailbox", async () => {
    const mailer = new ConsoleMailer(() => new Date("2026-09-30T16:00:00Z"));
    await mailer.send(verificationEmail("casey@davidson.edu", "123456"));
    expect(lastConsoleMessage("casey@davidson.edu")).toMatchObject({
      kind: "verify-email",
      code: "123456",
      provider: "console",
      sentAt: "2026-09-30T16:00:00.000Z",
    });
    expect(lastConsoleMessage("nobody@davidson.edu")).toBeUndefined();
    for (let i = 0; i < 60; i++) await mailer.send(alreadyRegisteredEmail(`p${i}@davidson.edu`));
    expect(consoleOutbox()).toHaveLength(50);
    expect(lastConsoleMessage()?.to).toBe("p59@davidson.edu");
  });
});

describe("ResendMailer", () => {
  it("POSTs the message to the Resend API with the key", async () => {
    const requests: MailTransportRequest[] = [];
    const mailer = new ResendMailer({
      apiKey: "re_test_key",
      from: "MakeItSo <noreply@example.org>",
      transport: async (request) => {
        requests.push(request);
        return { id: "email_123" };
      },
    });
    await mailer.send(verificationEmail("casey@davidson.edu", "654321"));
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      url: RESEND_API_URL,
      headers: { authorization: "Bearer re_test_key" },
      body: {
        from: "MakeItSo <noreply@example.org>",
        to: ["casey@davidson.edu"],
        subject: "Your MakeItSo verification code",
      },
    });
    expect(String(requests[0]?.body.text)).toContain("654321");
    expect(RESEND_API_URL).toBe("https://api.resend.com/emails");
  });

  it("turns transport failures and unexpected answers into MailDeliveryError", async () => {
    const failing = new ResendMailer({
      apiKey: "k",
      from: "a@example.org",
      transport: async () => {
        throw new Error("HTTP 422");
      },
    });
    await expect(failing.send(alreadyRegisteredEmail("x@davidson.edu"))).rejects.toBeInstanceOf(
      MailDeliveryError,
    );
    const odd = new ResendMailer({
      apiKey: "k",
      from: "a@example.org",
      transport: async () => ({}),
    });
    await expect(odd.send(alreadyRegisteredEmail("x@davidson.edu"))).rejects.toBeInstanceOf(
      MailDeliveryError,
    );
  });
});

describe("account e-mails", () => {
  it("carry the code and links to the app, and say MakeItSo is not a Davidson service", () => {
    vi.stubEnv("APP_ORIGIN", "https://make-it-so.vercel.app");
    const verify = verificationEmail("casey@davidson.edu", "123456");
    expect(verify.text).toContain("123456");
    expect(verify.text).toContain("https://make-it-so.vercel.app/verify");
    expect(verify.text).toContain("not a Davidson College");
    expect(verify.text).toMatch(/15 minutes/);

    const reset = passwordResetEmail("casey@davidson.edu", "777777");
    expect(reset).toMatchObject({ kind: "reset-password", code: "777777" });
    expect(reset.text).toContain("https://make-it-so.vercel.app/forgot-password");
  });

  it("never put a code in the messages that go to an address someone else may have typed", () => {
    expect(alreadyRegisteredEmail("casey@davidson.edu").code).toBeUndefined();
    expect(alreadyRegisteredEmail("casey@davidson.edu").text).toContain("/login");
    const pending = signupPendingEmail("casey@davidson.edu");
    expect(pending.code).toBeUndefined();
    expect(pending.text).toContain("/forgot-password");
    expect(pending.text).toContain("/verify");
    // A pending sign-up may be days old or never have been sent a code (created while mail was off): the
    // message must not claim either.
    expect(pending.text).not.toMatch(/24 hours|earlier e-mail/);
  });

  it("fall back to a page name when the app origin is unknown", () => {
    vi.stubEnv("APP_ORIGIN", "");
    vi.stubEnv("NEXTAUTH_URL", "");
    vi.stubEnv("VERCEL_URL", "");
    expect(verificationEmail("c@davidson.edu", "123456").text).toContain(
      "the /verify page on MakeItSo",
    );
  });
});
