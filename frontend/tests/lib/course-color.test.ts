import { describe, expect, it } from "vitest";
import {
  COURSE_COLOR_CLASSES,
  COURSE_COLORS,
  courseColor,
  DEPARTMENT_COLORS,
  departmentColor,
  departmentOf,
  hashCode,
  normalizeDepartment,
} from "@/lib/course-color";

// Every subject code in the Davidson public course schedule for Fall 2025, Spring 2026, Fall 2026 and Spring 2027.
const DAVIDSON_SUBJECTS =
  "AFR ANT ARB ART BIO CHE CHI CIS CLA COM CSC DAN DAT DIG EAS ECO EDU ENG ENV FMD FMS FRE GER GRE GSS HIS HUM LAS LAT LIT LNG MAT MIL MUS PBH PHI PHY POL PPE PSY REL RUS SIL SOC SOU SPA THE WRI XPL".split(
    " ",
  );

describe("departmentOf", () => {
  it.each([
    ["CSC 221", "CSC"],
    ["CSC 221 A", "CSC"],
    ["csc221", "CSC"],
    ["  his 357a ", "HIS"],
    ["WRI-101", "WRI"],
  ])("%s → %s", (code, dept) => {
    expect(departmentOf(code)).toBe(dept);
  });

  it("returns an empty string when there is no department", () => {
    expect(departmentOf("")).toBe("");
    expect(departmentOf("221")).toBe("");
  });
});

describe("normalizeDepartment", () => {
  it("keeps uppercase letters only", () => {
    expect(normalizeDepartment(" c.s.c ")).toBe("CSC");
  });
});

describe("departmentColor", () => {
  it("keeps the Lakeside mockup colours", () => {
    expect(departmentColor("CSC")).toBe("lake");
    expect(departmentColor("ECO")).toBe("pine");
    expect(departmentColor("ENV")).toBe("ochre");
    expect(departmentColor("ENG")).toBe("plum");
    expect(departmentColor("HIS")).toBe("teal");
  });

  it("is deterministic and case-insensitive", () => {
    for (const dept of [...DAVIDSON_SUBJECTS, "ZZZ", "QRS", ""]) {
      expect(departmentColor(dept)).toBe(departmentColor(dept.toLowerCase()));
      expect(departmentColor(dept)).toBe(departmentColor(` ${dept} `));
      expect(COURSE_COLORS).toContain(departmentColor(dept));
    }
  });

  it("assigns every current Davidson subject explicitly, in balanced groups", () => {
    for (const dept of DAVIDSON_SUBJECTS) expect(DEPARTMENT_COLORS[dept]).toBeDefined();
    expect(Object.keys(DEPARTMENT_COLORS).sort()).toEqual([...DAVIDSON_SUBJECTS].sort());

    const perColor = new Map<string, number>();
    for (const dept of DAVIDSON_SUBJECTS) {
      const c = departmentColor(dept);
      perColor.set(c, (perColor.get(c) ?? 0) + 1);
    }
    expect(perColor.size).toBe(COURSE_COLORS.length);
    for (const n of perColor.values()) expect(n).toBeGreaterThanOrEqual(6);
  });

  it("gives often-combined departments different colours", () => {
    const stem = ["CSC", "MAT", "PHY", "CHE", "BIO"].map(departmentColor);
    expect(new Set(stem).size).toBe(stem.length);
    const humanities = ["ENG", "HIS", "PHI"].map(departmentColor);
    expect(new Set(humanities).size).toBe(humanities.length);
  });

  it("falls back to a stable hash for unknown departments", () => {
    expect(hashCode("XYZ")).toBe(hashCode("XYZ"));
    expect(hashCode("XYZ")).not.toBe(hashCode("XZY"));
    expect(departmentColor("NEWDEPT")).toBe(COURSE_COLORS[hashCode("NEWDEPT") % 8]);
    // Unknown codes spread over the whole palette.
    const seen = new Set(
      Array.from({ length: 200 }, (_, i) =>
        departmentColor(`Q${String.fromCharCode(65 + (i % 26))}${i}`),
      ),
    );
    expect(seen.size).toBe(COURSE_COLORS.length);
  });
});

describe("courseColor", () => {
  it("colours a course by its department", () => {
    expect(courseColor("CSC 221 A")).toBe("lake");
    expect(courseColor("HIS 357")).toBe(courseColor("HIS 110"));
  });
});

describe("COURSE_COLOR_CLASSES", () => {
  it("has static, token-based class names for every colour", () => {
    for (const color of COURSE_COLORS) {
      const classes = COURSE_COLOR_CLASSES[color];
      expect(classes.text).toBe(`text-course-${color}`);
      expect(classes.chip).toBe(`bg-course-${color}-wash text-course-${color}`);
      expect(classes.fill).toBe(`bg-course-${color} text-surface`);
      expect(classes.border).toBe(`border-course-${color}`);
    }
  });
});
