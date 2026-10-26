import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COURSE_COLORS } from "@/lib/course-color";

/**
 * Guards for the token layer in app/globals.css (Davidson's official colours, the owner's choice of 2026-10-25): the
 * two dark blocks stay identical, every token has a dark value, and every text/background pair the components use
 * meets WCAG AA.
 */
const css = readFileSync(fileURLToPath(new URL("../../app/globals.css", import.meta.url)), "utf8");

type Tokens = Record<string, string>;

function block(startPattern: RegExp): Tokens {
  const start = css.search(startPattern);
  if (start < 0) throw new Error(`block not found: ${startPattern}`);
  const open = css.indexOf("{", start);
  let depth = 0;
  let end = open;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) {
      end = i;
      break;
    }
  }
  const body = css.slice(open + 1, end).replace(/\/\*[\s\S]*?\*\//g, "");
  const tokens: Tokens = {};
  for (const m of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    if (m[1] && m[2]) tokens[m[1]] = m[2].trim();
  }
  return tokens;
}

const light = block(/^:root \{/m);
const darkMedia = block(/:root:not\(\[data-theme="light"\]\) \{/);
const darkExplicit = block(/^:root\[data-theme="dark"\] \{/m);

function hex(value: string | undefined): [number, number, number] {
  if (!value) throw new Error("missing token");
  const m = /^#([0-9a-f]{6})$/i.exec(value);
  if (!m?.[1]) throw new Error(`not a 6-digit hex colour: ${value}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(value: string | undefined): number {
  const [r, g, b] = hex(value).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string | undefined, b: string | undefined): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const THEMES = { light, dark: darkExplicit } as const;

describe("design tokens", () => {
  it("defines the dark theme identically for the system preference and data-theme=dark", () => {
    expect(darkMedia).toEqual(darkExplicit);
  });

  it("gives every light token a dark value", () => {
    expect(Object.keys(darkExplicit).sort()).toEqual(Object.keys(light).sort());
  });

  it("uses Davidson's official colours: white ground, Davidson Black text, Davidson Red fills", () => {
    expect(light).toMatchObject({
      bg: "#ffffff",
      surface: "#ffffff",
      "surface-2": "#f3f4f6",
      fg: "#0f1012", // Davidson Black
      primary: "#c21d1d",
      "primary-fill": "#d42121", // Davidson Red, PMS 3546 C
      "primary-wash": "#fdeeee",
      urgent: "#c21d1d",
      "urgent-fill": "#d42121",
      "nav-mark": "#d42121",
      link: "#0f1012",
      taupe: "#7a6650",
    });
    expect(darkExplicit).toMatchObject({
      bg: "#0d131b",
      surface: "#141c27",
      primary: "#ff6e66",
      "primary-fill": "#d42121",
      urgent: "#ff6e66",
      "nav-mark": "#ff6e66",
    });
    // PLAN §7: the control/source-tag border colour.
    expect(light["line-strong"]).toBe("#80868f");
    expect(darkExplicit["line-strong"]).toBe("#66768e");
  });

  it("never makes a text link red: links are the text colour, underlined", () => {
    for (const t of Object.values(THEMES)) {
      expect(t.link).toBe(t.fg);
      expect([t.primary, t["primary-fill"], t.urgent]).not.toContain(t.link);
    }
  });

  it("keeps danger distinct from Davidson Red, and never a fill (destructive buttons are outlined)", () => {
    for (const t of Object.values(THEMES)) {
      expect(t.danger).not.toBe(t.urgent);
      expect(t.danger).not.toBe(t.primary);
      expect(Object.keys(t).filter((name) => /^(danger-fill|on-danger)/.test(name))).toEqual([]);
    }
  });

  it("keeps the focus ring off red", () => {
    for (const t of Object.values(THEMES)) {
      expect([t.urgent, t["urgent-fill"], t.danger]).not.toContain(t.focus);
      expect(contrast(t.focus, t.bg)).toBeGreaterThanOrEqual(3);
      expect(contrast(t.focus, t.surface)).toBeGreaterThanOrEqual(3);
    }
  });

  describe.each(Object.entries(THEMES))("%s theme contrast (WCAG AA)", (_name, t) => {
    const surfaces = ["bg", "surface", "surface-2"] as const;

    it.each(["fg", "fg-2", "fg-3", "primary", "urgent", "success", "warning", "danger", "link"])(
      "%s text ≥ 4.5:1 on every surface",
      (text) => {
        for (const s of surfaces) expect(contrast(t[text], t[s])).toBeGreaterThanOrEqual(4.5);
      },
    );

    it.each([
      ["primary", "primary-wash"],
      ["fg-3", "primary-wash"],
      ["urgent", "urgent-wash"],
      ["success", "success-wash"],
      ["warning", "warning-wash"],
      ["danger", "danger-wash"],
      ["on-primary", "primary-fill"],
      ["on-primary", "primary-fill-hover"],
      ["on-urgent", "urgent-fill"],
      ["bg", "fg"],
      ["fg", "sand"],
    ])("%s on %s ≥ 4.5:1", (fg, bg) => {
      expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
    });

    it("form-control borders, link underlines and decor ≥ 3:1 (non-text)", () => {
      for (const s of surfaces) {
        expect(contrast(t["line-strong"], t[s])).toBeGreaterThanOrEqual(3);
        expect(contrast(t["link-line"], t[s])).toBeGreaterThanOrEqual(3);
        expect(contrast(t.taupe, t[s])).toBeGreaterThanOrEqual(3);
      }
    });

    it("current-page marker ≥ 3:1 on the nav pill and on the bars (the pill's tint alone is not a cue)", () => {
      expect(contrast(t["nav-mark"], t["primary-wash"])).toBeGreaterThanOrEqual(3);
      expect(contrast(t["nav-mark"], t.surface)).toBeGreaterThanOrEqual(3);
    });

    it("primary fill ≥ 3:1 against the page and the card (a filled control's own edge)", () => {
      for (const s of ["bg", "surface"]) {
        expect(contrast(t["primary-fill"], t[s])).toBeGreaterThanOrEqual(3);
      }
    });

    it("selection outline (--primary, the Add to plan term tile) ≥ 3:1 on the control and the tile", () => {
      expect(contrast(t.primary, t["surface-2"])).toBeGreaterThanOrEqual(3);
      expect(contrast(t.primary, t.surface)).toBeGreaterThanOrEqual(3);
    });

    it.each([...COURSE_COLORS])("course colour %s is readable on its wash and on surfaces", (c) => {
      const text = t[`course-${c}`];
      expect(contrast(text, t[`course-${c}-wash`])).toBeGreaterThanOrEqual(4.5);
      for (const s of surfaces) expect(contrast(text, t[s])).toBeGreaterThanOrEqual(4.5);
      // Index-card tab: surface-coloured text on the solid course colour.
      expect(contrast(t.surface, text)).toBeGreaterThanOrEqual(4.5);
    });
  });

  it("has a type scale with a 12px floor", () => {
    const sizes = [...css.matchAll(/--text-(\w+):\s*([\d.]+)rem;/g)].map((m) => Number(m[2]) * 16);
    expect(sizes.length).toBe(8);
    expect(Math.min(...sizes)).toBe(12);
    // The rail labels' own size (spec §5.8): 13px, the only size between 12 and 14.
    expect(css).toMatch(/--text-nav:\s*0\.8125rem;/);
  });

  it("keeps keyboard focus clear of the sticky top bar and the phone bottom tabs on every page (WCAG 2.4.11)", () => {
    const html = css.match(/\n  html \{[\s\S]*?\n  \}\n/)?.[0] ?? "";
    expect(html).toMatch(/scroll-padding-top:\s*4\.5rem/);
    // Same breakpoint as the bottom tabs (md:hidden, md = 45rem = 720px), cleared by more than the tab height.
    expect(css).toMatch(/--breakpoint-md:\s*45rem/);
    expect(html).toMatch(
      /@media \(width < 45rem\) \{\s*scroll-padding-bottom:\s*calc\(4\.5rem \+ env\(safe-area-inset-bottom\)\)/,
    );
  });
});
