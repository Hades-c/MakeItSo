import { describe, expect, it } from "vitest";
import {
  cleanText,
  htmlToText,
  MAX_HTML_LENGTH,
  MAX_TEXT_LENGTH,
  MISSING_COURSE,
  permalinkFallback,
} from "@/server/programs/html";

/** An Acalog course permalink as the widget API sends it. */
function permalink(attrs: Record<string, string>, text = "") {
  const all = {
    class: "permalink",
    "data-to_type": "unlinked",
    "data-link_text": "",
    "data-anchor_text": "",
    ...attrs,
  };
  const rendered = Object.entries(all)
    .map(([key, value]) => `${key}="${value}"`)
    .join(" ");
  return `<a href="#" ${rendered}>${text}</a>`;
}

describe("htmlToText (Acalog rich text → text)", () => {
  it("puts paragraphs and line breaks on their own lines and drops inline tags", () => {
    expect(
      htmlToText(
        "<p><strong>Major Prerequisites:</strong></p>\n\n<p>One <em>or</em> two<br>lines</p>",
      ).text,
    ).toBe("Major Prerequisites:\nOne or two\nlines");
  });

  it("writes list items with markers, numbers ordered lists (honouring start) and indents nesting", () => {
    const html =
      "<ul><li>Intro:<ul><li>CSC 121</li><li>CSC 122<br>or</li></ul></li><li>Last</li></ul>" +
      '<ol start="3"><li><p>Third</p></li><li>Fourth</li></ol>';
    expect(htmlToText(html).text).toBe(
      ["- Intro:", "  - CSC 121", "  - CSC 122", "    or", "- Last", "3. Third", "4. Fourth"].join(
        "\n",
      ),
    );
  });

  it("decodes entities (in text and titles) and normalises non-breaking and zero-width spaces", () => {
    expect(htmlToText("<p>Genomics &amp; Bioinformatics&nbsp;&#8212; A B​C</p>").text).toBe(
      "Genomics & Bioinformatics — A BC",
    );
    expect(cleanText("  Race, Class, Gender &amp; Sexuality   ")).toBe(
      "Race, Class, Gender & Sexuality",
    );
  });

  it("drops scripts, styles and comments, and never passes markup through", () => {
    const { text } = htmlToText(
      '<p>Before<script>alert("x")</script><style>p{}</style><!-- note -->After</p><img src="x.png" onerror="y">',
    );
    expect(text).toBe("BeforeAfter");
    expect(text).not.toMatch(/[<>]/);
  });

  it("keeps a stray '<' as text", () => {
    expect(htmlToText("<p>GPA < 3.0 is not enough</p>").text).toBe("GPA < 3.0 is not enough");
  });

  it("turns hand-typed bullets into list markers and removes the space the markup leaves before commas", () => {
    expect(htmlToText("<p>• First</p><p>● Second</p><p>ECO 202 , ECO 203 ; ECO 205</p>").text).toBe(
      "- First\n- Second\nECO 202, ECO 203; ECO 205",
    );
  });

  it("uses a linked course permalink's own text", () => {
    const html = `<p>Take ${permalink(
      { "data-to_type": "course" },
      "AFR 330 - Decolonizing Development in Africa  ",
    )}.</p>`;
    expect(htmlToText(html)).toEqual({
      text: "Take AFR 330 - Decolonizing Development in Africa .",
      missingCourseRefs: 0,
    });
  });

  it("stands in for unlinked, empty permalinks and counts the ones whose course is unknown", () => {
    const html =
      `<ul><li>One of ${permalink({ "data-link_text": "%prefix% %code%" })} (=${permalink({})}),</li>` +
      `<li>${permalink({ "data-anchor_text": "PHY 225" })}</li>` +
      `<li>${permalink({ "data-link_text": "Economics 101" })}</li>` +
      `<li>${permalink({ "data-link_text": "%prefix% %code%: Child Development" })}</li>` +
      `<li>${permalink({ "data-link_text": "%title%" })}</li></ul>`;
    expect(htmlToText(html)).toEqual({
      text: [
        `- One of ${MISSING_COURSE} (=${MISSING_COURSE}),`,
        "- PHY 225",
        "- Economics 101",
        `- ${MISSING_COURSE}: Child Development`,
        `- ${MISSING_COURSE}`,
      ].join("\n"),
      missingCourseRefs: 4,
    });
  });

  it("handles a permalink nested in another link and one left unclosed", () => {
    const nested = `<p><a href="http://catalog.davidson.edu/x">${permalink({
      "data-link_text": "%prefix% %code% Human Physiology",
    })}</a></p>`;
    expect(htmlToText(nested)).toEqual({
      text: `${MISSING_COURSE} Human Physiology`,
      missingCourseRefs: 1,
    });
    expect(htmlToText('<p>Take <a class="permalink" data-to_type="unlinked">').text).toBe(
      `Take ${MISSING_COURSE}`,
    );
  });

  it("returns empty text for empty or missing input, and caps very long text", () => {
    expect(htmlToText(null)).toEqual({ text: "", missingCourseRefs: 0 });
    expect(htmlToText("<p> </p><ul><li></li></ul>")).toEqual({ text: "", missingCourseRefs: 0 });
    const long = htmlToText(`<p>${"word ".repeat(20_000)}</p>`).text;
    expect(long.length).toBe(MAX_TEXT_LENGTH);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("htmlToText on malformed input", () => {
  it("reads unclosed tags as text in linear time", () => {
    for (const unit of ["<a", '<a "', "<a x='", '<p class="x']) {
      const started = performance.now();
      const { text } = htmlToText(unit.repeat(32_000));
      expect(performance.now() - started, unit).toBeLessThan(1_000);
      expect(text.length).toBeGreaterThan(0);
    }
    expect(htmlToText("Take <a CSC 121").text).toBe("Take <a CSC 121");
    expect(htmlToText('<p title="a > b">kept</p>').text).toBe("kept");
  });

  it(`reads at most ${MAX_HTML_LENGTH} characters of HTML`, () => {
    const html = `<p>${"x".repeat(MAX_HTML_LENGTH)}</p><p>after the cut</p>`;
    expect(htmlToText(html).text).not.toContain("after the cut");
  });
});

describe("permalinkFallback", () => {
  it("prefers the anchor text, then the literal part of the link template, then the placeholder", () => {
    expect(permalinkFallback({ "data-anchor_text": "HIS 414 Mapping Medieval Europe" })).toEqual({
      text: "HIS 414 Mapping Medieval Europe",
      missing: false,
    });
    expect(
      permalinkFallback({ "data-link_text": "%prefix% %code%/CSC 209 Bioinformatics" }),
    ).toEqual({
      text: `${MISSING_COURSE}/CSC 209 Bioinformatics`,
      missing: true,
    });
    expect(permalinkFallback({ "data-link_text": " %prefix% %code% %name%" })).toEqual({
      text: MISSING_COURSE,
      missing: true,
    });
    expect(permalinkFallback({})).toEqual({ text: MISSING_COURSE, missing: true });
  });
});
