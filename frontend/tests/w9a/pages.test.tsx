import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { filterCareers } from "@/app/(hub)/careers/_lib/filters";
import { CAREER_CLUSTERS } from "@/lib/types/content";
import { CAREERS, getCareer } from "@/server/content/careers";

/**
 * Route-level tests for /careers, /careers/[slug] and /alumni: the flag gate (404 while off, metadata included),
 * notFound() for unknown slugs, URL filters, and what each page renders around its streamed sections. The async
 * sections (catalog, programs, session) are replaced by markers here; tests/w9a/sections.test.tsx renders them.
 */

const next = vi.hoisted(() => ({ connection: vi.fn(async () => undefined) }));
// The flagged pages check the session themselves (requireUser); a signed-in student here.
vi.mock("@/server/auth/session", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  requireUser: async () => ({
    id: "0123456789abcdef01234567",
    email: "sam@davidson.edu",
    name: "Sam Student",
  }),
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  connection: next.connection,
}));
vi.mock("@/app/(hub)/careers/_components/offered-count", () => ({
  OfferedCount: ({ codes }: { codes: string[] }) => (
    <span data-testid="offered-slot">{codes.length}</span>
  ),
}));
vi.mock("@/app/(hub)/careers/_components/career-courses", () => ({
  CareerCourses: ({ career }: { career: { slug: string } }) => (
    <div data-testid="courses-slot">{career.slug}</div>
  ),
}));
vi.mock("@/app/(hub)/careers/_components/career-programs", () => ({
  CareerPrograms: () => <div data-testid="programs-slot" />,
}));
vi.mock("@/app/(hub)/careers/_components/career-alumni", () => ({
  CareerAlumni: () => <div data-testid="alumni-slot" />,
}));
vi.mock("@/app/(hub)/alumni/_components/alumni-directory", () => ({
  AlumniDirectory: ({ params }: { params: Record<string, unknown> }) => (
    <div data-testid="directory-slot">{JSON.stringify(params)}</div>
  ),
}));

const careersPage = await import("@/app/(hub)/careers/page");
const careerPage = await import("@/app/(hub)/careers/[slug]/page");
const alumniPage = await import("@/app/(hub)/alumni/page");

const NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };
const search = (params: Record<string, string | string[]>) => ({
  searchParams: Promise.resolve(params),
});
const slug = (value: string) => ({ params: Promise.resolve({ slug: value }) });

afterEach(() => {
  next.connection.mockClear();
});

