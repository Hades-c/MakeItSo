import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AiColdEmailPanel,
  contactableOnly,
  filledEmail,
  fillStudentName,
  NAME_FALLBACK,
  type ColdEmailAlumnus,
} from "@/app/(hub)/careers/[slug]/_components/ai-cold-email";
import {
  AI_FAILURE_KINDS,
  AI_FAILURE_MESSAGES,
  AI_RESULT_STATUS,
  aiFailure,
  STUDENT_NAME_PLACEHOLDER,
} from "@/lib/types/ai";
import { LINKS, okResult, renderFresh, stubFetch } from "./helpers";

/** "Email an alumnus" on /careers/[slug] (W9a-ai): contactable alumni only, {{studentName}} filled in the browser. */

const ALUMNI: ColdEmailAlumnus[] = [
  {
    id: "rahael-borchers",
    name: "Rahael Borchers",
    classYear: 2019,
    role: "Physician",
    organization: "Atrium Health",
    contactable: true,
  },
  {
    id: "bruno-mourao",
    name: "Bruno Mourao",
    classYear: null,
    role: null,
    organization: null,
    contactable: true,
  },
];

const EMAIL = {
  subject: "Davidson sophomore interested in Medicine",
  body: `Dear Rahael Borchers,\n\nWould you have 15 minutes?\n\nBest,\n${STUDENT_NAME_PLACEHOLDER}`,
};

function panel(props: Partial<React.ComponentProps<typeof AiColdEmailPanel>> = {}) {
  return renderFresh(
    <AiColdEmailPanel
      careerSlug="medicine"
      alumni={ALUMNI}
      studentName="Sam Studentname"
      gate={null}
      links={LINKS}
      {...props}
    />,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fillStudentName / filledEmail / contactableOnly", () => {
  it("fills every {{studentName}} (spacing variants too) with the trimmed name", () => {
    expect(fillStudentName("Hi, I am {{studentName}}. — {{ studentName }}", "  Sam   Lee ")).toBe(
      "Hi, I am Sam Lee. — Sam Lee",
    );
    expect(fillStudentName("Best,\n{{studentName}}", "")).toBe(`Best,\n${NAME_FALLBACK}`);
    // A name with replacement patterns is inserted literally.
    expect(fillStudentName("{{studentName}}", "$& $1")).toBe("$& $1");
  });

  it("builds the clipboard text from subject + body", () => {
    const filled = filledEmail(EMAIL, "Sam");
    expect(filled.body).not.toContain(STUDENT_NAME_PLACEHOLDER);
    expect(filled.body.endsWith("Best,\nSam")).toBe(true);
    expect(filled.clipboard).toBe(`Subject: ${EMAIL.subject}\n\n${filled.body}`);
  });

  it("drops anyone who is not contactable", () => {
    const mixed = [...ALUMNI, { ...ALUMNI[0]!, id: "public-figure", contactable: false }];
    expect(contactableOnly(mixed).map((a) => a.id)).toEqual(["rahael-borchers", "bruno-mourao"]);
  });
});

