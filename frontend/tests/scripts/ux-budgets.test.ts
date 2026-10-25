import { describe, expect, it } from "vitest";
import { H2_ORDER_BASELINE } from "../e2e/ux/h2-order-baseline";
import { budgetTable, judge, judgeH2Order, verdict } from "../e2e/ux/metrics";

const DOM = ["Today", "Degree progress", "Due for you"];
const SCREEN = ["Today", "Due for you", "Degree progress"];

describe("ux budgets: the h2 order check", () => {
  it("passes a page whose DOM reads in screen order, with no baseline entry", () => {
    const r = judgeH2Order(1440, { same: true, dom: DOM, visual: DOM }, undefined);
    expect(verdict(r)).toBe("PASS");
  });

  it("fails a new mismatch, with both sequences", () => {
    const r = judgeH2Order(1440, { same: false, dom: DOM, visual: SCREEN }, undefined);
    expect(verdict(r)).toBe("FAIL");
    expect(r.detail).toBe(
      "new mismatch: DOM Today > Degree progress > Due for you | screen Today > Due for you > Degree progress",
    );
  });

  it("lists a mismatch that matches its baseline exactly as KNOWN", () => {
    const r = judgeH2Order(
      1024,
      { same: false, dom: DOM, visual: SCREEN },
      { dom: DOM, visual: SCREEN },
    );
    expect(verdict(r)).toBe("KNOWN");
    expect(r).toMatchObject({ hard: true, pass: false, known: true, width: 1024 });
  });

  it("fails a known mismatch whose sequences changed", () => {
    const moved = ["Due for you", "Today", "Degree progress"];
    const r = judgeH2Order(
      390,
      { same: false, dom: DOM, visual: moved },
      { dom: DOM, visual: SCREEN },
    );
    expect(verdict(r)).toBe("FAIL");
    expect(r.detail).toMatch(/^differs from its baseline: /);
  });

  it("accepts an entry's second screen order (a tie on one row), and nothing else", () => {
    const tie = ["Today", "Degree progress", "Due for you"].reverse();
    const known = { dom: DOM, visual: SCREEN, alsoVisual: tie };
    expect(verdict(judgeH2Order(1024, { same: false, dom: DOM, visual: tie }, known))).toBe(
      "KNOWN",
    );
    expect(verdict(judgeH2Order(1024, { same: false, dom: DOM, visual: SCREEN }, known))).toBe(
      "KNOWN",
    );
    const other = ["Degree progress", "Today", "Due for you"];
    expect(verdict(judgeH2Order(1024, { same: false, dom: DOM, visual: other }, known))).toBe(
      "FAIL",
    );
  });

  it("fails a baselined page that is now in order, until its entry is removed", () => {
    const r = judgeH2Order(
      1440,
      { same: true, dom: SCREEN, visual: SCREEN },
      { dom: DOM, visual: SCREEN },
    );
    expect(verdict(r)).toBe("FAIL");
    expect(r.detail).toBe("now in order: remove its baseline entry");
  });

  it("keeps every baseline entry a real mismatch with a reason", () => {
    for (const [key, known] of Object.entries(H2_ORDER_BASELINE)) {
      expect(key).toMatch(/^[a-z0-9-]+@(1440|1024|768|390)$/);
      for (const visual of [known.visual, known.alsoVisual ?? known.visual]) {
        expect(known.dom.join(" > "), key).not.toBe(visual.join(" > "));
        expect([...known.dom].sort(), key).toEqual([...visual].sort());
      }
      expect(known.until, key).not.toBe("");
    }
  });
});

describe("ux budgets: the table", () => {
  it("says PASS, WARN, FAIL and KNOWN, with the detail after the value", () => {
    const table = budgetTable("today", [
      judge({ check: "red", op: "==", target: 1 }, 1440, 1),
      judge({ check: "words", op: "<=", target: 420 }, 1440, 876),
      judge({ check: "railLabelsVisible", op: "==", target: 6, hard: true }, 1024, 5),
      judgeH2Order(390, { same: false, dom: DOM, visual: SCREEN }, { dom: DOM, visual: SCREEN }),
    ]);
    expect(table.split("\n").slice(4, 8)).toEqual([
      "| 1440 | red | == 1 | 1 | PASS |",
      "| 1440 | words | <= 420 | 876 | WARN |",
      "| 1024 | railLabelsVisible | == 6 | 5 | FAIL |",
      "| 390 | h2Order | == 1 | 0 (known, in the baseline) | KNOWN |",
    ]);
  });

  it("escapes the pipe in a detail so the Markdown row keeps its columns", () => {
    const table = budgetTable("today", [
      judgeH2Order(390, { same: false, dom: DOM, visual: SCREEN }, undefined),
    ]);
    expect(table).toContain("Degree progress > Due for you \\| screen Today");
  });
});
