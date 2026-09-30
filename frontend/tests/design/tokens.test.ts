import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COURSE_COLORS } from "@/lib/course-color";

/**
 * Guards for the Lakeside token layer in app/globals.css: the two dark blocks stay identical, every token has a
 * dark value, and every text/background pair the components use meets WCAG AA.
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

describe("Lakeside tokens", () => {
  it("defines the dark theme identically for the system preference and data-theme=dark", () => {
    expect(darkMedia).toEqual(darkExplicit);
  });

  it("gives every light token a dark value", () => {
    expect(Object.keys(darkExplicit).sort()).toEqual(Object.keys(light).sort());
  });

  it("uses the Lakeside palette from the mockups", () => {
    expect(light).toMatchObject({
      bg: "#f4efe8",
      surface: "#fffdfa",
      "surface-2": "#efe7dc",
      fg: "#152238",
      primary: "#294878",
      "primary-wash": "#e3eaf4",
      urgent: "#c21d1d",
      taupe: "#7a6650",
    });
    expect(darkExplicit).toMatchObject({
      bg: "#0d131b",
      surface: "#141c27",
      primary: "#93b6ee",
      "primary-fill": "#3c68b0",
      urgent: "#ff6e66",
    });
    // PLAN §7: the control/source-tag border colour.
    expect(light["line-strong"]).toBe("#8a7f70");
    expect(darkExplicit["line-strong"]).toBe("#66768e");
  });

  it("keeps danger distinct from Davidson Red", () => {
    for (const t of Object.values(THEMES)) {
      expect(t.danger).not.toBe(t.urgent);
      expect(t["danger-fill"]).not.toBe(t["urgent-fill"]);
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

    it.each(["fg", "fg-2", "fg-3", "primary", "urgent", "success", "warning", "danger"])(
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
      ["on-danger", "danger-fill"],
      ["on-danger", "danger-fill-hover"],
      ["bg", "fg"],
      ["fg", "sand"],
    ])("%s on %s ≥ 4.5:1", (fg, bg) => {
      expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
    });

    it("form-control borders and decor ≥ 3:1 (non-text)", () => {
      for (const s of surfaces) {
        expect(contrast(t["line-strong"], t[s])).toBeGreaterThanOrEqual(3);
        expect(contrast(t.taupe, t[s])).toBeGreaterThanOrEqual(3);
      }
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
    expect(sizes.length).toBe(7);
    expect(Math.min(...sizes)).toBe(12);
  });
});