describe("AiColdEmailPanel", () => {
  it("lists contactable alumni only, even if a non-contactable one slips into the props", () => {
    stubFetch(() => undefined);
    panel({
      alumni: [
        ...ALUMNI,
        { ...ALUMNI[0]!, id: "stephen-curry", name: "Stephen Curry", contactable: false as true },
      ],
    });
    const group = screen.getByRole("group", { name: "Who would you like to write to?" });
    expect(within(group).getAllByRole("radio")).toHaveLength(2);
    expect(within(group).queryByText("Stephen Curry")).toBeNull();
    expect(within(group).getByRole("radio", { name: /Rahael Borchers/ })).toBeChecked();
    expect(within(group).getByText("Physician, Atrium Health · Class of 2019")).toBeVisible();
  });

  it("drafts for the chosen alumnus, fills the student's name in the browser and copies subject + body", async () => {
    const calls = stubFetch((url, init) =>
      url.pathname === "/api/ai/cold-email" && init.method === "POST"
        ? [200, okResult({ email: EMAIL })]
        : undefined,
    );
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    panel();
    await userEvent.click(screen.getByRole("radio", { name: /Bruno Mourao/ }));
    await userEvent.click(screen.getByRole("button", { name: "Draft an email" }));

    const result = await screen.findByTestId("ai-email-result");
    expect(within(result).getByTestId("ai-email-subject")).toHaveTextContent(
      `Subject: ${EMAIL.subject}`,
    );
    const body = within(result).getByTestId("ai-email-body");
    expect(body).toHaveTextContent("Sam Studentname");
    expect(body.textContent).not.toContain(STUDENT_NAME_PLACEHOLDER);
    expect(within(result).getByText("To Bruno Mourao")).toBeVisible();
    expect(
      within(result).getByText("AI-generated content: review before sending"),
    ).toBeInTheDocument();

    // Only the alumnus id and career slug go to the server: never the student's name.
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.body).toEqual({
      alumnusId: "bruno-mourao",
      careerSlug: "medicine",
      regenerate: false,
    });
    expect(JSON.stringify(calls)).not.toContain("Sam Studentname");

    await userEvent.click(within(result).getByRole("button", { name: "Copy email" }));
    expect(writeText).toHaveBeenCalledWith(filledEmail(EMAIL, "Sam Studentname").clipboard);
    expect(await screen.findByText("The email is on your clipboard.")).toBeVisible();
  });

  it("says how to copy by hand when the browser refuses the clipboard", async () => {
    stubFetch((url) =>
      url.pathname === "/api/ai/cold-email" ? [200, okResult({ email: EMAIL })] : undefined,
    );
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText: vi.fn(async () => Promise.reject(new Error("denied"))) },
    });
    panel();
    await userEvent.click(screen.getByRole("button", { name: "Draft an email" }));
    await userEvent.click(await screen.findByRole("button", { name: "Copy email" }));
    expect(await screen.findByText(/didn’t allow copying/)).toBeVisible();
  });

  it("Draft another version sends regenerate: true; choosing another alumnus starts over", async () => {
    const calls = stubFetch((url) =>
      url.pathname === "/api/ai/cold-email" ? [200, okResult({ email: EMAIL })] : undefined,
    );
    panel();
    await userEvent.click(screen.getByRole("button", { name: "Draft an email" }));
    await userEvent.click(await screen.findByRole("button", { name: "Draft another version" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "POST")).toHaveLength(2));
    expect(calls[1]!.body).toMatchObject({ alumnusId: "rahael-borchers", regenerate: true });
    await screen.findByTestId("ai-email-result");
    await userEvent.click(screen.getByRole("radio", { name: /Bruno Mourao/ }));
    expect(screen.queryByTestId("ai-email-result")).toBeNull();
    expect(screen.getByRole("button", { name: "Draft an email" })).toBeVisible();
  });

  it.each(AI_FAILURE_KINDS)("renders the %s result kind with its message", async (kind) => {
    stubFetch((url) =>
      url.pathname === "/api/ai/cold-email" ? [AI_RESULT_STATUS[kind], aiFailure(kind)] : undefined,
    );
    panel();
    await userEvent.click(screen.getByRole("button", { name: "Draft an email" }));
    const notice = await screen.findByTestId("ai-email-failure");
    expect(notice).toHaveTextContent(AI_FAILURE_MESSAGES[kind]);
    expect(screen.queryByTestId("ai-email-result")).toBeNull();
  });

  it("a 404 (alumnus no longer contactable) says the server's words, without retry", async () => {
    stubFetch((url) =>
      url.pathname === "/api/ai/cold-email"
        ? [
            404,
            {
              error: {
                code: "not_found",
                message: "That alumnus is not available for a cold e-mail.",
              },
            },
          ]
        : undefined,
    );
    panel();
    await userEvent.click(screen.getByRole("button", { name: "Draft an email" }));
    const notice = await screen.findByTestId("ai-email-failure");
    expect(notice).toHaveTextContent("That alumnus is not available for a cold e-mail.");
    expect(within(notice).queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("no contactable alumni: says so and offers no draft", () => {
    stubFetch(() => undefined);
    panel({ alumni: [] });
    expect(screen.getByTestId("ai-email-none")).toHaveTextContent(/Public figures, trustees/);
    expect(screen.queryByRole("button", { name: "Draft an email" })).toBeNull();
  });

  it("a gate known at render comes first (even with no alumni sent)", () => {
    stubFetch(() => undefined);
    panel({ alumni: [], gate: aiFailure("unverified") });
    const gate = screen.getByTestId("ai-email-gate");
    expect(gate).toHaveTextContent(AI_FAILURE_MESSAGES.unverified);
    expect(within(gate).getByRole("link", { name: "Verify your email" })).toHaveAttribute(
      "href",
      LINKS.verify,
    );
    expect(screen.queryByRole("radio")).toBeNull();
  });
});
