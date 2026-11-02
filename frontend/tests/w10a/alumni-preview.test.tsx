import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CareerAlumniPreview } from "@/app/(hub)/careers/_components/career-alumni-preview";
import {
  PREVIEW_NOTICE_TITLE,
  SAMPLE_PROFILES_SENTENCE,
} from "@/app/(hub)/alumni/preview/_components/preview-notice";
import { UNAVAILABLE_REASON } from "@/app/(hub)/alumni/preview/_components/sample-alumnus-card";
import { SAMPLE_ALUMNI, sampleAlumniCountForCareer } from "@/server/content/alumni-sample";
import { getCareer } from "@/server/content/careers";

/**
 * The Davidson Connect preview (/alumni/preview) and its ways in: the page's non-dismissable notice, a "Sample"
 * badge and disabled Connect/Message on every card, URL filters, the Careers header link and the career page's
 * preview card, each only while FEATURE_ALUMNI_PREVIEW is on. No verified alumnus appears anywhere in it.
 */

const next = vi.hoisted(() => ({ connection: vi.fn(async () => undefined) }));
// Any signed-in student: an unverified, non-Davidson address on purpose (the preview holds no personal data).
vi.mock("@/server/auth/session", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  requireUser: async () => ({
    id: "0123456789abcdef01234567",
    email: "sam@example.org",
    name: "Sam Student",
  }),
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  connection: next.connection,
}));

const previewPage = await import("@/app/(hub)/alumni/preview/page");
const careersPage = await import("@/app/(hub)/careers/page");

const NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };
const search = (params: Record<string, string | string[]>) => ({
  searchParams: Promise.resolve(params),
});
const cards = () => screen.queryAllByRole("article");

afterEach(() => {
  vi.unstubAllEnvs();
  next.connection.mockClear();
});

