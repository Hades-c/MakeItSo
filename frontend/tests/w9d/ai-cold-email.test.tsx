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
import { REGENERATION_HINT } from "@/app/(hub)/careers/[slug]/_components/ai-result";
import { deferred, LINKS, okResult, renderFresh, stubFetch } from "./helpers";

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
      checkedAt="2026-09-30"
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

  it("LinkedIn-only fields say 'see LinkedIn', and the picker carries the alumni provenance line", () => {
    stubFetch(() => undefined);
    panel();
    const bruno = screen.getByRole("radio", { name: /Bruno Mourao/ }).closest("label")!;
    const facts = within(bruno).getByTestId("ai-email-alumnus-facts");
    expect(facts).toHaveTextContent("see LinkedIn, see LinkedIn · Class of see LinkedIn");
    expect(within(facts).getAllByText("see LinkedIn")).toHaveLength(3);
    const provenance = screen.getByTestId("alumni-provenance");
    expect(provenance).toHaveTextContent(/Compiled from public sources · checked .*2026/);
    expect(
      within(provenance).getByRole("link", { name: "Request removal/correction" }),
    ).toBeVisible();
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
    // One read-only field with the whole email, focused and selected, to copy by hand.
    const field = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Email text" });
    expect(field).toHaveAttribute("readonly");
    expect(field.value).toBe(filledEmail(EMAIL, "Sam Studentname").clipboard);
    await waitFor(() => expect(document.activeElement).toBe(field));
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(field.value.length);
  });

  it("Draft another version sends regenerate: true; choosing another alumnus keeps the draft until asked", async () => {
    const calls = stubFetch((url, init) => {
      if (url.pathname !== "/api/ai/cold-email") return undefined;
      const body = JSON.parse(String(init.body)) as { alumnusId: string };
      return [200, okResult({ email: { ...EMAIL, subject: `Hello ${body.alumnusId}` } })];
    });
    panel();
    await userEvent.click(screen.getByRole("button", { name: "Draft an email" }));
    expect(await screen.findByText(REGENERATION_HINT)).toBeVisible();
    await userEvent.click(await screen.findByRole("button", { name: "Draft another version" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "POST")).toHaveLength(2));
    expect(calls[1]!.body).toMatchObject({ alumnusId: "rahael-borchers", regenerate: true });
    await screen.findByTestId("ai-email-result");

    // Picking someone else does not discard the draft the student may not have copied yet.
    await userEvent.click(screen.getByRole("radio", { name: /Bruno Mourao/ }));
    const kept = screen.getByTestId("ai-email-result");
    expect(within(kept).getByText("To Rahael Borchers")).toBeVisible();
    expect(within(kept).getByTestId("ai-email-subject")).toHaveTextContent("Hello rahael-borchers");
    expect(screen.getByTestId("ai-email-kept")).toHaveTextContent(
      "Your draft to Rahael Borchers stays below until the new one is ready.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Draft an email to Bruno Mourao" }));
    await waitFor(() =>
      expect(screen.getByTestId("ai-email-subject")).toHaveTextContent("Hello bruno-mourao"),
    );
    expect(calls.filter((c) => c.method === "POST")[2]!.body).toEqual({
      alumnusId: "bruno-mourao",
      careerSlug: "medicine",
      regenerate: false,
    });
    expect(
      within(screen.getByTestId("ai-email-result")).getByText("To Bruno Mourao"),
    ).toBeVisible();
    expect(screen.queryByTestId("ai-email-kept")).toBeNull();
  });

  it("keyboard: focus stays on the button while drafting, then moves to the email; a regeneration is marked busy", async () => {
    let answer = 0;
    const first = deferred();
    const second = deferred();
    stubFetch((url) => {
      if (url.pathname !== "/api/ai/cold-email") return undefined;
      answer++;
      return answer === 1 ? first.promise : second.promise;
    });
    panel();
    screen.getByRole("button", { name: "Draft an email" }).focus();
    await userEvent.keyboard("{Enter}");
    const busy = await screen.findByRole("button", { name: "Drafting…" });
    expect(busy).not.toBeDisabled();
    expect(busy).toHaveAttribute("aria-disabled", "true");
    expect(document.activeElement).toBe(busy);
    first.release([200, okResult({ email: EMAIL })]);
    const result = await screen.findByTestId("ai-email-result");
    await waitFor(() => expect(document.activeElement).toBe(result));
    expect(result).toHaveAccessibleName("Email draft to Rahael Borchers");

    within(result).getByRole("button", { name: "Draft another version" }).focus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(result).toHaveAttribute("aria-busy", "true"));
    expect(screen.getByTestId("ai-email-stale")).toHaveTextContent(/Drafting a new version/);
    second.release([200, okResult({ email: { ...EMAIL, subject: "Version two" } })]);
    await waitFor(() =>
      expect(screen.getByTestId("ai-email-subject")).toHaveTextContent("Version two"),
    );
    expect(screen.getByTestId("ai-email-result")).not.toHaveAttribute("aria-busy");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("ai-email-result")));
  });

  it("Try again after a failure repeats the same request", async () => {
    let answer = 0;
    const calls = stubFetch((url) => {
      if (url.pathname !== "/api/ai/cold-email") return undefined;
      answer++;
      return answer === 1
        ? [AI_RESULT_STATUS.unavailable, aiFailure("unavailable")]
        : [200, okResult({ email: EMAIL })];
    });
    panel();
    await userEvent.click(screen.getByRole("radio", { name: /Bruno Mourao/ }));
    await userEvent.click(screen.getByRole("button", { name: "Draft an email" }));
    const notice = await screen.findByTestId("ai-email-failure");
    expect(within(notice).getByRole("alert")).toHaveTextContent(AI_FAILURE_MESSAGES.unavailable);
    await userEvent.click(within(notice).getByRole("button", { name: "Try again" }));
    await screen.findByTestId("ai-email-result");
    const posts = calls.filter((c) => c.method === "POST").map((c) => c.body);
    expect(posts).toEqual([
      { alumnusId: "bruno-mourao", careerSlug: "medicine", regenerate: false },
      { alumnusId: "bruno-mourao", careerSlug: "medicine", regenerate: false },
    ]);
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
