import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PrivacyPage from "@/app/(marketing)/privacy/page";

// connection() needs a request scope; the page only awaits it so the AI rule is read per request.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  connection: async () => undefined,
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/privacy", () => {
  it("says what MakeItSo is, stores, sends to AI, keeps, and how to leave", async () => {
    render(await PrivacyPage());
    expect(
      screen.getByRole("heading", { level: 1, name: "Privacy at MakeItSo" }),
    ).toBeInTheDocument();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/independent student project/);
    expect(text).toMatch(/not a Davidson\s+College service/);
    expect(text).toMatch(/Anthropic/);
    expect(text).toMatch(/off until you turn them on/);
    expect(text).toMatch(
      /never sends your name, your email address, your account id or any grades/,
    );
    expect(text).toMatch(/LinkedIn/);
    expect(text).toMatch(/removed or corrected/);
    expect(text).toMatch(/30 days/);
    expect(text).toMatch(/15 minutes/);
    expect(text).toMatch(/deleted automatically 24 hours after it was sent/);
    expect(text).toMatch(/60 days/);
    expect(text).toMatch(/Download my data/);
    expect(text).toMatch(/Delete account/);
    // Review corrections: the cookies NextAuth really sets, the mail provider, the replacement rule's
    // condition, the legacy profile fields, and what the export and deletion cover (server/account/erasers.ts:
    // the earlier version's plan, career goals and AI answers; not its name-keyed cold-email drafts).
    expect(text).toMatch(/three cookies/);
    expect(text).toMatch(/Resend/);
    expect(text).toMatch(/Once email verification is available/);
    expect(text).toMatch(/never sent a code is never replaced/);
    expect(text).toMatch(/a short bio,\s+your year, career interests/);
    expect(text).toMatch(
      /career goals you entered there\s+and the AI answers it generated for you/,
    );
    expect(text).toMatch(/cold-email drafts under your name only/);
    expect(text).not.toMatch(/not yet part of the download/);
    expect(text).not.toMatch(/one session cookie/);
    for (const id of ["what-we-store", "ai", "alumni", "retention", "your-data", "contact"]) {
      expect(document.getElementById(id)).not.toBeNull();
    }
    // AI_ALLOW_UNVERIFIED off (the default): AI needs a verified address.
    expect(text).toMatch(/they need a verified @davidson\.edu account\./);
    const contact = screen.getByRole("link", { name: /MakeItSo project on GitHub/ });
    expect(contact).toHaveAttribute("rel", "noopener noreferrer");
    expect(contact.getAttribute("href")).toMatch(/^https:\/\//);
  });

  it("says who AI is for while the temporary AI_ALLOW_UNVERIFIED switch is on", async () => {
    vi.stubEnv("AI_ALLOW_UNVERIFIED", "true");
    render(await PrivacyPage());
    const ai = document.getElementById("ai")!.closest("section")!;
    const text = (ai.textContent ?? "").replace(/\s+/g, " ");
    expect(text).toMatch(/they need an @davidson\.edu account/);
    expect(text).toMatch(/does not have to be verified yet, except for cold-email drafts/);
    expect(text).not.toMatch(/need a verified @davidson\.edu account\./);
    // The alumni directory is still for verified addresses only.
    expect(document.body.textContent).toMatch(/visible only to signed-in students with a verified/);
  });

  it("says what a pasted syllabus sends to Anthropic, and what the Moodle import reads and stores", async () => {
    render(await PrivacyPage());
    const ai = (document.getElementById("ai")!.closest("section")!.textContent ?? "").replace(
      /\s+/g,
      " ",
    );
    expect(ai).toMatch(/the syllabus text you paste \(up to 20,000 characters\)/);
    expect(ai).toMatch(/does not keep it or log it/);
    const moodle = (
      document.getElementById("moodle")!.closest("section")!.textContent ?? ""
    ).replace(/\s+/g, " ");
    expect(moodle).toMatch(/stores it encrypted/);
    // What each event keeps, exactly as server/moodle stores it (plan deadline title, dueAt, externalUid, courseCode).
    expect(moodle).toMatch(
      /keeps only the title, the due time, Moodle's id for the event \(so a later sync can update or remove it\) and, when the course name names a Davidson course, that course's code/,
    );
    expect(moodle).toMatch(/course names and everything else Moodle sends are dropped/);
    expect(moodle).toMatch(/more than six hours after the last sync/);
    expect(moodle).not.toMatch(/turned off right now/);
    const stored = document.getElementById("what-we-store")!.closest("section")!.textContent ?? "";
    expect(stored.replace(/\s+/g, " ")).toMatch(/Not the text you pasted/);
    expect(document.body.textContent).not.toMatch(
      /do not paste Degree Works reports, Moodle content/,
    );
  });

  it("says when the Moodle import is turned off", async () => {
    vi.stubEnv("MOODLE_IMPORT_ENABLED", "false");
    render(await PrivacyPage());
    expect(document.getElementById("moodle")!.closest("section")).toHaveTextContent(
      /Moodle import is turned off right now/,
    );
  });
});