describe("/alumni/preview", () => {
  it("opens with the notice, then every sample profile, each badged Sample", async () => {
    render(await previewPage.default(search({})));
    expect(
      screen.getByRole("heading", { level: 1, name: "Davidson Connect preview" }),
    ).toBeVisible();
    const notice = screen.getByRole("note", { name: PREVIEW_NOTICE_TITLE });
    expect(notice).toHaveTextContent(SAMPLE_PROFILES_SENTENCE);
    expect(notice).toHaveTextContent(/MakeItSo is not connected to Davidson Connect, and nothing/);
    // Nothing closes it.
    expect(within(notice).queryByRole("button")).toBeNull();
    // It comes before the filters and the cards.
    const form = screen.getByRole("form", { name: "Filter sample profiles" });
    expect(notice.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The one real fact, sourced and dated.
    expect(
      within(notice).getByRole("link", { name: /Alumni Careers & Networking/ }),
    ).toHaveAttribute(
      "href",
      "https://www.davidson.edu/alumni-and-families/alumni-careers-networking",
    );
    expect(screen.getByTestId("preview-about")).toHaveTextContent(/checked \w{3} \d{1,2}, \d{4}/);

    expect(cards()).toHaveLength(SAMPLE_ALUMNI.length);
    expect(screen.getByTestId("sample-count")).toHaveTextContent(
      `${SAMPLE_ALUMNI.length} sample profiles`,
    );
    for (const card of cards()) {
      expect(card).toHaveAttribute("data-sample", "true");
      expect(card).not.toHaveAttribute("data-alumnus");
      expect(within(card).getByText("Sample")).toBeVisible();
      // The badge is part of the card's name, so screen readers hear it with the person.
      expect(card).toHaveAccessibleName(/ Sample$/);
      const connect = within(card).getByRole("button", { name: "Connect" });
      const message = within(card).getByRole("button", { name: "Message" });
      for (const action of [connect, message]) {
        expect(action).toBeDisabled();
        expect(action).toHaveAccessibleDescription(UNAVAILABLE_REASON);
      }
      expect(
        within(card)
          .queryAllByRole("link")
          .every((a) => a.getAttribute("href")?.startsWith("/careers/")),
      ).toBe(true);
    }
    // No photos, no LinkedIn, no mailto: initials only, and nothing that contacts anyone.
    expect(document.querySelectorAll("img")).toHaveLength(0);
    expect(document.querySelector('a[href^="mailto:"], a[href*="linkedin"]')).toBeNull();
    expect(next.connection).toHaveBeenCalled();
  });

  it("shows a card's fields as a Davidson Connect card would", async () => {
    render(await previewPage.default(search({ q: "Megan Hollis" })));
    const card = screen.getByRole("article", { name: /Megan Hollis/ });
    expect(within(card).getByText("MH")).toHaveAttribute("aria-hidden", "true");
    for (const text of [
      "2019",
      "Computer Science",
      "Software engineer",
      "a Charlotte fintech startup",
      "Charlotte, NC",
      "Technology",
      "Resume review",
      "Mock interviews",
    ]) {
      expect(within(card).getByText(text)).toBeVisible();
    }
    expect(within(card).getByRole("link", { name: "Software Engineering" })).toHaveAttribute(
      "href",
      "/careers/software-engineering",
    );
    expect(within(card).getByRole("list", { name: "Can help with" })).toBeVisible();
  });

  it("filters by career path, class year and industry from the URL, and ignores unknown values", async () => {
    const { unmount } = render(await previewPage.default(search({ career: "law" })));
    const law = SAMPLE_ALUMNI.filter((r) => r.careerPathSlugs.includes("law"));
    expect(
      cards()
        .map((c) => c.id)
        .sort(),
    ).toEqual(law.map((r) => r.id).sort());
    expect(screen.getByTestId("sample-count")).toHaveTextContent(
      `Showing ${law.length} of ${SAMPLE_ALUMNI.length} sample profiles`,
    );
    expect(screen.getByLabelText("Career path")).toHaveValue("law");
    unmount();

    const second = render(
      await previewPage.default(search({ industry: "health-care", year: "2015" })),
    );
    const shown = SAMPLE_ALUMNI.filter((r) => r.industry === "Health care" && r.classYear === 2015);
    expect(shown.length).toBeGreaterThan(0);
    expect(
      cards()
        .map((c) => c.id)
        .sort(),
    ).toEqual(shown.map((r) => r.id).sort());
    second.unmount();

    render(await previewPage.default(search({ career: "astronaut", industry: "x", year: "19" })));
    expect(cards()).toHaveLength(SAMPLE_ALUMNI.length);
  });

  it("says so when nothing matches, with a way back", async () => {
    render(await previewPage.default(search({ q: "zzzz-no-such-person" })));
    expect(screen.getByText("No sample profiles match these filters")).toBeVisible();
    expect(screen.getAllByRole("link", { name: "Clear filters" })[0]).toHaveAttribute(
      "href",
      "/alumni/preview",
    );
  });

  it("links the verified directory only while the Alumni section is on", async () => {
    const { unmount } = render(await previewPage.default(search({})));
    expect(screen.getByRole("link", { name: "Alumni" })).toHaveAttribute("href", "/alumni");
    unmount();
    vi.stubEnv("FEATURE_ALUMNI", "false");
    render(await previewPage.default(search({})));
    expect(screen.queryByRole("link", { name: "Alumni" })).toBeNull();
    expect(cards()).toHaveLength(SAMPLE_ALUMNI.length);
  });

  it.each(["FEATURE_ALUMNI_PREVIEW", "FEATURE_CAREERS"])(
    "answers 404 (page and title) while %s is off",
    async (flag) => {
      await expect(previewPage.generateMetadata()).resolves.toEqual({
        title: "Davidson Connect preview · sample data",
      });
      vi.stubEnv(flag, "false");
      await expect(previewPage.default(search({}))).rejects.toMatchObject(NOT_FOUND);
      await expect(previewPage.generateMetadata()).rejects.toMatchObject(NOT_FOUND);
    },
  );
});

describe("the Careers header", () => {
  it("links the verified directory and the preview, apart", async () => {
    render(await careersPage.default(search({})));
    const header = screen.getByRole("banner");
    expect(within(header).getByRole("link", { name: "Alumni" })).toHaveAttribute("href", "/alumni");
    expect(within(header).getByRole("link", { name: PREVIEW_NOTICE_TITLE })).toHaveAttribute(
      "href",
      "/alumni/preview",
    );
  });

  it("keeps the preview link with Alumni off, and drops it with the preview off", async () => {
    vi.stubEnv("FEATURE_ALUMNI", "false");
    const { unmount } = render(await careersPage.default(search({})));
    expect(screen.queryByRole("link", { name: "Alumni" })).toBeNull();
    expect(screen.getByRole("link", { name: PREVIEW_NOTICE_TITLE })).toBeVisible();
    unmount();
    vi.stubEnv("FEATURE_ALUMNI_PREVIEW", "false");
    render(await careersPage.default(search({})));
    expect(screen.queryByRole("link", { name: PREVIEW_NOTICE_TITLE })).toBeNull();
  });
});

describe("CareerAlumniPreview (career pages)", () => {
  const law = getCareer("law")!;

  it("is a separate, labelled card that links to this path's sample profiles", () => {
    render(<CareerAlumniPreview career={law} />);
    const region = screen.getByRole("region", { name: /Davidson Connect preview\s*Sample data/ });
    expect(region).toHaveTextContent(SAMPLE_PROFILES_SENTENCE);
    const count = sampleAlumniCountForCareer("law");
    expect(within(region).getByRole("link")).toHaveAttribute("href", "/alumni/preview?career=law");
    expect(within(region).getByRole("link")).toHaveTextContent(
      `See ${count} sample profiles on this path`,
    );
    // No profile is shown here, only the way to them.
    expect(within(region).queryByRole("article")).toBeNull();
  });

  it("renders nothing while the preview is off", () => {
    vi.stubEnv("FEATURE_ALUMNI_PREVIEW", "false");
    const { container } = render(<CareerAlumniPreview career={law} />);
    expect(container).toBeEmptyDOMElement();
  });
});
