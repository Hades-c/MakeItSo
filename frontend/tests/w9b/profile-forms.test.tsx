import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AcademicsForm } from "@/app/(hub)/profile/_components/academics-form";
import { AiConsentPanel } from "@/app/(hub)/profile/_components/ai-consent-panel";
import { DeleteAccount, DownloadData } from "@/app/(hub)/profile/_components/data-controls";
import { InterestsPicker } from "@/app/(hub)/profile/_components/interests-picker";
import { NameForm } from "@/app/(hub)/profile/_components/name-form";
import { PasswordForm } from "@/app/(hub)/profile/_components/password-form";
import { SignOutEverywhere } from "@/app/(hub)/profile/_components/sign-out-everywhere";
import type { CareerOption } from "@/app/(hub)/profile/_lib/load";
import type { Profile } from "@/lib/api/profile";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
const nextAuth = vi.hoisted(() => ({ signIn: vi.fn() }));
const nav = vi.hoisted(() => ({ hardNavigate: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next-auth/react", () => ({ signIn: nextAuth.signIn }));
vi.mock("@/app/(hub)/profile/_lib/navigate", () => nav);

const NOW = "2026-09-30T16:00:00.000Z";
const TZ = "America/New_York";

const PROFILE: Profile = {
  id: "0123456789abcdef01234567",
  name: "Casey Wildcat",
  email: "casey@davidson.edu",
  emailVerifiedAt: null,
  davidson: true,
  majors: [],
  minors: [],
  graduationYear: 2029,
  firstTerm: null,
  standingOverride: null,
  interests: [],
  aiConsentAt: null,
  adultAttestedAt: null,
  onboardedAt: null,
  createdAt: NOW,
};

type FetchCall = { url: string; method: string; body: unknown };
let calls: FetchCall[] = [];

/** Answer callApi's fetches in order with [status, body] pairs (or a promise of one, to hold an answer back). */
function stubFetch(...answers: ([number, unknown] | Promise<[number, unknown]>)[]) {
  calls = [];
  const queue = [...answers];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({
        url,
        method: init.method ?? "GET",
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      });
      const [status, body] = await (queue.shift() ?? [500, {}]);
      return new Response(status === 204 ? null : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

function profileAnswer(patch: Partial<Profile> = {}): [number, unknown] {
  return [200, { profile: { ...PROFILE, ...patch } }];
}

function invalid(issues: { path: string; message: string }[]): [number, unknown] {
  return [
    400,
    { error: { code: "validation_failed", message: "Some fields are invalid.", issues } },
  ];
}

beforeAll(() => {
  // Radix Select measures and captures the pointer; jsdom has neither.
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => undefined;
  Element.prototype.scrollIntoView ??= () => undefined;
});

beforeEach(() => {
  router.refresh.mockReset();
  nextAuth.signIn.mockReset();
  nav.hardNavigate.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const alertWith = (text: string | RegExp) =>
  screen
    .getAllByRole("alert")
    .find((el) =>
      typeof text === "string" ? el.textContent?.includes(text) : text.test(el.textContent ?? ""),
    );

async function choose(trigger: HTMLElement, option: string) {
  await userEvent.click(trigger);
  await userEvent.click(await screen.findByRole("option", { name: option }));
}

describe("NameForm", () => {
  it("saves the name and refreshes the shell", async () => {
    stubFetch(profileAnswer({ name: "Casey Q. Wildcat" }));
    render(<NameForm initialName="Casey Wildcat" />);
    const save = screen.getByRole("button", { name: "Save name" });
    expect(save).toBeDisabled();
    const input = screen.getByLabelText("Name");
    await userEvent.clear(input);
    await userEvent.type(input, "Casey Q. Wildcat");
    await userEvent.click(save);
    expect(calls).toEqual([
      { url: "/api/profile", method: "PATCH", body: { name: "Casey Q. Wildcat" } },
    ]);
    expect(await screen.findByText("Name saved.")).toHaveAttribute("role", "status");
    expect(router.refresh).toHaveBeenCalled();
    expect(save).toBeDisabled();
  });

  it("announces a blank name and focuses the field, without a request", async () => {
    stubFetch();
    render(<NameForm initialName="Casey" />);
    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.type(screen.getByLabelText("Name"), "  ");
    await userEvent.click(screen.getByRole("button", { name: "Save name" }));
    expect(alertWith("Name: Enter your name.")).toBeDefined();
    expect(screen.getByLabelText("Name")).toHaveFocus();
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");
    expect(calls).toEqual([]);
  });

  it("shows a server field error on the field", async () => {
    stubFetch(invalid([{ path: "name", message: "Too long." }]));
    render(<NameForm initialName="Casey" />);
    await userEvent.type(screen.getByLabelText("Name"), " W");
    await userEvent.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(alertWith("Name: Too long.")).toBeDefined());
    expect(screen.getByLabelText("Name")).toHaveFocus();
  });
});

const MAJORS = [
  "Major in Biology (B.S. Degree)",
  "Major in Computer Science (B.S. Degree)",
  "Major in Economics (A.B. Degree)",
];
const MINORS = ["Minor in Economics", "Interdisciplinary Minor in Data Science"];

function academics(initial: Partial<Profile> = {}) {
  const values = { ...PROFILE, ...initial };
  return render(
    <AcademicsForm
      initial={{
        majors: values.majors,
        minors: values.minors,
        graduationYear: values.graduationYear,
        firstTerm: values.firstTerm,
        standingOverride: values.standingOverride,
      }}
      majorNames={MAJORS}
      minorNames={MINORS}
      now={NOW}
    />,
  );
}

describe("AcademicsForm", () => {
  it("adds majors and a minor, sets the year, first term and standing, and saves every field", async () => {
    stubFetch(
      profileAnswer({
        majors: ["Major in Computer Science (B.S. Degree)", "Major in Economics (A.B. Degree)"],
        minors: ["Minor in Economics"],
        graduationYear: 2028,
        firstTerm: "202401",
        standingOverride: "junior",
      }),
    );
    academics();
    const save = screen.getByRole("button", { name: "Save academics" });
    expect(save).toBeDisabled();
    expect(screen.getByText("No major chosen.")).toBeInTheDocument();
    expect(screen.getByLabelText("Class standing")).toHaveAccessibleDescription(
      /Now: Sophomore \(from your graduation year\)/,
    );

    await userEvent.click(screen.getByRole("button", { name: "Add a major" }));
    await choose(screen.getByLabelText("Major 1"), "Major in Computer Science (B.S. Degree)");
    await userEvent.click(screen.getByRole("button", { name: "Add a major" }));
    // A major already chosen is not offered again.
    await userEvent.click(screen.getByLabelText("Major 2"));
    expect(
      screen.queryByRole("option", { name: "Major in Computer Science (B.S. Degree)" }),
    ).toBeNull();
    await userEvent.click(screen.getByRole("option", { name: "Major in Economics (A.B. Degree)" }));
    await userEvent.click(screen.getByRole("button", { name: "Add a minor" }));
    await choose(screen.getByLabelText("Minor 1"), "Minor in Economics");

    await choose(screen.getByLabelText("Graduation year"), "Class of 2028");
    expect(screen.getByLabelText("Class standing")).toHaveAccessibleDescription(
      /Now: Junior \(from/,
    );
    await choose(screen.getByLabelText("First term at Davidson"), "Fall 2024");
    await choose(screen.getByLabelText("Class standing"), "Junior");
    expect(screen.getByLabelText("Class standing")).toHaveAccessibleDescription(
      /Junior \(set by you\)/,
    );

    await userEvent.click(save);
    expect(calls).toEqual([
      {
        url: "/api/profile",
        method: "PATCH",
        body: {
          majors: ["Major in Computer Science (B.S. Degree)", "Major in Economics (A.B. Degree)"],
          minors: ["Minor in Economics"],
          graduationYear: 2028,
          firstTerm: "202401",
          standingOverride: "junior",
        },
      },
    ]);
    expect(await screen.findByText("Academics saved.")).toHaveAttribute("role", "status");
    expect(save).toBeDisabled();
  });

  it("clears: removing every major, Not set and From my graduation year send [] and null", async () => {
    stubFetch(profileAnswer());
    academics({
      majors: ["Major in Biology (B.S. Degree)"],
      firstTerm: "202501",
      standingOverride: "senior",
    });
    expect(screen.getByLabelText("First term at Davidson")).toHaveTextContent("Fall 2025");
    await userEvent.click(
      screen.getByRole("button", { name: "Remove Major in Biology (B.S. Degree)" }),
    );
    expect(screen.getByText("No major chosen.")).toBeInTheDocument();
    await choose(screen.getByLabelText("First term at Davidson"), "Not set");
    expect(screen.getByLabelText("First term at Davidson")).toHaveAccessibleDescription(
      "Not set: MakeItSo assumes Fall 2025.",
    );
    await choose(screen.getByLabelText("Class standing"), "From my graduation year (Sophomore)");
    await userEvent.click(screen.getByRole("button", { name: "Save academics" }));
    expect(calls[0]?.body).toEqual({
      majors: [],
      minors: [],
      graduationYear: 2029,
      firstTerm: null,
      standingOverride: null,
    });
    expect(await screen.findByText("Academics saved.")).toBeInTheDocument();
  });

  it("stops a first term that no longer fits the graduation year before sending", async () => {
    stubFetch();
    academics({ firstTerm: "202601" });
    await choose(screen.getByLabelText("Graduation year"), "Class of 2026");
    await userEvent.click(screen.getByRole("button", { name: "Save academics" }));
    expect(
      alertWith(
        "First term at Davidson: The first term and the graduation year do not fit together.",
      ),
    ).toBeDefined();
    expect(screen.getByLabelText("First term at Davidson")).toHaveFocus();
    expect(calls).toEqual([]);
  });

  it("puts the server's issues on their fields and focuses the first", async () => {
    stubFetch(invalid([{ path: "majors.0", message: "Pick a name from the list of programs." }]));
    academics({ majors: ["Major in Biology (B.S. Degree)"] });
    await userEvent.click(screen.getByRole("button", { name: "Add a major" }));
    await choose(screen.getByLabelText("Major 2"), "Major in Economics (A.B. Degree)");
    await userEvent.click(screen.getByRole("button", { name: "Save academics" }));
    await waitFor(() =>
      expect(alertWith("Majors: Pick a name from the list of programs.")).toBeDefined(),
    );
    const majors = screen.getByRole("group", { name: "Majors" });
    expect(majors).toHaveFocus();
    expect(majors).toHaveAccessibleDescription("Pick a name from the list of programs.");
  });

  it("says when the network fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("offline"))),
    );
    academics({ majors: ["Major in Biology (B.S. Degree)"] });
    await choose(screen.getByLabelText("Graduation year"), "Class of 2030");
    await userEvent.click(screen.getByRole("button", { name: "Save academics" }));
    await waitFor(() => expect(alertWith("Could not reach MakeItSo")).toBeDefined());
  });
});

const CAREERS: CareerOption[] = [
  { slug: "software-engineering", name: "Software Engineering", cluster: "Technology" },
  { slug: "data-science", name: "Data Science & Analytics", cluster: "Technology" },
  { slug: "law", name: "Law", cluster: "Law & Government" },
];

describe("InterestsPicker", () => {
  it("groups the career paths and toggles them at once", async () => {
    stubFetch([200, { profile: { ...PROFILE, interests: ["law"] } }]);
    render(<InterestsPicker initial={[]} careers={CAREERS} />);
    expect(screen.getByRole("group", { name: "Technology" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Law & Government" })).toBeInTheDocument();
    const law = screen.getByRole("button", { name: "Law" });
    expect(law).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(law);
    expect(law).toHaveAttribute("aria-pressed", "true");
    await waitFor(() =>
      expect(screen.getByTestId("interests-status")).toHaveTextContent("1 of 3 chosen, saved."),
    );
    expect(calls).toEqual([{ url: "/api/profile", method: "PATCH", body: { interests: ["law"] } }]);
  });

  it("serialises quick taps: one request at a time, the last one with every choice", async () => {
    let release!: (answer: [number, unknown]) => void;
    const first = new Promise<[number, unknown]>((resolve) => {
      release = resolve;
    });
    stubFetch(first, [
      200,
      { profile: { ...PROFILE, interests: ["software-engineering", "law"] } },
    ]);
    render(<InterestsPicker initial={[]} careers={CAREERS} />);
    await userEvent.click(screen.getByRole("button", { name: "Software Engineering" }));
    await userEvent.click(screen.getByRole("button", { name: "Law" }));
    expect(screen.getByTestId("interests-status")).toHaveTextContent("Saving…");
    expect(calls).toHaveLength(1);
    await act(async () =>
      release([200, { profile: { ...PROFILE, interests: ["software-engineering"] } }]),
    );
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls.map((c) => c.body)).toEqual([
      { interests: ["software-engineering"] },
      { interests: ["software-engineering", "law"] },
    ]);
    await waitFor(() =>
      expect(screen.getByTestId("interests-status")).toHaveTextContent("2 of 3 chosen, saved."),
    );
  });

  it("puts the chips back and says so when a save fails", async () => {
    let release!: (answer: [number, unknown]) => void;
    stubFetch(
      new Promise<[number, unknown]>((resolve) => {
        release = resolve;
      }),
    );
    render(<InterestsPicker initial={["law"]} careers={CAREERS} />);
    const data = screen.getByRole("button", { name: "Data Science & Analytics" });
    await userEvent.click(data);
    // Optimistic: pressed before the server answers.
    expect(data).toHaveAttribute("aria-pressed", "true");
    await act(async () =>
      release([
        429,
        { error: { code: "rate_limited", message: "Too many changes. Wait a minute." } },
      ]),
    );
    await waitFor(() => expect(alertWith("Too many changes. Wait a minute.")).toBeDefined());
    expect(data).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Law" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("interests-status")).toHaveTextContent("1 of 3 chosen.");
  });
});

function consent(patch: Partial<Parameters<typeof AiConsentPanel>[0]> = {}) {
  return render(
    <AiConsentPanel
      aiConsentAt={null}
      adultAttestedAt={null}
      aiEnabled
      verifiedDavidson
      davidson
      timeZone={TZ}
      {...patch}
    />,
  );
}

describe("AiConsentPanel", () => {
  it("states what is sent, to whom, and what never is", () => {
    consent();
    const notice = screen.getByRole("heading", {
      name: /What turning them on means/,
    }).parentElement!;
    expect(notice).toHaveTextContent("Claude, a model made by Anthropic");
    expect(notice).toHaveTextContent("course codes and public catalog information");
    expect(notice).toHaveTextContent(
      "never sends your name, your email address, your account id or any grades",
    );
    expect(
      within(notice).getByRole("link", { name: "More in the privacy notice" }),
    ).toHaveAttribute("href", "/privacy#ai");
    expect(screen.getByTestId("ai-consent-state")).toHaveTextContent("Off");
  });

  it("needs the 18+ attestation before anything is sent", async () => {
    stubFetch();
    consent();
    await userEvent.click(screen.getByRole("button", { name: "Turn on AI features" }));
    expect(alertWith("Confirm that you are 18 or older to turn on AI features.")).toBeDefined();
    expect(screen.getByRole("checkbox", { name: "I am 18 or older" })).toHaveFocus();
    expect(calls).toEqual([]);
  });

  it("turns AI on with the attestation, and off again", async () => {
    stubFetch(
      profileAnswer({ aiConsentAt: NOW, adultAttestedAt: NOW }),
      profileAnswer({ aiConsentAt: null, adultAttestedAt: NOW }),
    );
    consent();
    await userEvent.click(screen.getByRole("checkbox", { name: "I am 18 or older" }));
    await userEvent.click(screen.getByRole("button", { name: "Turn on AI features" }));
    expect(await screen.findByText("AI features are on.")).toHaveAttribute("role", "status");
    expect(screen.getByTestId("ai-consent-state")).toHaveTextContent(
      "OnYou turned AI features on Sep 30, 2026.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Turn off AI features" }));
    expect(await screen.findByText("AI features are off.")).toBeInTheDocument();
    expect(screen.getByTestId("ai-consent-state")).toHaveTextContent("Off");
    // The attestation stays, so turning back on is one click.
    expect(screen.getByRole("checkbox", { name: "I am 18 or older" })).toBeChecked();
    expect(calls).toEqual([
      { url: "/api/profile/ai-consent", method: "PUT", body: { adultAttested: true } },
      { url: "/api/profile/ai-consent", method: "DELETE", body: undefined },
    ]);
  });

  it("says what else AI needs: a verified Davidson account, and the feature itself", () => {
    const { unmount } = consent({ verifiedDavidson: false, aiEnabled: false });
    expect(
      screen.getByText(/limited to verified @davidson.edu accounts/, { selector: "div" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Verify your email" })).toHaveAttribute(
      "href",
      "/verify?next=%2Fprofile",
    );
    expect(screen.getByText(/switched off for everyone right now/)).toBeInTheDocument();
    unmount();
    consent({ verifiedDavidson: false, davidson: false });
    expect(screen.queryByRole("link", { name: "Verify your email" })).toBeNull();
  });

  it("shows the server's refusal", async () => {
    stubFetch(
      invalid([
        { path: "aiConsent", message: "Confirm that you are 18 or older to turn on AI features." },
      ]),
    );
    consent({ adultAttestedAt: NOW });
    await userEvent.click(screen.getByRole("button", { name: "Turn on AI features" }));
    await waitFor(() => expect(alertWith("Confirm that you are 18 or older")).toBeDefined());
    expect(screen.getByTestId("ai-consent-state")).toHaveTextContent("Off");
  });
});

describe("PasswordForm", () => {
  async function fill(current: string, next: string, confirm = next) {
    if (current) await userEvent.type(screen.getByLabelText("Current password"), current);
    if (next) await userEvent.type(screen.getByLabelText("New password"), next);
    if (confirm) await userEvent.type(screen.getByLabelText("Confirm new password"), confirm);
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
  }

  it("checks the new password on the client first", async () => {
    stubFetch();
    render(<PasswordForm email="casey@davidson.edu" />);
    await fill("", "short");
    expect(alertWith("Current password: Enter your current password.")).toBeDefined();
    expect(alertWith("New password: Use at least 10 characters")).toBeDefined();
    expect(screen.getByLabelText("Current password")).toHaveFocus();
    await userEvent.clear(screen.getByLabelText("New password"));
    await userEvent.clear(screen.getByLabelText("Confirm new password"));
    await fill("old password 1", "a brand new password", "a brand new passw0rd");
    expect(alertWith("Confirm new password: The two new passwords do not match.")).toBeDefined();
    expect(calls).toEqual([]);
  });

  it("shows the server's verdict on the current password", async () => {
    stubFetch(invalid([{ path: "currentPassword", message: "That password is not right." }]));
    render(<PasswordForm email="casey@davidson.edu" />);
    await fill("wrong password", "a brand new password");
    await waitFor(() =>
      expect(alertWith("Current password: That password is not right.")).toBeDefined(),
    );
    expect(screen.getByLabelText("Current password")).toHaveFocus();
    expect(nextAuth.signIn).not.toHaveBeenCalled();
  });

  it("changes it, signs this browser back in with the new one, and says so", async () => {
    stubFetch([204, null]);
    nextAuth.signIn.mockResolvedValue({ ok: true, error: null });
    render(<PasswordForm email="casey@davidson.edu" />);
    await fill("old password 1", "a brand new password");
    expect(calls).toEqual([
      {
        url: "/api/account/password",
        method: "POST",
        body: { currentPassword: "old password 1", newPassword: "a brand new password" },
      },
    ]);
    await waitFor(() =>
      expect(nextAuth.signIn).toHaveBeenCalledWith("credentials", {
        email: "casey@davidson.edu",
        password: "a brand new password",
        redirect: false,
      }),
    );
    expect(
      await screen.findByText(/Password changed\. Every other device was signed out/),
    ).toBeInTheDocument();
    expect(router.refresh).toHaveBeenCalled();
    expect(screen.getByLabelText("Current password")).toHaveValue("");
    expect(nav.hardNavigate).not.toHaveBeenCalled();
  });

  it("sends the student to sign in when signing back in fails", async () => {
    stubFetch([204, null]);
    nextAuth.signIn.mockResolvedValue({ ok: false, error: "CredentialsSignin" });
    render(<PasswordForm email="casey@davidson.edu" />);
    await fill("old password 1", "a brand new password");
    await waitFor(() =>
      expect(nav.hardNavigate).toHaveBeenCalledWith("/login?callbackUrl=%2Fprofile"),
    );
  });
});

describe("SignOutEverywhere", () => {
  it("confirms in a dialog, revokes every session and goes to /login", async () => {
    stubFetch([204, null]);
    render(<SignOutEverywhere />);
    await userEvent.click(screen.getByRole("button", { name: "Sign out everywhere" }));
    const dialog = screen.getByRole("dialog", { name: "Sign out everywhere?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(calls).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "Sign out everywhere" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Sign out everywhere" }),
    );
    expect(calls).toEqual([{ url: "/api/account/sessions", method: "DELETE", body: undefined }]);
    await waitFor(() => expect(nav.hardNavigate).toHaveBeenCalledWith("/login"));
  });

  it("keeps the dialog open with the reason when it fails", async () => {
    stubFetch([503, { error: { code: "unavailable", message: "Try again in a moment." } }]);
    render(<SignOutEverywhere />);
    await userEvent.click(screen.getByRole("button", { name: "Sign out everywhere" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Sign out everywhere" }),
    );
    await waitFor(() => expect(alertWith("Try again in a moment.")).toBeDefined());
    expect(nav.hardNavigate).not.toHaveBeenCalled();
  });
});

describe("DownloadData", () => {
  it("downloads the export as a JSON file named for its day", async () => {
    const exported = {
      exportedAt: NOW,
      profile: { email: "casey@davidson.edu" },
      data: { plans: [] },
    };
    stubFetch([200, exported]);
    const blobs: Blob[] = [];
    vi.stubGlobal(
      "URL",
      Object.assign(Object.create(URL), {
        createObjectURL: vi.fn((blob: Blob) => {
          blobs.push(blob);
          return "blob:mock";
        }),
        revokeObjectURL: vi.fn(),
      }),
    );
    const clicks: HTMLAnchorElement[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push(this);
    });
    render(<DownloadData />);
    await userEvent.click(screen.getByRole("button", { name: "Download my data" }));
    expect(await screen.findByText("Your download has started.")).toHaveAttribute("role", "status");
    expect(calls).toEqual([{ url: "/api/me/export", method: "GET", body: undefined }]);
    expect(clicks).toHaveLength(1);
    expect(clicks[0]!.download).toBe("makeitso-data-2026-09-30.json");
    expect(clicks[0]!.href).toBe("blob:mock");
    expect(JSON.parse(await blobs[0]!.text())).toEqual(exported);
    expect(blobs[0]!.type).toBe("application/json");
    // The temporary link is gone again.
    expect(document.querySelector("a[download]")).toBeNull();
    click.mockRestore();
  });

  it("says why when the export is refused", async () => {
    stubFetch([
      429,
      { error: { code: "rate_limited", message: "You can download your data 5 times a day." } },
    ]);
    render(<DownloadData />);
    await userEvent.click(screen.getByRole("button", { name: "Download my data" }));
    await waitFor(() => expect(alertWith("5 times a day")).toBeDefined());
  });
});

describe("DeleteAccount", () => {
  async function open() {
    await userEvent.click(screen.getByRole("button", { name: "Delete account" }));
    return screen.getByRole("dialog", { name: "Delete your account?" });
  }

  it("asks for the password in a dialog and focuses it on a mistake", async () => {
    stubFetch(invalid([{ path: "password", message: "That password is not right." }]));
    render(<DeleteAccount />);
    let dialog = await open();
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete my account" }));
    expect(alertWith("Password: Enter your password to confirm.")).toBeDefined();
    expect(within(dialog).getByLabelText("Password")).toHaveFocus();
    expect(calls).toEqual([]);

    await userEvent.type(within(dialog).getByLabelText("Password"), "not my password");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete my account" }));
    await waitFor(() => expect(alertWith("Password: That password is not right.")).toBeDefined());
    expect(within(dialog).getByLabelText("Password")).toHaveFocus();
    expect(nav.hardNavigate).not.toHaveBeenCalled();

    // Cancel forgets what was typed.
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    dialog = await open();
    expect(within(dialog).getByLabelText("Password")).toHaveValue("");
  });

  it("deletes the account and leaves for the home page", async () => {
    stubFetch([204, null]);
    render(<DeleteAccount />);
    const dialog = await open();
    await userEvent.type(within(dialog).getByLabelText("Password"), "my real password");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete my account" }));
    expect(calls).toEqual([
      { url: "/api/me", method: "DELETE", body: { password: "my real password" } },
    ]);
    await waitFor(() => expect(nav.hardNavigate).toHaveBeenCalledWith("/"));
  });
});
