import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HeaderActions, HeroActions } from "@/app/(marketing)/_components/account-actions";
import { isSignedIn, SESSION_CHECK_TIMEOUT_MS } from "@/app/(marketing)/_lib/session";

/**
 * The landing's session check: it decides only the header and hero buttons, never holds the page up (the buttons
 * stream in behind signed-out fallbacks) and gives up quickly when the session cannot be checked.
 */

const session = vi.hoisted(() => ({ getSessionUser: vi.fn() }));
vi.mock("@/server/auth", () => session);

const STUDENT = { id: "0123456789abcdef01234567", email: "casey@davidson.edu", name: "Casey" };

afterEach(() => {
  session.getSessionUser.mockReset();
  vi.useRealTimers();
});

describe("isSignedIn", () => {
  it("is true for a valid session and false without one", async () => {
    session.getSessionUser.mockResolvedValueOnce(STUDENT).mockResolvedValueOnce(null);
    await expect(isSignedIn()).resolves.toBe(true);
    await expect(isSignedIn()).resolves.toBe(false);
  });

  it("treats a session that cannot be read as signed out, and says why in the log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    session.getSessionUser.mockRejectedValue(new Error("NEXTAUTH_SECRET is not set"));
    await expect(isSignedIn()).resolves.toBe(false);
    expect(log).toHaveBeenCalledWith("[landing] could not read the session:", expect.any(Error));
  });

  it("gives up after its budget while the database does not answer (signed out)", async () => {
    vi.useFakeTimers();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    // A session claim checked against an unreachable MongoDB: server selection alone takes 5 s.
    session.getSessionUser.mockReturnValue(new Promise(() => {}));
    const answer = isSignedIn();
    await vi.advanceTimersByTimeAsync(SESSION_CHECK_TIMEOUT_MS - 1);
    let settled = false;
    void answer.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(answer).resolves.toBe(false);
    expect(SESSION_CHECK_TIMEOUT_MS).toBeLessThanOrEqual(1_500);
    expect(log).not.toHaveBeenCalled();
  });

  it("lets Next.js control flow through (dynamic rendering, redirects)", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/x;307;",
    });
    session.getSessionUser.mockRejectedValue(redirect);
    await expect(isSignedIn()).rejects.toBe(redirect);
  });
});

describe("HeaderActions and HeroActions", () => {
  it("offer sign-in and sign-up to visitors", async () => {
    session.getSessionUser.mockResolvedValue(null);
    render(
      <>
        {await HeaderActions()}
        {await HeroActions()}
      </>,
    );
    expect(screen.getAllByRole("link", { name: "Sign in" })).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute(
      "href",
      "/register",
    );
    expect(screen.getByRole("link", { name: /Create your account/ })).toHaveAttribute(
      "href",
      "/register",
    );
    expect(screen.queryByRole("link", { name: /Go to Today/ })).toBeNull();
  });

  it("offer Go to Today to signed-in students", async () => {
    session.getSessionUser.mockResolvedValue(STUDENT);
    render(
      <>
        {await HeaderActions()}
        {await HeroActions()}
      </>,
    );
    const today = screen.getAllByRole("link", { name: /Go to Today/ });
    expect(today).toHaveLength(2);
    for (const link of today) expect(link).toHaveAttribute("href", "/today");
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });
});
