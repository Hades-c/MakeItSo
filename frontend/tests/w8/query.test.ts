import { describe, expect, it } from "vitest";
import {
  COURSES_PAGE_SIZE,
  coursesHref,
  hasFilters,
  parseCoursesQuery,
  TIME_OPTIONS,
  timeLabel,
} from "@/app/(hub)/courses/_lib/query";
import { activeFilters } from "@/app/(hub)/courses/_components/course-filters";

/** /courses URL state (PLAN §7): parse, rebuild and remove filters; a bad param is dropped, never a 500. */

describe("parseCoursesQuery", () => {
  it("parses every filter from repeated params", () => {
    const { query, ignored } = parseCoursesQuery({
      term: "202602",
      q: "  data   science ",
      dept: ["CSC", "MAT"],
      req: "MQRQ",
      days: ["M", "W"],
      after: "09:00",
      before: "15:00",
      openOnly: "true",
      level: ["200", "300"],
      page: "2",
    });
    expect(ignored).toEqual([]);
    expect(query).toMatchObject({
      term: "202602",
      q: "data science",
      dept: ["CSC", "MAT"],
      req: ["MQRQ"],
      days: ["M", "W"],
      after: "09:00",
      before: "15:00",
      openOnly: true,
      level: ["200", "300"],
      page: 2,
      pageSize: COURSES_PAGE_SIZE,
    });
  });

  it("treats empty form fields as no filter (an empty select submits '')", () => {
    const { query, ignored } = parseCoursesQuery({ q: "", dept: "", req: "", after: "", term: "" });
    expect(ignored).toEqual([]);
    expect(query.term).toBeUndefined();
    expect(query.dept).toEqual([]);
    expect(hasFilters(query)).toBe(false);
  });

  it("drops only the invalid params and reports them", () => {
    const { query, ignored } = parseCoursesQuery({
      q: "chem",
      term: "000001",
      req: "BOGUS",
      after: "25:00",
      page: "abc",
    });
    expect(ignored.sort()).toEqual(["after", "page", "req", "term"]);
    expect(query.q).toBe("chem");
    expect(query.page).toBe(1);
    expect(query.term).toBeUndefined();
  });

  it("drops a reversed time window rather than swapping it", () => {
    const { query, ignored } = parseCoursesQuery({ after: "15:00", before: "09:00" });
    expect(ignored).toEqual(["after", "before"]);
    expect(query.after).toBeUndefined();
    expect(query.before).toBeUndefined();
  });

  it("ignores unknown params", () => {
    const { query, ignored } = parseCoursesQuery({ utm: "x", q: "art" });
    expect(ignored).toEqual([]);
    expect(query.q).toBe("art");
  });
});

describe("coursesHref", () => {
  const { query } = parseCoursesQuery({ q: "data", dept: ["CSC"], page: "3" });

  it("keeps the state, makes the term explicit and resets the page on a change", () => {
    expect(coursesHref(query, "202602")).toBe("/courses?term=202602&q=data&dept=CSC");
    expect(coursesHref(query, "202602", { openOnly: true })).toBe(
      "/courses?term=202602&q=data&dept=CSC&openOnly=true",
    );
    expect(coursesHref(query, "202602", { page: 4 })).toBe(
      "/courses?term=202602&q=data&dept=CSC&page=4",
    );
  });

  it("round-trips through parseCoursesQuery", () => {
    const href = coursesHref(query, "202602", { days: ["T", "R"], after: "12:00" });
    const params = Object.fromEntries(
      [...new URL(href, "http://x").searchParams.keys()].map((key) => [
        key,
        new URL(href, "http://x").searchParams.getAll(key),
      ]),
    );
    expect(parseCoursesQuery(params).query).toMatchObject({
      term: "202602",
      q: "data",
      dept: ["CSC"],
      days: ["T", "R"],
      after: "12:00",
      page: 1,
    });
  });
});

describe("activeFilters", () => {
  it("lists each filter with the link that removes only it", () => {
    const { query } = parseCoursesQuery({
      q: "data",
      dept: ["CSC", "MAT"],
      req: "MQRQ",
      days: ["M", "W"],
      openOnly: "true",
      before: "15:00",
      level: "200",
    });
    const filters = activeFilters(query, "202602", {
      dept: new Map([["CSC", "Computer Science"]]),
      req: new Map([["MQRQ", "Math & Quantitative Thought"]]),
    });
    expect(filters.map((f) => f.label)).toEqual([
      "“data”",
      "Computer Science",
      "MAT",
      "Math & Quantitative Thought",
      "Only Mon, Wed",
      "Ends by 3:00 pm",
      "Open seats",
      "200-level",
    ]);
    const csc = filters.find((f) => f.key === "dept-CSC")!;
    expect(csc.href).toBe(
      "/courses?term=202602&q=data&dept=MAT&req=MQRQ&days=M&days=W&before=15%3A00&openOnly=true&level=200",
    );
    expect(filters.find((f) => f.key === "q")!.href).not.toMatch(/[?&]q=/);
  });
});

describe("time options", () => {
  it("runs every half hour from 7 am to 10 pm with readable labels", () => {
    expect(TIME_OPTIONS[0]).toEqual({ value: "07:00", label: "7:00 am" });
    expect(TIME_OPTIONS.at(-1)).toEqual({ value: "22:00", label: "10:00 pm" });
    expect(timeLabel("12:30")).toBe("12:30 pm");
    expect(timeLabel("12:10")).toBe("12:10");
  });
});