describe("/careers", () => {
  it("lists all 24 career paths by cluster, each with its registration-schedule slot", async () => {
    render(await careersPage.default(search({})));
    expect(screen.getByRole("heading", { level: 1, name: "Careers" })).toBeVisible();
    expect(screen.getAllByRole("article")).toHaveLength(CAREERS.length);
    expect(CAREERS).toHaveLength(24);
    const clusters = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(clusters[0]).toMatch(/^Technology/);
    const se = screen.getByRole("article", { name: "Software Engineering" });
    expect(within(se).getByTestId("offered-slot")).toHaveTextContent(
      String(getCareer("software-engineering")!.courses.length),
    );
    expect(screen.queryByTestId("careers-count")).toBeNull();
    // Per request, never at build time.
    expect(next.connection).toHaveBeenCalled();
  });

  it("filters by cluster and text from the URL", async () => {
    render(await careersPage.default(search({ cluster: "health" })));
    const names = screen.getAllByRole("article").map((a) => a.getAttribute("data-career"));
    expect(names).toEqual(CAREERS.filter((c) => c.cluster === "Health").map((c) => c.slug));
    expect(screen.getByTestId("careers-count")).toHaveTextContent(
      `Showing ${names.length} of 24 career paths`,
    );
    expect(screen.getByRole("link", { name: /Health/, current: "page" })).toBeVisible();
  });

  it("says so, with a way back, when nothing matches", async () => {
    render(await careersPage.default(search({ q: "underwater basket weaving" })));
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    expect(screen.getByRole("heading", { name: "No career paths match" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Show all careers" })).toHaveAttribute(
      "href",
      "/careers",
    );
    expect(screen.getByTestId("careers-count")).toHaveTextContent(
      "Showing 0 of 24 career paths for “underwater basket weaving”",
    );
  });

  it("counts on each cluster chip what it leads to: that cluster with the current search", async () => {
    render(await careersPage.default(search({ q: "law" })));
    const nav = screen.getByRole("navigation", { name: "Career clusters" });
    const all = filterCareers(CAREERS, { cluster: null, q: "law" });
    expect(all.length).toBeGreaterThan(0);
    expect(all.length).toBeLessThan(24);
    expect(within(nav).getByRole("link", { name: /^All/ })).toHaveTextContent(`All ${all.length}`);
    let empty = 0;
    for (const cluster of CAREER_CLUSTERS) {
      const count = filterCareers(CAREERS, { cluster, q: "law" }).length;
      const chip = within(nav).getByRole("link", {
        name: new RegExp(`^${cluster.replace("&", "&")}`),
      });
      expect(chip).toHaveTextContent(`${cluster} ${count}`);
      if (count === 0) {
        empty++;
        expect(chip).toHaveClass("border-dashed");
      }
    }
    // Some cluster has no match for "law": its chip says 0 instead of its full size.
    expect(empty).toBeGreaterThan(0);
    expect(screen.getAllByRole("article")).toHaveLength(all.length);
  });

  it("ignores filters it cannot use", async () => {
    render(await careersPage.default(search({ cluster: "<script>", q: ["", "x"] })));
    expect(screen.getAllByRole("article")).toHaveLength(24);
  });

  it("answers 404 (page and title) while FEATURE_CAREERS is off", async () => {
    await expect(careersPage.generateMetadata()).resolves.toEqual({ title: "Careers" });
    vi.stubEnv("FEATURE_CAREERS", "false");
    await expect(careersPage.default(search({}))).rejects.toMatchObject(NOT_FOUND);
    await expect(careersPage.generateMetadata()).rejects.toMatchObject(NOT_FOUND);
  });
});

describe("/careers/[slug]", () => {
  it("renders one career with its sections, the streamed parts in their own boundaries", async () => {
    const career = getCareer("entrepreneurship")!;
    render(await careerPage.default(slug("entrepreneurship")));
    expect(screen.getByRole("heading", { level: 1, name: career.name })).toBeVisible();
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(crumbs).getByRole("link", { name: "Careers" })).toHaveAttribute(
      "href",
      "/careers",
    );
    expect(within(crumbs).getByRole("link", { name: career.cluster })).toHaveAttribute(
      "href",
      "/careers?cluster=business-and-finance",
    );
    expect(screen.getByText(career.summary)).toBeVisible();
    expect(screen.getByTestId("career-pay")).toHaveTextContent(career.pay!.period);
    expect(screen.getByTestId("courses-slot")).toHaveTextContent("entrepreneurship");
    expect(screen.getByTestId("programs-slot")).toBeInTheDocument();
    expect(screen.getByTestId("alumni-slot")).toBeInTheDocument();
    expect(screen.getByTestId("handshake-query")).toHaveTextContent(career.handshakeQuery);
    expect(screen.getByRole("link", { name: "Open Handshake" })).toHaveAttribute(
      "href",
      "https://davidson.joinhandshake.com/",
    );
    // Office programs carry their own tags (Hurt Hub for entrepreneurship).
    const resources = screen.getByRole("region", { name: "At Davidson" });
    expect(resources.querySelector('[data-aggregated="hurt-hub-programs"]')).not.toBeNull();
    for (const resource of career.externalResources) {
      expect(screen.getByRole("link", { name: resource.name })).toHaveAttribute(
        "href",
        resource.url,
      );
    }
    // No AI on this branch.
    expect(document.body).not.toHaveTextContent(/AI · verify/);
  });

  it("shows an office program's published deadline when the resource links the program's parent page", async () => {
    render(await careerPage.default(slug("international-development")));
    const resources = screen.getByRole("region", { name: "At Davidson" });
    const rusk = within(resources)
      .getByRole("link", { name: "Dean Rusk Travel Grants" })
      .closest("li")!;
    // Tomorrow (2026-10-01) is the winter-break deadline: exactly as published.
    expect(rusk).toHaveTextContent(
      "DeadlinesWinter Break: Applications must be submitted by October 1.",
    );
    expect(within(rusk).getByRole("link", { name: "Where this is published" })).toHaveAttribute(
      "href",
      expect.stringMatching(/\/dean-rusk-travel-grants\/application-process$/),
    );
  });

  it("shows the named program's amount on a page several programs share", async () => {
    render(await careerPage.default(slug("nonprofit")));
    const resources = screen.getByRole("region", { name: "At Davidson" });
    const fellows = within(resources)
      .getByRole("link", { name: /^Nonprofit Leadership Fellows/ })
      .closest("li")!;
    expect(fellows).toHaveTextContent("Amount$3,500 stipend + housing");
  });

  it("marks every Davidson resource: a tag, or an allowed exemption said in words", async () => {
    render(await careerPage.default(slug("arts-museum-curation")));
    const items = screen.getByRole("region", { name: "At Davidson" }).querySelectorAll("li");
    expect(items.length).toBe(getCareer("arts-museum-curation")!.davidsonResources.length);
    for (const item of items) {
      const source = item.getAttribute("data-aggregated");
      expect(source).toBeTruthy();
      if (source === "untagged") {
        expect(item).toHaveAttribute("data-untagged", "davidson-web");
        expect(item).toHaveTextContent("davidson.edu page");
      } else {
        expect(item.querySelector(`[data-source="${source}"]`)).toHaveTextContent(/^Source:/);
      }
    }
    // The galleries' page is an offices-and-services page: DAVIDSON OFFICES, not untagged.
    const galleries = screen
      .getByRole("link", { name: /^Van Every\/Smith Galleries/ })
      .closest("li");
    expect(galleries).toHaveAttribute("data-aggregated", "davidson-offices");
  });

  it("answers 404 for a slug that is not one of the 24", async () => {
    for (const value of [
      "astronaut",
      "Software-Engineering",
      "software-engineering-",
      "..",
      "%00",
    ]) {
      await expect(careerPage.default(slug(value))).rejects.toMatchObject(NOT_FOUND);
      await expect(careerPage.generateMetadata(slug(value))).rejects.toMatchObject(NOT_FOUND);
    }
  });

  it("titles the page after the career", async () => {
    await expect(careerPage.generateMetadata(slug("law"))).resolves.toEqual({
      title: "Law",
      description: getCareer("law")!.summary,
    });
    await expect(careerPage.generateMetadata()).resolves.toEqual({ title: "Career path" });
  });

  it("answers 404 (page and title) while FEATURE_CAREERS is off", async () => {
    vi.stubEnv("FEATURE_CAREERS", "false");
    await expect(careerPage.default(slug("law"))).rejects.toMatchObject(NOT_FOUND);
    await expect(careerPage.generateMetadata(slug("law"))).rejects.toMatchObject(NOT_FOUND);
  });
});

describe("/alumni", () => {
  it("renders the header and passes the URL filters to the directory", async () => {
    render(await alumniPage.default(search({ career: "law", year: "2017" })));
    expect(screen.getByRole("heading", { level: 1, name: "Alumni" })).toBeVisible();
    expect(screen.getByTestId("directory-slot")).toHaveTextContent(
      '{"career":"law","year":"2017"}',
    );
  });

  it.each(["FEATURE_ALUMNI", "FEATURE_CAREERS"])(
    "answers 404 (page and title) while %s is off",
    async (flag) => {
      await expect(alumniPage.generateMetadata()).resolves.toEqual({ title: "Alumni" });
      vi.stubEnv(flag, "false");
      await expect(alumniPage.default(search({}))).rejects.toMatchObject(NOT_FOUND);
      await expect(alumniPage.generateMetadata()).rejects.toMatchObject(NOT_FOUND);
    },
  );
});
