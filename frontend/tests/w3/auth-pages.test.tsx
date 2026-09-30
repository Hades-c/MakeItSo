import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FormAlert } from "@/app/(auth)/_components/form-alert";
import { VerifyBanner } from "@/app/(auth)/_components/verify-banner";
import { signInErrorMessage } from "@/app/(auth)/_lib/sign-in-errors";
import { ForgotPasswordForm } from "@/app/(auth)/forgot-password/_components/forgot-password-form";
import { LoginForm } from "@/app/(auth)/login/_components/login-form";
import { RegisterForm } from "@/app/(auth)/register/_components/register-form";
import { VerifyForm } from "@/app/(auth)/verify/_components/verify-form";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
const nextAuth = vi.hoisted(() => ({ signIn: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next-auth/react", () => ({ signIn: nextAuth.signIn }));

type FetchCall = { url: string; init: RequestInit };
let calls: FetchCall[] = [];

/** Answer callApi's fetches in order with [status, body] pairs. */
function stubFetch(...answers: [number, unknown][]) {
  calls = [];
  const queue = [...answers];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const [status, body] = queue.shift() ?? [500, {}];
      return new Response(status === 204 ? null : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

beforeEach(() => {
  router.replace.mockReset();
  router.refresh.mockReset();
  nextAuth.signIn.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const alert = () => screen.getByRole("alert");

describe("signInErrorMessage", () => {
  it("shows only known codes and our own messages", () => {
    expect(signInErrorMessage("CredentialsSignin")).toBe("Invalid email or password");
    expect(signInErrorMessage("Too many sign-in attempts. Wait 5 minutes and try again.")).toMatch(
      /^Too many/,
    );
    expect(signInErrorMessage("Call 555-0100 to unlock your account")).toBe(
      "Sign-in failed. Please try again.",
    );
    expect(signInErrorMessage(undefined)).toBeNull();
  });
});

describe("LoginForm", () => {
  it("signs in and continues to the callback path", async () => {
    nextAuth.signIn.mockResolvedValue({ ok: true, error: null });
    render(<LoginForm callbackPath="/plan?tab=next" />);
    await userEvent.type(screen.getByLabelText("Email"), "casey@davidson.edu");
    await userEvent.type(screen.getByLabelText("Password"), "correct horse battery");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(nextAuth.signIn).toHaveBeenCalledWith("credentials", {
      email: "casey@davidson.edu",
      password: "correct horse battery",
      redirect: false,
    });
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/plan?tab=next"));
    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });

  it("shows one message for wrong credentials, and the server's refusal text", async () => {
    nextAuth.signIn.mockResolvedValueOnce({ ok: false, error: "CredentialsSignin" });
    render(<LoginForm callbackPath="/today" />);
    await userEvent.type(screen.getByLabelText("Email"), "casey@davidson.edu");
    await userEvent.type(screen.getByLabelText("Password"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");

    nextAuth.signIn.mockResolvedValueOnce({
      ok: false,
      error: "Too many failed sign-in attempts for this address. Wait 30 seconds and try again.",
    });
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(alert()).toHaveTextContent(/Wait 30 seconds/));
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("renders an initial error from the URL (already filtered on the server)", () => {
    render(<LoginForm callbackPath="/today" initialError="Sign in to continue." />);
    expect(alert()).toHaveTextContent("Sign in to continue.");
  });
});

const CLASS_YEARS = [
  { label: "First-year", graduationYear: 2030 },
  { label: "Senior", graduationYear: 2027 },
];

async function fillRegister(email = "casey@davidson.edu", password = "correct horse battery") {
  await userEvent.type(screen.getByLabelText("Full name"), "Casey Wildcat");
  await userEvent.type(screen.getByLabelText("Email"), email);
  await userEvent.type(screen.getByLabelText("Password"), password);
  await userEvent.click(screen.getByRole("button", { name: "Create account" }));
}

describe("RegisterForm", () => {
  it("validates on the client with the shared schema before sending anything", async () => {
    stubFetch();
    render(<RegisterForm classYears={CLASS_YEARS} mailAvailable />);
    expect(screen.getByLabelText("Class year")).toHaveTextContent("First-year");
    await fillRegister("casey@gmail.com", "short");
    expect(await screen.findByText("Use your @davidson.edu email address")).toBeInTheDocument();
    expect(screen.getByText("Use at least 10 characters")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(calls).toHaveLength(0);
  });

  it("registers, signs in and continues to /verify", async () => {
    stubFetch([202, { status: "check-inbox", message: "Check your Davidson inbox." }]);
    nextAuth.signIn.mockResolvedValue({ ok: true, error: null });
    render(<RegisterForm classYears={CLASS_YEARS} mailAvailable />);
    await fillRegister();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/verify"));
    expect(calls[0]?.url).toBe("/api/auth/register");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      name: "Casey Wildcat",
      email: "casey@davidson.edu",
      password: "correct horse battery",
      graduationYear: 2030,
    });
  });

  it("goes to /today when verification is unavailable", async () => {
    stubFetch([202, { status: "check-inbox", message: "Sign in with your password." }]);
    nextAuth.signIn.mockResolvedValue({ ok: true, error: null });
    render(<RegisterForm classYears={CLASS_YEARS} mailAvailable={false} />);
    await fillRegister();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/today"));
  });

  it("shows 'check your inbox' (never 'already registered') when signing in does not follow", async () => {
    stubFetch([
      202,
      { status: "check-inbox", message: "Check your Davidson inbox: we sent a message." },
    ]);
    nextAuth.signIn.mockResolvedValue({ ok: false, error: "CredentialsSignin" });
    render(<RegisterForm classYears={CLASS_YEARS} mailAvailable />);
    await fillRegister();
    expect(
      await screen.findByRole("heading", { name: "Check your Davidson inbox" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("we sent a message");
    expect(document.body).not.toHaveTextContent(/already (registered|exists)/i);
  });

  it("shows the server's field errors (e.g. a common password)", async () => {
    stubFetch([
      400,
      {
        error: {
          code: "validation_failed",
          message: "Some fields are invalid.",
          issues: [
            { path: "password", message: "This password is on a list of commonly used passwords." },
          ],
        },
      },
    ]);
    render(<RegisterForm classYears={CLASS_YEARS} mailAvailable />);
    await fillRegister("casey@davidson.edu", "basketball1");
    expect(await screen.findByText(/commonly used passwords/)).toBeInTheDocument();
  });

  it("reports a rate limit in an alert", async () => {
    stubFetch([
      429,
      {
        error: {
          code: "rate_limited",
          message: "Too many requests. Please wait a moment and try again.",
        },
      },
    ]);
    render(<RegisterForm classYears={CLASS_YEARS} mailAvailable />);
    await fillRegister();
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many requests");
  });
});

describe("VerifyForm", () => {
  it("verifies the code and continues", async () => {
    stubFetch([200, { verified: true, emailVerifiedAt: "2026-09-30T16:00:00.000Z" }]);
    render(<VerifyForm email="casey@davidson.edu" next="/alumni" />);
    expect(screen.getByText("casey@davidson.edu")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Verification code"), "123 456");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/alumni"));
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ code: "123456" });
  });

  it("shows why a code failed, and confirms a resend", async () => {
    stubFetch(
      [
        400,
        {
          error: {
            code: "validation_failed",
            message: "Some fields are invalid.",
            issues: [{ path: "code", message: "That code is not right. 4 attempts left." }],
          },
        },
      ],
      [202, { sent: true }],
    );
    render(<VerifyForm email="casey@davidson.edu" next="/today" notice="Why you are here." />);
    expect(screen.getAllByRole("status")[0]).toHaveTextContent("Why you are here.");
    await userEvent.type(screen.getByLabelText("Verification code"), "000000");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("4 attempts left");
    await userEvent.click(screen.getByRole("button", { name: "Send a new code" }));
    expect(
      await screen.findByText("We sent a new code to casey@davidson.edu."),
    ).toBeInTheDocument();
  });

  it("checks the format before sending", async () => {
    stubFetch();
    render(<VerifyForm email="casey@davidson.edu" next="/today" />);
    await userEvent.type(screen.getByLabelText("Verification code"), "12ab");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter the 6-digit code");
    expect(calls).toHaveLength(0);
  });
});

describe("ForgotPasswordForm", () => {
  it("requests a code, then resets and signs in", async () => {
    stubFetch(
      [
        202,
        {
          status: "check-inbox",
          message: "If an account uses that address, we sent it a reset code.",
        },
      ],
      [204, null],
    );
    nextAuth.signIn.mockResolvedValue({ ok: true, error: null });
    render(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText("Email"), "Casey@Davidson.edu");
    await userEvent.click(screen.getByRole("button", { name: "Send reset code" }));
    expect(
      await screen.findByRole("heading", { name: "Choose a new password" }),
    ).toBeInTheDocument();
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ email: "casey@davidson.edu" });
    await userEvent.type(screen.getByLabelText("Reset code"), "123456");
    await userEvent.type(screen.getByLabelText("New password"), "brand new passphrase");
    await userEvent.click(screen.getByRole("button", { name: "Set new password" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/today"));
    expect(calls[1]?.url).toBe("/api/auth/password-reset/confirm");
  });
});

describe("VerifyBanner", () => {
  it("links to /verify and warns about replacement only for new sign-ups", () => {
    const { rerender } = render(
      <VerifyBanner email="casey@davidson.edu" replaceable hoursLeft={19} />,
    );
    expect(screen.getByRole("heading", { name: "Verify your Davidson email" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Enter code" })).toHaveAttribute("href", "/verify");
    expect(screen.getByTestId("verify-banner")).toHaveTextContent(
      "replace this account in 19 hours",
    );
    rerender(<VerifyBanner email="casey@davidson.edu" replaceable={false} hoursLeft={null} />);
    expect(screen.getByTestId("verify-banner")).not.toHaveTextContent(/replace/);
  });
});

describe("FormAlert", () => {
  it("announces errors as alerts and notices as status, with text", () => {
    render(
      <>
        <FormAlert>Broken</FormAlert>
        <FormAlert tone="info" title="Heads up">
          Details
        </FormAlert>
      </>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Broken");
    expect(screen.getByRole("status")).toHaveTextContent("Heads upDetails");
  });
});
